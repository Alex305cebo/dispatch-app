import { sql } from '@/lib/db'
import { listTrucks, currentLoadForTruck } from '@/lib/loads'
import { truckLabel, eldStatus } from '@/lib/map'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { EldLinks } from '@/components/eld-links'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { FleetList, type TrackingRow } from '@/components/fleet-list'
import { cityCoordsBest, deliveryInfoBest } from '@/lib/geo-routing'
import { headingOf, idleSince } from '@/lib/eld'
import { activeAlert, type WeatherAlert } from '@/lib/weather'
import { getSetting } from '@/lib/settings'
import { agoText, driveTime } from '@/lib/fmt'
import { t as tr } from '@/lib/i18n'
import { Info } from '@/components/info'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

type FS = {
  unit: string
  driver_name: string | null
  drive_status: string | null
  location: string | null
  lat: number | null
  lng: number | null
  eld_seen: string | null
  updated_at: string
}

export default async function Page() {
  const companyId = await companyScope()
  const locale = await getLocale()
  const trucks = await listTrucks(companyId)
  const shareRaw = await getSetting('eld_share_tokens')
  const shareCount = shareRaw ? (JSON.parse(shareRaw) as string[]).length : 0
  const [rowsRaw, phoneRowsRaw] = await Promise.all([
    sql`SELECT * FROM fleet_status`,
    sql`SELECT truck_id, driver_phone FROM truck_meta`,
  ])
  const rows = rowsRaw as FS[]
  const phoneRows = phoneRowsRaw as { truck_id: number; driver_phone: string | null }[]
  const byUnit = new Map(rows.map((r) => [r.unit, r]))
  const phoneById = new Map(phoneRows.map((r) => [r.truck_id, r.driver_phone]))
  // Freshest row, not an arbitrary one — SELECT * has no ORDER BY, so rows[0] was
  // whichever the DB happened to return and could under-report how current we are.
  const snapshotMs = rows.reduce(
    (max, r) => Math.max(max, new Date(r.updated_at).getTime()),
    0,
  )
  const snapshot = snapshotMs > 0 ? new Date(snapshotMs).toISOString() : null
  const staleMinutes = snapshotMs > 0 ? Math.round((Date.now() - snapshotMs) / 60000) : null

  // One pass per truck, fully parallel: current load, route legs, weather, idle time.
  const perTruck = await Promise.all(
    trucks.map(async (t) => {
      const fs = t.number ? byUnit.get(t.number) : undefined
      const load = await currentLoadForTruck(companyId, t.id)
      // Pickup is a fixed address, not relative to the truck — geocode it independent
      // of whether we have live GPS (unlike the route legs below, which route FROM
      // the truck's fix). Prefer the exact street address the RC printed; falls back
      // to ZIP then city if OSM can't resolve that address.
      const pickup = await cityCoordsBest(load?.pickupAddress, load?.origin)
      let legToPickup: Awaited<ReturnType<typeof deliveryInfoBest>> = null
      let legToDelivery: Awaited<ReturnType<typeof deliveryInfoBest>> = null
      let weather: WeatherAlert | null = null
      let idleAt: Date | null = null
      let heading: number | null = null
      if (fs && fs.lat !== null && fs.lng !== null) {
        const pt = { lat: fs.lat, lng: fs.lng }
        ;[weather, idleAt, heading] = await Promise.all([
          activeAlert(pt.lat, pt.lng).catch(() => null),
          t.number ? idleSince(t.number, pt.lat, pt.lng).catch(() => null) : Promise.resolve(null),
          t.number ? headingOf(t.number, pt.lat, pt.lng).catch(() => null) : Promise.resolve(null),
        ])
        if (load) {
          // Not picked up yet: the real road ahead is truck → pickup (the actual
          // deadhead) → delivery (the loaded miles) — never a straight line to
          // delivery that skips the pickup stop entirely.
          if (load.status === 'booked' && pickup) {
            ;[legToPickup, legToDelivery] = await Promise.all([
              deliveryInfoBest(pt, load.pickupAddress, load.origin),
              deliveryInfoBest(pickup, load.deliveryAddress, load.destination),
            ])
          } else {
            legToDelivery = await deliveryInfoBest(pt, load.deliveryAddress, load.destination)
          }
        }
      }
      return { t, fs, load, pickup, legToPickup, legToDelivery, weather, idleAt, heading }
    }),
  )

  // Only trucks with real coordinates land on the map — the rest wait for the API.
  // For each one, drop a second point at its active load's delivery city and draw a
  // line to it. Fleet composition below replaces the old "read-only snapshot" note:
  // who's rolling right now, and who has no GPS coverage at all.
  const markers: MapMarker[] = []
  const routes: MapRoute[] = []
  const trackingRows: TrackingRow[] = []
  let moving = 0
  let onDuty = 0
  let resting = 0
  let noGps = 0
  let totalDeliveryMiles = 0

  for (const { t, fs, load, pickup, legToPickup, legToDelivery, weather, idleAt, heading } of perTruck) {
    // Unconditional on load — a parked empty truck shouldn't say "moving" either.
    const idleHoursAny = idleAt ? Math.floor((Date.now() - idleAt.getTime()) / 3_600_000) : null
    const st = eldStatus(fs?.drive_status ?? null, idleHoursAny, locale)
    if (st.tone === 'move') moving++
    else if (st.tone === 'on') onDuty++
    else resting++
    const hasGps = !!fs && fs.lat !== null && fs.lng !== null
    if (!hasGps) noGps++

    // A truck with an active load that hasn't moved in hours is worth a flag
    // (detention, breakdown). An idle EMPTY truck is just parked — unremarkable.
    const idleHoursRaw = load && idleAt ? idleHoursAny : null

    // Real total to delivery: deadhead (truck→pickup) + loaded miles (pickup→delivery)
    // when the load hasn't been picked up yet, or just the direct leg once it has.
    const totalMiles = (legToPickup?.miles ?? 0) + (legToDelivery?.miles ?? 0)
    const totalEtaMin = (legToPickup?.etaMin ?? 0) + (legToDelivery?.etaMin ?? 0)

    // Pickup pin — only while the load is still booked (not yet picked up). Once
    // it's in_transit the truck IS at/past the pickup and this pin has nothing left
    // to say — leaving it up read as a second, wrong location for the same stop
    // (reported live: driver already at pickup, pin still sitting somewhere else).
    if (pickup && load && load.status === 'booked') {
      markers.push({
        lat: pickup.lat,
        lng: pickup.lng,
        label: `${tr(locale, 'tracking.pickupPrefix')}${load.origin}`,
        sub: [load.pickupTime || (load.pickupDate ? load.pickupDate.slice(0, 10) : null)]
          .filter(Boolean)
          .join('\n'),
        kind: 'pickup',
        href: `/loads/${load.id}`,
      })
    }

    let delivery: TrackingRow['delivery'] = null
    if (hasGps && fs && legToDelivery && load) {
      delivery = { to: load.destination ?? '—', miles: totalMiles, etaMin: totalEtaMin }
      totalDeliveryMiles += totalMiles
      if (legToPickup && pickup) {
        routes.push({ from: [fs.lat!, fs.lng!], to: [pickup.lat, pickup.lng], coords: legToPickup.coords })
        routes.push({
          from: [pickup.lat, pickup.lng],
          to: [legToDelivery.lat, legToDelivery.lng],
          coords: legToDelivery.coords,
        })
      } else {
        routes.push({
          from: [fs.lat!, fs.lng!],
          to: [legToDelivery.lat, legToDelivery.lng],
          coords: legToDelivery.coords,
        })
      }
      markers.push({
        lat: legToDelivery.lat,
        lng: legToDelivery.lng,
        label: `Delivery · ${load.destination}`,
        sub: load.origin ? `${tr(locale, 'tracking.fromPrefix')}${load.origin}` : undefined,
        kind: 'dest',
        href: `/loads/${load.id}`,
      })
    }
    if (hasGps && fs) {
      markers.push({
        lat: fs.lat!,
        lng: fs.lng!,
        label: truckLabel(t),
        sub: [st.text, weather ? `⚠ ${weather.event}` : null, fs.location].filter(Boolean).join('\n'),
        tone: st.tone,
        kind: 'truck',
        heading: heading ?? undefined,
        eta: legToDelivery ? `${totalMiles} mi · ~${driveTime(totalEtaMin, locale)}${tr(locale, 'tracking.toDelivery')}` : undefined,
        href: `/trucks/${t.id}`,
      })
    }

    trackingRows.push({
      id: t.id,
      label: truckLabel(t),
      city: fs?.location ?? null,
      eldSeen: fs?.eld_seen ?? null,
      statusText: st.text,
      statusTone: st.tone,
      hasLoad: !!load,
      loadId: load?.id ?? null,
      loadRoute: load ? `${load.origin ?? '—'} → ${load.destination ?? '—'}` : null,
      phone: phoneById.get(t.id) ?? null,
      delivery,
      driveTimeText: legToDelivery ? driveTime(totalEtaMin, locale) : null,
      weather: weather ? { event: weather.event, headline: weather.headline } : null,
      idleHours: idleHoursRaw !== null && idleHoursRaw >= 3 ? idleHoursRaw : null,
      unavailable: t.unavailable,
    })
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          {tr(locale, 'tracking.title')}
          <Info side="bottom" text={tr(locale, 'tracking.infoText')} />
        </h1>
        <p className="text-[13px] text-white/65">
          {tr(locale, 'tracking.subtitle')}
        </p>
      </header>

      <EldLinks count={shareCount} />

      <div className="mb-4">
        <FleetMap markers={markers} routes={routes} />
      </div>

      <div className="panel mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[12px]">
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="size-2 rounded-full bg-good-500" /> {moving} {tr(locale, 'tracking.moving')}
        </span>
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="size-2 rounded-full bg-haul-500" /> {onDuty} on duty
        </span>
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="size-2 rounded-full bg-white/30" /> {resting} {tr(locale, 'tracking.resting')}
        </span>
        {noGps > 0 && (
          <span className="flex items-center gap-1.5 text-warn-400">
            <span className="size-2 rounded-full bg-warn-400" /> {noGps} {tr(locale, 'tracking.noGpsBadge')}
          </span>
        )}
        {totalDeliveryMiles > 0 && (
          <span className="text-white/60">
            <span className="nums text-white/85">{totalDeliveryMiles.toLocaleString('en-US')} mi</span>{' '}
            {tr(locale, 'tracking.fleetTotalSuffix')}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-white/40">
          {snapshot ? `${tr(locale, 'tracking.updatedPrefix')}${agoText(snapshot, locale)}` : tr(locale, 'tracking.noSnapshotYet')}
          <RefreshFleetButton staleMinutes={staleMinutes} />
        </span>
      </div>

      <FleetList rows={trackingRows} />
    </main>
  )
}
