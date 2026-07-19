import { sql } from '@/lib/db'
import { listTrucks, currentLoadForTruck } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { EldLinks } from '@/components/eld-links'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { FleetList, type TrackingRow } from '@/components/fleet-list'
import { deliveryInfo } from '@/lib/geo-routing'
import { headingOf, idleSince } from '@/lib/eld'
import { activeAlert, type WeatherAlert } from '@/lib/weather'
import { getSetting } from '@/lib/settings'
import { agoText, driveTime } from '@/lib/fmt'
import { Info } from '@/components/info'

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

// ZigZag duty codes → a plain label + a colour bucket. A speed like "54 mi/h"
// means the truck is rolling.
function status(s: string | null): { text: string; tone: 'move' | 'on' | 'rest' } {
  if (!s) return { text: '—', tone: 'rest' }
  if (/mi\/h/.test(s)) return { text: `В движении · ${s}`, tone: 'move' }
  if (s === 'D') return { text: 'В движении', tone: 'move' }
  if (s === 'ON') return { text: 'On Duty', tone: 'on' }
  if (s === 'SB') return { text: 'Sleeper', tone: 'rest' }
  if (s === 'OFF') return { text: 'Off Duty', tone: 'rest' }
  return { text: s, tone: 'on' }
}

export default async function Page() {
  const trucks = await listTrucks()
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
  const snapshot = rows[0]?.updated_at

  // One pass per truck, fully parallel: current load, delivery ETA, weather, idle time.
  const perTruck = await Promise.all(
    trucks.map(async (t) => {
      const fs = t.number ? byUnit.get(t.number) : undefined
      const load = await currentLoadForTruck(t.id)
      let dest: Awaited<ReturnType<typeof deliveryInfo>> = null
      let weather: WeatherAlert | null = null
      let idleAt: Date | null = null
      let heading: number | null = null
      if (fs && fs.lat !== null && fs.lng !== null) {
        const pt = { lat: fs.lat, lng: fs.lng }
        ;[dest, weather, idleAt, heading] = await Promise.all([
          load?.destination ? deliveryInfo(pt, load.destination) : Promise.resolve(null),
          activeAlert(pt.lat, pt.lng).catch(() => null),
          t.number ? idleSince(t.number, pt.lat, pt.lng).catch(() => null) : Promise.resolve(null),
          t.number ? headingOf(t.number, pt.lat, pt.lng).catch(() => null) : Promise.resolve(null),
        ])
      }
      return { t, fs, load, dest, weather, idleAt, heading }
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

  for (const { t, fs, load, dest, weather, idleAt, heading } of perTruck) {
    const st = status(fs?.drive_status ?? null)
    if (st.tone === 'move') moving++
    else if (st.tone === 'on') onDuty++
    else resting++
    const hasGps = !!fs && fs.lat !== null && fs.lng !== null
    if (!hasGps) noGps++

    // A truck with an active load that hasn't moved in hours is worth a flag
    // (detention, breakdown). An idle EMPTY truck is just parked — unremarkable.
    const idleHoursRaw = load && idleAt ? Math.floor((Date.now() - idleAt.getTime()) / 3_600_000) : null

    let delivery: TrackingRow['delivery'] = null
    if (hasGps && fs && dest && load) {
      delivery = { to: load.destination ?? '—', miles: dest.miles, etaMin: dest.etaMin }
      totalDeliveryMiles += dest.miles
      routes.push({ from: [fs.lat!, fs.lng!], to: [dest.lat, dest.lng], coords: dest.coords })
      markers.push({
        lat: dest.lat,
        lng: dest.lng,
        label: `Delivery · ${load.destination}`,
        sub: load.origin ? `Из ${load.origin}` : undefined,
        kind: 'dest',
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
        eta: dest ? `${dest.miles} mi · ~${driveTime(dest.etaMin)} до delivery` : undefined,
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
      driveTimeText: dest ? driveTime(dest.etaMin) : null,
      weather: weather ? { event: weather.event, headline: weather.headline } : null,
      idleHours: idleHoursRaw !== null && idleHoursRaw >= 3 ? idleHoursRaw : null,
    })
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold">
          Трекинг
          <Info side="bottom" text="Живая карта парка из ELD. На карте — где сейчас каждый трак и линия по дорогам до места выгрузки. В списке — статус (в движении/off/on), последняя локация, скорость и сколько осталось ехать до выгрузки. Координаты обновляются сами по Live Share ссылкам, бесплатно." />
        </h1>
        <p className="text-[13px] text-white/65">
          Где траки, куда едут и сколько осталось до выгрузки — живые данные из ELD.
        </p>
      </header>

      <EldLinks count={shareCount} />

      <div className="mb-4">
        <FleetMap markers={markers} routes={routes} />
      </div>

      <div className="panel mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[12px]">
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="size-2 rounded-full bg-good-500" /> {moving} в движении
        </span>
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="size-2 rounded-full bg-haul-500" /> {onDuty} on duty
        </span>
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="size-2 rounded-full bg-white/30" /> {resting} стоят
        </span>
        {noGps > 0 && (
          <span className="flex items-center gap-1.5 text-warn-400">
            <span className="size-2 rounded-full bg-warn-400" /> {noGps} без GPS
          </span>
        )}
        {totalDeliveryMiles > 0 && (
          <span className="text-white/60">
            <span className="nums text-white/85">{totalDeliveryMiles.toLocaleString('en-US')} mi</span> суммарно до
            выгрузки по парку
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-white/40">
          {snapshot ? `обновлено ${agoText(snapshot)}` : 'снимков ещё не было'}
          <RefreshFleetButton />
        </span>
      </div>

      <FleetList rows={trackingRows} />
    </main>
  )
}
