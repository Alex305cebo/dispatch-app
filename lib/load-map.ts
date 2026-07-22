// Shared map-data builder for a load's pickup→delivery route + the live truck
// position hauling it — used by both the truck page (its current assignment) and a
// load's own page (this specific load, regardless of whether it's currently the
// truck's "active" one).

import type { LoadRecord, TruckRecord } from './map'
import type { FleetStatus } from './maintenance-core'
import { cityCoordsBest, deliveryInfoBest } from './geo-routing'
import { headingOf } from './eld'
import { driveTime } from './fmt'
import type { MapMarker, MapRoute } from '@/components/fleet-map'

// ELD duty codes → colour bucket for the live badge.
export function statusTone(s: string | null): 'move' | 'on' | 'rest' {
  if (!s) return 'rest'
  if (/mi\/h|^d$/i.test(s)) return 'move'
  if (/^on$/i.test(s)) return 'on'
  return 'rest'
}

export type LoadMapData = { markers: MapMarker[]; routes: MapRoute[]; etaText: string | null }

export async function loadMapData(
  load: LoadRecord | null,
  truck: TruckRecord,
  fs: FleetStatus | undefined,
): Promise<LoadMapData> {
  const markers: MapMarker[] = []
  const routes: MapRoute[] = []
  let etaText: string | null = null
  const lat = fs?.lat ?? null
  const lng = fs?.lng ?? null
  if (lat == null || lng == null) return { markers, routes, etaText }

  const heading = truck.number ? await headingOf(truck.number, lat, lng).catch(() => null) : null
  const truckM: MapMarker = {
    lat,
    lng,
    label: truck.number ?? truck.name,
    sub: [fs?.location, fs?.driveStatus].filter(Boolean).join('\n'),
    tone: statusTone(fs?.driveStatus ?? null),
    kind: 'truck',
    heading: heading ?? undefined,
    href: `/trucks/${truck.id}`,
  }

  // Prefer the RC's exact street address over the bare city — pins the real dock,
  // not just the city center. Falls back to ZIP then city if OSM can't resolve that
  // specific address (common for rural/warehouse addresses).
  const pickup = await cityCoordsBest(load?.pickupAddress, load?.origin)
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
      label: `Пикап · ${load.origin}`,
      sub: [load.pickupTime || (load.pickupDate ? load.pickupDate.slice(0, 10) : null)]
        .filter(Boolean)
        .join('\n'),
      kind: 'pickup',
      href: `/loads/${load.id}`,
    })
  }

  if (legToDelivery && load) {
    const routeMiles = (legToPickup?.miles ?? 0) + legToDelivery.miles
    const routeEtaMin = (legToPickup?.etaMin ?? 0) + legToDelivery.etaMin
    etaText = `${routeMiles} mi · ~${driveTime(routeEtaMin)} до delivery`
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
      sub: load.origin ? `Из ${load.origin}` : undefined,
      kind: 'dest',
      href: `/loads/${load.id}`,
    })
  }

  markers.push(truckM)
  return { markers, routes, etaText }
}
