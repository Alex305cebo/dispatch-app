// Shared map-data builder for a load's pickup→delivery route + the live truck
// position hauling it — used by both the truck page (its current assignment) and a
// load's own page (this specific load, regardless of whether it's currently the
// truck's "active" one).

import type { LoadRecord, TruckRecord } from './map'
import type { FleetStatus } from './maintenance-core'
import { cityCoordsBest, deliveryInfoBest } from './geo-routing'
import { headingOf } from './eld'
import { driveTime } from './fmt'
import { zoneFor } from './tz'
import { t, type Locale } from './i18n.ts'
import type { MapMarker, MapRoute } from '@/components/fleet-map'

// ELD duty codes → colour bucket for the live badge.
export function statusTone(s: string | null): 'move' | 'on' | 'rest' {
  if (!s) return 'rest'
  if (/mi\/h|^d$/i.test(s)) return 'move'
  if (/^on$/i.test(s)) return 'on'
  return 'rest'
}

export type LoadMapData = {
  markers: MapMarker[]
  routes: MapRoute[]
  etaText: string | null
  /** Total road miles of the drawn route — shown big over the map. */
  miles: number | null
  /** Минуты до выгрузки отдельным числом. Раньше наружу отдавалась только готовая
   * строка «82 mi · ~1ч 34м до delivery», и разложить её на отдельные плитки без
   * разбора текста было нельзя. Форматирует уже вызывающий, под своё место. */
  etaMin: number | null
}

/** How old an ELD fix may be before we stop presenting it as "where the truck is now".
 * A rolling truck covers ~15 miles in 15 minutes, so an older pin actively lies. Note
 * fleet_status.updated_at is when WE polled — eld_seen is when the DEVICE last reported,
 * and only the latter says anything about the position's real age (measured: a unit whose
 * device had been silent two days still showed updated_at "16 min ago"). */
const STALE_GPS_MS = 30 * 60 * 1000

