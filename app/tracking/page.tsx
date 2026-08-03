import { Suspense } from 'react'
import { sql } from '@/lib/db'
import { listLoads, listTrucks } from '@/lib/loads'
import { currentLoadsByTruck, truckLabel, eldStatus } from '@/lib/map'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { EldLinks } from '@/components/eld-links'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { FleetList, type TrackingRow } from '@/components/fleet-list'
import { cityCoordsBest, deliveryInfoBest } from '@/lib/geo-routing'
import { positionSignals } from '@/lib/eld'
import { activeAlert, type WeatherAlert } from '@/lib/weather'
import { getSetting } from '@/lib/settings'
import { agoText, driveTime } from '@/lib/fmt'
import { t as tr, type Locale } from '@/lib/i18n'
import { Info } from '@/components/info'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

type FS = {
  unit: string
  fuel: number | null
  bearing: number | null
  driver_name: string | null
  drive_status: string | null
  location: string | null
  lat: number | null
  lng: number | null
  eld_seen: string | null
  updated_at: string
}

/**
 * Shell only — heading and the ELD link block, both cheap. Everything that depends on
 * routing lives in <FleetBoard> behind a Suspense boundary, because assembling this
 * page means geocoding each load's pickup and asking a free external router for the
 * road ahead: unavoidably ~1 s of work that used to hold back the entire document.
 */
export default async function Page() {
  const locale = await getLocale()
  const shareRaw = await getSetting('eld_share_tokens')
  const shareCount = shareRaw ? (JSON.parse(shareRaw) as string[]).length : 0

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          {tr(locale, 'tracking.title')}
          <Info side="bottom" text={tr(locale, 'tracking.infoText')} />
        </h1>
        <p className="text-[13px] text-white/65">{tr(locale, 'tracking.subtitle')}</p>
      </header>

      <EldLinks count={shareCount} />

      <Suspense fallback={<BoardSkeleton />}>
        <FleetBoard locale={locale} />
      </Suspense>
    </main>
  )
}

