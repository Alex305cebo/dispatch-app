// Shared map-data builder for a load's pickup→delivery route + the live truck
// position hauling it — used by both the truck page (its current assignment) and a
// load's own page (this specific load, regardless of whether it's currently the
// truck's "active" one).

import type { LoadRecord, TruckRecord } from './map'
import type { FleetStatus } from './maintenance-core'
import { cityCoordsBest, routeToPoint, routeVia } from './geo-routing'
import { isDone, stopTitle, stopsFrom, type StopEv } from './stops.ts'
import { liveTrail, trailLabels } from './eld'
import { tripEta } from './trip-eta'
import { distToPathMiles, haversineMiles } from './geo'
import { driveTime, usDate } from './fmt'
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

/** Строка назначения для плашки: «окно 08:00–16:00», «к 08:00» или «весь день
 * (FCFS)». Рейт-коны печатают окно как два штампа с датами — в сыром виде на
 * плашке это читалось как мусор «08/29/2026 00:01 08/29/2026 23:59». */
export function apptText(time: string | null | undefined, locale: Locale): string | null {
  const times = [...(time ?? '').matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => Number(m[1]) * 60 + Number(m[2]))
  if (!times.length) return null
  const fmt = (v: number) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`
  if (times.length >= 2) {
    const [a, b] = [times[0]!, times[times.length - 1]!]
    // Окно на весь день — это «приезжай когда угодно», печатать 00:01–23:59 незачем.
    if (b - a >= 23 * 60) return t(locale, 'tracking.apptAllDay')
    return t(locale, 'tracking.apptWindow').replace('{a}', fmt(a)).replace('{b}', fmt(b))
  }
  return t(locale, 'tracking.apptBy').replace('{t}', fmt(times[0]!))
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
  /** Живые сигналы активного рейса — то, что диспетчер иначе считает в голове.
   * Null-поля значат «сигнала нет», а не «всё плохо»: без даты доставки нет
   * запаса, без хлебных крошек нет простоя. */
  live: {
    /** Минуты РЕАЛЬНОГО пути: за рулём + ночёвки по правилу 11/10. */
    realEtaMin: number | null
    /** Запас до срока выгрузки (минуты); минус — опоздание. */
    slackMin: number | null
    /** Сколько уже стоит на месте (минуты) НЕ у пикапа и не у выгрузки. */
    idleMin: number | null
    /** Насколько трак в стороне от прямого маршрута пикап→выгрузка (мили). */
    offRouteMi: number | null
    /** Мили до пикапа, пока груз ещё booked, — вторая строка бейджа на карте. */
    toPickupMi: number | null
    /** Стоит У пикапа или у выгрузки: с какого момента и сколько минут. Это и есть
     * детеншен — время, которое брокер должен оплатить сверх бесплатных часов. */
    detention: { at: 'pickup' | 'delivery'; seq: number; sinceIso: string; min: number } | null
  }
}

/** How old an ELD fix may be before we stop presenting it as "where the truck is now".
 * A rolling truck covers ~15 miles in 15 minutes, so an older pin actively lies. Note
 * fleet_status.updated_at is when WE polled — eld_seen is when the DEVICE last reported,
 * and only the latter says anything about the position's real age (measured: a unit whose
 * device had been silent two days still showed updated_at "16 min ago"). */
export const STALE_GPS_MS = 30 * 60 * 1000

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
  /** Отметки водителя: по ним видно, какая остановка следующая (lib/stops.ts). */
  events: StopEv[] = [],
): Promise<LoadMapData> {
  const markers: MapMarker[] = []
  const routes: MapRoute[] = []
  let etaText: string | null = null
  let miles: number | null = null
  let etaMin: number | null = null
  const live: LoadMapData['live'] = {
    realEtaMin: null,
    slackMin: null,
    idleMin: null,
    offRouteMi: null,
    toPickupMi: null,
    detention: null,
  }

  // Остановки по порядку и их точки: адрес из рейт-кона точнее города, за ним
  // индекс, за ним город (cityCoordsBest). ПОСЛЕДОВАТЕЛЬНО — у бесплатного
  // Nominatim правило «один запрос в секунду».
  const stops = load ? stopsFrom(load) : []
  type Pt = { lat: number; lng: number }
  const pts: (Pt | null)[] = []
  for (const st of stops) pts.push(await cityCoordsBest(st.address, st.city))
  const multi = stops.length > 2
  const markerAt = (i: number): MapMarker | null => {
    const st = stops[i]
    const p = pts[i]
    if (!st || !p || !load) return null
    const isPickup = st.role === 'pickup'
    // Две точки — подписи как всегда; три и больше — «Выгрузка 1 · Omaha, NE» и
    // название склада во второй строке.
    const label = multi
      ? `${stopTitle(st, stops, locale)} · ${st.city ?? ''}`
      : isPickup
        ? `${t(locale, 'tracking.pickupPrefix')}${st.city}`
        : `Delivery · ${st.city}`
    const sub = multi
      ? [st.name, usDate(st.date) || null, apptText(st.time, locale)].filter(Boolean).join('\n')
      : isPickup
        ? [usDate(st.date) || null, apptText(st.time, locale)].filter(Boolean).join('\n')
        : load.origin
          ? `${t(locale, 'tracking.fromPrefix')}${load.origin}`
          : ''
    return {
      lat: p.lat,
      lng: p.lng,
      label,
      sub: sub || undefined,
      kind: isPickup ? 'pickup' : 'dest',
      href: `/loads/${load.id}`,
    }
  }
  const known = pts.filter((p): p is Pt => !!p)

  const lat = fs?.lat ?? null
  const lng = fs?.lng ?? null
  // A FINISHED load is history: the truck has long since moved on — usually onto another
  // load — so drawing its live position here, plus a route from it to this load's delivery,
  // points at places that have nothing to do with this load (reported: a delivered load
  // showed the truck a state away, already assigned to the next haul). For anything not
  // currently being run, draw the load's OWN route through its stops and no live truck.
  const isActive = load == null || load.status === 'booked' || load.status === 'in_transit'
  const noGps = lat == null || lng == null

  if (load && (!isActive || noGps)) {
    stops.forEach((_, i) => {
      const m = markerAt(i)
      if (m) markers.push(m)
    })
    if (known.length >= 2) {
      const first = known[0]!
      const last = known[known.length - 1]!
      const leg = await routeVia(known)
      routes.push({ from: [first.lat, first.lng], to: [last.lat, last.lng], coords: leg?.coords })
      miles = leg?.miles ?? (load.loadedMiles > 0 ? load.loadedMiles : null)
    }
    return { markers, routes, etaText, miles, etaMin, live }
  }
  if (noGps) return { markers, routes, etaText, miles, etaMin, live }

  // Age of the fix itself, not of our last poll — a stale pin is greyed out and says so
  // instead of pretending the truck is standing there right now.
  const seenMs = fs?.eldSeen ? Date.parse(fs.eldSeen) : NaN
  const gpsAge = Number.isNaN(seenMs) ? null : Math.max(0, Date.now() - seenMs)
  const stale = gpsAge !== null && gpsAge > STALE_GPS_MS

  const trail = truck.number ? await liveTrail(truck.number, lat, lng).catch(() => null) : null
  const heading = trail?.heading ?? null
  // Хвост пути за 12 часов — серой линией ЗА траком: видно, ехал ли ночью, где
  // стоял и не крутится ли на месте. Первым в списке, чтобы дорога рисовалась
  // поверх него.
  if (trail && trail.coords.length > 2) {
    routes.push({
      from: trail.coords[0]!,
      to: trail.coords[trail.coords.length - 1]!,
      coords: trail.coords,
      labels: trailLabels(trail.coords, trail.ats, locale),
      tone: 'trail',
    })
  }
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

  // Что впереди: непройденные остановки по отметкам. Груз «в пути» без отметок
  // (статус поставил GPS или диспетчер) — первый пикап уже позади. Дорога: трак →
  // следующая точка → остальные по порядку, никогда не прямая к последней.
  let ahead = stops.map((st, i) => ({ st, p: pts[i] ?? null, i })).filter(({ st }) => !isDone(st, events, stops))
  const firstPickup = stops.find((st) => st.role === 'pickup')
  if (load?.status === 'in_transit' && ahead[0] && ahead[0].st.seq === firstPickup?.seq) ahead = ahead.slice(1)
  const next = ahead[0] ?? null
  const aheadPts = ahead.filter((a) => a.p).map((a) => a.p!)
  const legToNext = next?.p ? await routeToPoint({ lat, lng }, next.p) : null
  const legRest = aheadPts.length > 1 ? await routeVia(aheadPts) : null

  for (const a of ahead) {
    const m = markerAt(a.i)
    if (m) markers.push(m)
  }

  if (legToNext && next && load) {
    const routeMiles = legToNext.miles + (legRest?.miles ?? 0)
    miles = routeMiles
    live.toPickupMi = next.st.role === 'pickup' ? legToNext.miles : null
    const routeEtaMin = legToNext.etaMin + (legRest?.etaMin ?? 0)
    etaMin = routeEtaMin
    const finalPt = aheadPts[aheadPts.length - 1]!
    // Честный срок: за рулём + ночёвки, против даты и времени последней выгрузки в её поясе.
    const eta = tripEta(
      routeEtaMin,
      Date.now(),
      load.deliveryDate,
      load.deliveryTime,
      zoneFor(finalPt.lat, finalPt.lng),
    )
    live.realEtaMin = eta.realMin
    live.slackMin = eta.slackMin
    etaText = `${routeMiles} mi · ~${driveTime(routeEtaMin, locale)}${t(locale, 'tracking.toDelivery')}`
    truckM.eta = etaText
    routes.push({ from: [lat, lng], to: [legToNext.lat, legToNext.lng], coords: legToNext.coords })
    if (legRest) {
      const a0 = aheadPts[0]!
      routes.push({ from: [a0.lat, a0.lng], to: [finalPt.lat, finalPt.lng], coords: legRest.coords })
    }
  }

  // Простой: стоит — но не у одной из остановок, там стоять положено.
  if (trail?.idleAt && load) {
    const min = Math.round((Date.now() - trail.idleAt.getTime()) / 60_000)
    const near = stops.map((st, i) => ({ st, p: pts[i] })).find(({ p }) => p && haversineMiles({ lat, lng }, p) < 5)
    if (near) {
      // Стоит у склада: это детеншен, а не простой. Считаем с момента остановки.
      live.detention = { at: near.st.role, seq: near.st.seq, sinceIso: trail.idleAt.toISOString(), min }
    } else live.idleMin = min
  }

  // Уход с маршрута — только когда груз уже везётся: расстояние до плановой линии
  // через остановки. Пока трак едет НА пикап, сравнивать его не с чем.
  if (load?.status === 'in_transit' && known.length >= 2) {
    const planned = await routeVia(known).catch(() => null)
    if (planned?.coords?.length) {
      const off = distToPathMiles({ lat, lng }, planned.coords)
      // 25 миль: объезды, заправки и весовые дальше от трассы не уводят.
      if (off !== null && off > 25) live.offRouteMi = Math.round(off)
    }
  }

  markers.push(truckM)
  return { markers, routes, etaText, miles, etaMin, live }
}
