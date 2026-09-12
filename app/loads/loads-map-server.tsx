import { getSettings } from '@/lib/settings'
import { fleetStatusByUnit } from '@/lib/maintenance'
import { routeVia } from '@/lib/geo-routing'
import { STALE_GPS_MS, statusTone } from '@/lib/load-map'
import { activeLoadsByTruck, truckLabel, type LoadRecord, type TruckRecord } from '@/lib/map'
import { stopsFrom, type LoadStop } from '@/lib/stops'
import { agoText, usDate } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'
import type { MapMarker, MapRoute } from '@/components/fleet-map'
import type { LoadMetrics } from '@/components/loads-toolbar'
import { LoadsMap, type LoadsMapRow } from './loads-map'

// Тот же порядок источников, что у cityCoordsBest (lib/geo-routing.ts): адрес через
// Mapbox, потом Census, потом свободный поиск; город — последним.
const GEO_PREFIXES = ['geo:mapbox:', 'geo:census:', 'geo:']
const norm = (v: string) => v.toLowerCase().trim()

/**
 * Карта того, что везётся сейчас: текущий груз и партиалы каждого трака плюс открытые
 * грузы без трака. Следующие забукированные рейсы сюда не попадают — они ещё не едут
 * и лежат в списке ниже, иначе карта показывала бы водителя на рейсе, которого нет.
 *
 * Координаты остановок берутся из уже сохранённых геокодов (settings), позиции траков —
 * из последнего снимка ELD: ни геокодирования, ни опроса ELD страница не запускает.
 * Линия рейса — дорожный маршрут через все остановки (routeVia), он тоже лежит в
 * settings с TTL, поэтому повторные открытия страницы в OSRM не ходят.
 */
export async function LoadsMapServer({
  loads,
  trucks,
  metrics,
  locale,
}: {
  loads: LoadRecord[]
  trucks: TruckRecord[]
  metrics: Record<number, LoadMetrics>
  locale: Locale
}) {
  const byTruck = activeLoadsByTruck(loads)
  const shown = [
    ...trucks.flatMap((tr) => byTruck.get(tr.id) ?? []),
    ...loads.filter((l) => l.truckId == null && (l.status === 'booked' || l.status === 'in_transit')),
  ].sort((a, b) => Number(a.status !== 'in_transit') - Number(b.status !== 'in_transit'))

  const stopsOf = new Map(shown.map((l) => [l.id, stopsFrom(l)]))
  const names = new Set<string>()
  for (const stops of stopsOf.values()) for (const s of stops) for (const v of [s.address, s.city]) if (v) names.add(norm(v))
  const [fleet, geos] = await Promise.all([
    fleetStatusByUnit(),
    names.size ? getSettings([...names].flatMap((n) => GEO_PREFIXES.map((p) => p + n))) : new Map<string, string>(),
  ])
  const point = (name: string | null): [number, number] | null => {
    if (!name) return null
    for (const prefix of GEO_PREFIXES) {
      const raw = geos.get(prefix + norm(name))
      if (!raw || raw === '-') continue
      const [lat, lng] = raw.split(',').map(Number)
      if (lat && lng && Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng]
    }
    return null
  }
  const stopLabel = (s: LoadStop) => `${t(locale, s.role === 'pickup' ? 'stops.pickup' : 'stops.delivery')} · ${s.city ?? s.address ?? ''}`

  const pinned = new Set<number>() // один трак — один пин, даже когда везёт партиалы
  const rows: LoadsMapRow[] = await Promise.all(
    shown.map(async (load) => {
      const truck = trucks.find((tr) => tr.id === load.truckId)
      const fs = truck?.number ? fleet.get(truck.number) : undefined
      const seen = fs?.eldSeen ? new Date(fs.eldSeen) : null
      const seenText = seen ? agoText(seen, locale) : null
      const markers: MapMarker[] = []
      if (truck && fs?.lat != null && fs.lng != null && !pinned.has(truck.id)) {
        pinned.add(truck.id)
        // Старый сигнал не выдаём за «трак сейчас здесь»: серый пин, возраст — в подписи.
        const stale = !seen || Date.now() - seen.getTime() > STALE_GPS_MS
        markers.push({
          lat: fs.lat,
          lng: fs.lng,
          label: truckLabel(truck),
          sub: `${t(locale, 'loads.dash.gps')}: ${seenText ?? '—'}`,
          kind: 'truck',
          tone: stale ? 'rest' : statusTone(fs.driveStatus),
          truckId: load.id,
        })
      }
      const stops = (stopsOf.get(load.id) ?? []).map((s) => ({ s, pt: point(s.address) ?? point(s.city) }))
      for (const { s, pt } of stops) {
        if (!pt) continue
        markers.push({
          lat: pt[0],
          lng: pt[1],
          label: stopLabel(s),
          sub: [usDate(s.date), s.time].filter(Boolean).join(' · ') || undefined,
          kind: s.role === 'pickup' ? 'pickup' : 'dest',
          truckId: load.id,
        })
      }
      // Дорожный маршрут через все известные остановки рейса. Остановка без координат
      // пропускается: лучше линия по дорогам между остальными, чем ничего.
      const pts = stops.flatMap(({ pt }) => (pt ? [{ lat: pt[0], lng: pt[1] }] : []))
      const first = pts[0]
      const road = pts.length > 1 ? await routeVia(pts) : null
      const routes: MapRoute[] =
        road?.coords?.length && first
          ? [{ from: [first.lat, first.lng], to: [road.lat, road.lng], coords: road.coords }]
          : // Маршрутизатор не ответил — прямые отрезки между соседними точками (пунктир).
            stops.slice(1).flatMap(({ pt }, i) => {
              const from = stops[i]!.pt
              return from && pt ? [{ from, to: pt }] : []
            })
      return {
        load,
        name: truck ? truckLabel(truck) : t(locale, 'loads.dash.unassigned'),
        markers,
        routes,
        seenText,
        nextStop: metrics[load.id]?.nextStop ?? null,
      }
    }),
  )
  return <LoadsMap rows={rows} locale={locale} />
}