function ageText(ms: number, locale: Locale): string {
  const min = Math.max(0, Math.round(ms / 60000))
  if (min < 60) return locale === 'ru' ? `${min} мин` : `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return locale === 'ru' ? `${h} ч` : `${h} h`
  return locale === 'ru' ? `${Math.round(h / 24)} дн` : `${Math.round(h / 24)} d`
}

export async function loadMapData(
  load: LoadRecord | null,
  truck: TruckRecord,
  fs: FleetStatus | undefined,
  locale: Locale,
): Promise<LoadMapData> {
  const markers: MapMarker[] = []
  const routes: MapRoute[] = []
  let etaText: string | null = null
  let miles: number | null = null
  let etaMin: number | null = null

  // Prefer the RC's exact street address over the bare city — pins the real dock,
  // not just the city center. Falls back to ZIP then city if OSM can't resolve that
  // specific address (common for rural/warehouse addresses).
  const pickup = await cityCoordsBest(load?.pickupAddress, load?.origin)

  const lat = fs?.lat ?? null
  const lng = fs?.lng ?? null
  // A FINISHED load is history: the truck has long since moved on — usually onto another
  // load — so drawing its live position here, plus a route from it to this load's delivery,
  // points at places that have nothing to do with this load (reported: a delivered load
  // showed the truck a state away, already assigned to the next haul). For anything not
  // currently being run, draw the load's OWN pickup→delivery route and no live truck.
  const isActive = load == null || load.status === 'booked' || load.status === 'in_transit'
  const noGps = lat == null || lng == null

  if (load && (!isActive || noGps)) {
    // Geocode the destination on its own rather than only as the end of a route from the
    // pickup: if the pickup address can't be resolved, the delivery pin must still show —
    // losing the whole map is worse than losing one pin.
    const dest = await cityCoordsBest(load.deliveryAddress, load.destination)
    if (pickup) {
      markers.push({
        lat: pickup.lat,
        lng: pickup.lng,
        label: `${t(locale, 'tracking.pickupPrefix')}${load.origin}`,
        sub: [load.pickupTime || (load.pickupDate ? load.pickupDate.slice(0, 10) : null)].filter(Boolean).join('\n'),
        kind: 'pickup',
        href: `/loads/${load.id}`,
      })
    }
    if (dest) {
      markers.push({
        lat: dest.lat,
        lng: dest.lng,
        label: `Delivery · ${load.destination}`,
        sub: load.origin ? `${t(locale, 'tracking.fromPrefix')}${load.origin}` : undefined,
        kind: 'dest',
        href: `/loads/${load.id}`,
      })
    }
    if (pickup && dest) {
      const leg = await deliveryInfoBest(pickup, load.deliveryAddress, load.destination)
      routes.push({ from: [pickup.lat, pickup.lng], to: [dest.lat, dest.lng], coords: leg?.coords })
      miles = leg?.miles ?? (load.loadedMiles > 0 ? load.loadedMiles : null)
    }
    return { markers, routes, etaText, miles, etaMin }
  }
  if (noGps) return { markers, routes, etaText, miles, etaMin }

  // Age of the fix itself, not of our last poll — a stale pin is greyed out and says so
  // instead of pretending the truck is standing there right now.
  const seenMs = fs?.eldSeen ? Date.parse(fs.eldSeen) : NaN
  const gpsAge = Number.isNaN(seenMs) ? null : Math.max(0, Date.now() - seenMs)
  const stale = gpsAge !== null && gpsAge > STALE_GPS_MS

  const heading = truck.number ? await headingOf(truck.number, lat, lng).catch(() => null) : null
  const truckM: MapMarker = {
    lat,
    lng,
    zone: zoneFor(lat, lng) ?? undefined,
    label: truck.number ?? truck.name,
    sub: [
      fs?.location,
      fs?.driveStatus,
      gpsAge === null
        ? null
        : (stale ? t(locale, 'tracking.gpsStale') : t(locale, 'tracking.gpsAgo')).replace(
            '{age}',
            ageText(gpsAge, locale),
          ),
    ]
      .filter(Boolean)
      .join('\n'),
    tone: stale ? 'rest' : statusTone(fs?.driveStatus ?? null),
    kind: 'truck',
    heading: stale ? undefined : (heading ?? undefined),
    href: `/trucks/${truck.id}`,
  }
  // Not picked up yet: the real road ahead is truck → pickup (the actual deadhead)
  // → delivery (the loaded miles) — never a straight line to delivery that skips
  // the pickup stop entirely.
  let legToPickup: Awaited<ReturnType<typeof deliveryInfoBest>> = null
  let legToDelivery: Awaited<ReturnType<typeof deliveryInfoBest>> = null
  if (load?.status === 'booked' && pickup) {
    ;[legToPickup, legToDelivery] = await Promise.all([
      deliveryInfoBest({ lat, lng }, load.pickupAddress, load.origin),
      deliveryInfoBest(pickup, load.deliveryAddress, load.destination),
    ])
  } else if (load) {
    legToDelivery = await deliveryInfoBest({ lat, lng }, load.deliveryAddress, load.destination)
  }

  // Only while still booked — once picked up, the truck IS at/past this stop and
  // the pin has nothing left to say, just a second (wrong-looking) dot on the map.
  if (pickup && load?.status === 'booked') {
    markers.push({
      lat: pickup.lat,
      lng: pickup.lng,
      label: `${t(locale, 'tracking.pickupPrefix')}${load.origin}`,
      sub: [load.pickupTime || (load.pickupDate ? load.pickupDate.slice(0, 10) : null)]
        .filter(Boolean)
        .join('\n'),
      kind: 'pickup',
      href: `/loads/${load.id}`,
    })
  }

  if (legToDelivery && load) {
    const routeMiles = (legToPickup?.miles ?? 0) + legToDelivery.miles
    miles = routeMiles
    const routeEtaMin = (legToPickup?.etaMin ?? 0) + legToDelivery.etaMin
    etaMin = routeEtaMin
    etaText = `${routeMiles} mi · ~${driveTime(routeEtaMin, locale)}${t(locale, 'tracking.toDelivery')}`
    truckM.eta = etaText
    if (legToPickup && pickup) {
      routes.push({ from: [lat, lng], to: [pickup.lat, pickup.lng], coords: legToPickup.coords })
      routes.push({
        from: [pickup.lat, pickup.lng],
        to: [legToDelivery.lat, legToDelivery.lng],
        coords: legToDelivery.coords,
      })
    } else {
      routes.push({ from: [lat, lng], to: [legToDelivery.lat, legToDelivery.lng], coords: legToDelivery.coords })
    }
    markers.push({
      lat: legToDelivery.lat,
      lng: legToDelivery.lng,
      label: `Delivery · ${load.destination}`,
      sub: load.origin ? `${t(locale, 'tracking.fromPrefix')}${load.origin}` : undefined,
      kind: 'dest',
      href: `/loads/${load.id}`,
    })
  }

  markers.push(truckM)
  return { markers, routes, etaText, miles, etaMin }
}