/** Map, fleet counters and the truck list — the part that waits on routing. */
async function FleetBoard({ locale }: { locale: Locale }) {
  const companyId = await companyScope()
  // All four are independent, so they go together. The truck list and the share token
  // used to be awaited one after the other before this even started — two round trips
  // of dead time on a page that already has plenty.
  const [trucks, loads, rowsRaw, phoneRowsRaw] = await Promise.all([
    listTrucks(companyId),
    listLoads(companyId),
    sql`SELECT * FROM fleet_status`,
    sql`SELECT truck_id, driver_phone FROM truck_meta`,
  ])
  // One query for the whole fleet, instead of currentLoadForTruck() per truck.
  const currentByTruck = currentLoadsByTruck(loads)
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
      const load = currentByTruck.get(t.id) ?? null
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
        // Idle time and heading come out of one read of the breadcrumb trail — they
        // used to be two queries per truck over overlapping windows of the same table.
        const [wx, signals] = await Promise.all([
          activeAlert(pt.lat, pt.lng).catch(() => null),
          t.number
            ? positionSignals(t.number, pt.lat, pt.lng).catch(() => null)
            : Promise.resolve(null),
        ])
        weather = wx
        idleAt = signals?.idleAt ?? null
        // Device heading first. The inferred one needs the truck to have moved far
        // enough between two polls, so it is blank exactly when a truck is creeping
        // around a yard — which is when the arrow's direction is most confusing.
        heading = fs.bearing ?? signals?.heading ?? null
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
  // Only facts the map itself cannot show — that's the whole point of the strip under
  // it. A truck with no GPS has no pin at all; a truck standing still under a load looks
  // identical on the map to one parked between jobs. Moving/on-duty/stopped is NOT
  // counted here any more: the map already draws it, in colour.
  let noGps = 0
  let totalDeliveryMiles = 0
  let underLoad = 0
  let stuck = 0

  for (const { t, fs, load, pickup, legToPickup, legToDelivery, weather, idleAt, heading } of perTruck) {
    // Unconditional on load — a parked empty truck shouldn't say "moving" either.
    const idleHoursAny = idleAt ? Math.floor((Date.now() - idleAt.getTime()) / 3_600_000) : null
    const st = eldStatus(fs?.drive_status ?? null, idleHoursAny, locale)
    const hasGps = !!fs && fs.lat !== null && fs.lng !== null
    if (!hasGps) noGps++

    // A truck with an active load that hasn't moved in hours is worth a flag
    // (detention, breakdown). An idle EMPTY truck is just parked — unremarkable.
    const idleHoursRaw = load && idleAt ? idleHoursAny : null
    if (load) underLoad++
    if (idleHoursRaw !== null && idleHoursRaw >= 3) stuck++

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
        // Fuel belongs in the hover card too — a dispatcher choosing which truck takes
        // the next load is looking at the MAP, not at the list underneath it.
        sub: [
          st.text,
          fs.fuel != null ? `⛽ ${Math.round(fs.fuel)}%` : null,
          weather ? `⚠ ${weather.event}` : null,
          fs.location,
        ]
          .filter(Boolean)
          .join('\n'),
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
      fuel: fs?.fuel ?? null,
      unavailable: t.unavailable,
    })
  }

  // Trucks that need a dispatcher first. Insertion order is just the truck table's
  // order, which means the one stuck in detention for six hours can sit below five
  // that are driving along fine — the whole list has to be read to find it. Costs
  // nothing: every flag below is already on the row.
  const attention = (r: TrackingRow) =>
    (r.city === null ? 8 : 0) + // no GPS at all — not even on the map
    (r.idleHours !== null ? 4 : 0) + // standing under a load: detention or breakdown
    (r.weather ? 2 : 0) +
    (r.fuel !== null && r.fuel <= 15 ? 1 : 0)
  trackingRows.sort((a, b) => attention(b) - attention(a))

  return (
    <>
      <div className="mb-4">
        <FleetMap markers={markers} routes={routes} />
      </div>

      {/* Deliberately NOT the map's legend again. Moving / on duty / stopped is already
          drawn over the map in colour, and repeating it in words underneath was the
          same fact stated twice. These four answer what the map cannot: a truck with no
          GPS has no pin to look at, a truck standing under a load looks exactly like one
          parked between jobs, and miles-to-delivery is nowhere on a map at all.
          Four fixed tiles, never a variable count — a row that changes width with the
          data is what made this strip look ragged. Zero is a real answer here, and a
          quiet "0 idle" is worth more than a tile that vanishes. */}
      <div className="panel mb-4 p-2.5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <FleetTile
            value={totalDeliveryMiles > 0 ? `${totalDeliveryMiles.toLocaleString('en-US')} mi` : '—'}
            label={tr(locale, 'tracking.tileToDelivery')}
          />
          <FleetTile value={`${underLoad}/${perTruck.length}`} label={tr(locale, 'tracking.tileUnderLoad')} />
          <FleetTile value={String(stuck)} label={tr(locale, 'tracking.tileStuck')} tone={stuck > 0 ? 'warn' : undefined} />
          <FleetTile value={String(noGps)} label={tr(locale, 'tracking.noGpsBadge')} tone={noGps > 0 ? 'warn' : undefined} />
        </div>

        {/* Its own line, not crammed onto the end of the row: at narrow widths the old
            `ml-auto` pushed "updated · live · Refresh" into a ragged second line that
            never lined up with anything. */}
        <div className="mt-2.5 flex items-center justify-end gap-2 px-1.5 text-[11px] text-white/40">
          <span>
            {snapshot
              ? `${tr(locale, 'tracking.updatedPrefix')}${agoText(snapshot, locale)}`
              : tr(locale, 'tracking.noSnapshotYet')}
          </span>
          <RefreshFleetButton staleMinutes={staleMinutes} />
        </div>
      </div>

      <FleetList rows={trackingRows} />
    </>
  )
}

/** One tile in the strip under the map. Fixed height and a single `nums` line so the
 * four sit on an even baseline whatever the values are — uneven tiles are exactly what
 * made the old row look untidy. */
function FleetTile({ value, label, tone }: { value: string; label: string; tone?: 'warn' }) {
  return (
    <div className="panel-inset flex flex-col justify-center px-3 py-2.5">
      <div className={`nums text-[18px] leading-tight ${tone === 'warn' ? 'text-warn-400' : 'text-white/90'}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-white/45">{label}</div>
    </div>
  )
}

/** Placeholder while FleetBoard resolves. Mirrors the real block's shape — map, then
 * the counter strip, then list rows — so the page doesn't jump when it swaps in. */
function BoardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-[320px] rounded-2xl border border-white/8 bg-white/[0.03]" />
      <div className="panel mb-4 h-[100px]" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel h-16" />
        ))}
      </div>
    </div>
  )
}
