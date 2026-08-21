// Turns a raw GPS breadcrumb trail into a readable timeline: drive legs and stops,
// with long rests called out. Pure — no DB import — so it's cheap to unit test.

import { haversineMiles } from './geo.ts'

export type TrailPoint = {
  lat: number
  lng: number
  at: string
  location: string | null
}

export type HistoryLeg =
  | {
      kind: 'drive'
      from: string
      to: string
      miles: number
      minutes: number
      fromLocation: string | null
      toLocation: string | null
    }
  | { kind: 'stop'; from: string; to: string; minutes: number; location: string | null; long: boolean }

const STOP_RADIUS_MI = 0.5 // GPS jitter while parked stays well inside this
const MIN_STOP_MIN = 30 // shorter stills are traffic/lights, not a "stop"
const LONG_STOP_MIN = 6 * 60 // long enough to be a rest break, not a fuel stop

/** Breadcrumb (oldest→newest) → drive/stop legs. Stills under MIN_STOP_MIN are
 * folded into the surrounding drive leg — not worth a line of their own. */
export function segmentTrail(points: TrailPoint[]): HistoryLeg[] {
  if (points.length < 2) return []

  const stillGap = points.slice(1).map((p, k) => haversineMiles(points[k], p) <= STOP_RADIUS_MI)

  // A still run shorter than MIN_STOP_MIN was already excluded from ever showing up
  // as its own "stop" leg below — but at today's ~30s ELD polling, a stoplight or a
  // moment of GPS jitter still registers as momentarily "still", and left as-is it
  // would fracture one continuous drive into several tiny fragments around that
  // invisible gap. Un-flag those runs first, so the surrounding drive stays one leg.
  for (let k = 0; k < stillGap.length; ) {
    if (!stillGap[k]) {
      k++
      continue
    }
    let end = k
    while (end < stillGap.length && stillGap[end]) end++
    const minutes = Math.round((new Date(points[end].at).getTime() - new Date(points[k].at).getTime()) / 60000)
    if (minutes < MIN_STOP_MIN) {
      for (let i = k; i < end; i++) stillGap[i] = false
    }
    k = end
  }

  const legs: HistoryLeg[] = []
  let start = 0
  let runStill = stillGap[0]

  const flush = (endIdx: number, still: boolean) => {
    const seg = points.slice(start, endIdx + 1)
    const from = seg[0].at
    const to = seg[seg.length - 1].at
    const minutes = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000)
    if (still) {
      // Surviving still runs are >= MIN_STOP_MIN by construction (see above).
      legs.push({ kind: 'stop', from, to, minutes, location: seg[0].location, long: minutes >= LONG_STOP_MIN })
      return
    }
    const miles = seg.slice(1).reduce((s, p, i) => s + haversineMiles(seg[i], p), 0)
    legs.push({
      kind: 'drive',
      from,
      to,
      miles: Math.round(miles),
      minutes,
      fromLocation: seg[0].location,
      toLocation: seg[seg.length - 1].location,
    })
  }

  for (let k = 0; k < stillGap.length; k++) {
    if (stillGap[k] !== runStill) {
      flush(k, runStill)
      start = k
      runStill = stillGap[k]
    }
  }
  flush(stillGap.length, runStill)
  return legs
}

export const DAY_MS = 24 * 60 * 60 * 1000

/** Local midnight of the day containing `ms`. Local, not UTC: a driver's day ends at
 * their midnight, and a UTC boundary would slice it at 7pm in California. */
export function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export type DaySpan = { leg: HistoryLeg; fromMs: number; toMs: number; leftPct: number; widthPct: number }

/**
 * Legs clipped to one calendar day and expressed as percentages of that day's width —
 * the geometry behind the 24-hour ribbon in components/trip-history.tsx.
 *
 * Clipping is the whole point: a drive from 22:00 to 02:00 belongs to BOTH days, and
 * drawn unclipped it would run off the end of the first bar and start the second one
 * at a negative offset.
 */
export function daySpans(legs: HistoryLeg[], dayMs: number): DaySpan[] {
  const dayEnd = dayMs + DAY_MS
  return legs
    .map((leg) => ({
      leg,
      fromMs: Math.max(Date.parse(leg.from), dayMs),
      toMs: Math.min(Date.parse(leg.to), dayEnd),
    }))
    .filter((s) => s.toMs > s.fromMs)
    .map((s) => ({
      ...s,
      leftPct: ((s.fromMs - dayMs) / DAY_MS) * 100,
      widthPct: ((s.toMs - s.fromMs) / DAY_MS) * 100,
    }))
}

export type TripSummary = {
  miles: number
  driveMin: number
  /** Всё время, что трак стоял: и короткие остановки, и длинные отдыхи. */
  stopMin: number
  stops: number
  longRests: number
  /** Средняя за время ДВИЖЕНИЯ, а не за сутки: скорость по трассе, а не «миль в день». */
  avgMph: number | null
  longest: { minutes: number; location: string | null; long: boolean } | null
}

/** Итог по окну (24 часа / 3 дня / 7 дней) — шапка секции «История пути».
 * Одна функция на всю секцию: те же числа считались бы по-разному в трёх местах. */
export function summarize(legs: HistoryLeg[]): TripSummary {
  let miles = 0
  let driveMin = 0
  let stopMin = 0
  let stops = 0
  let longRests = 0
  let longest: TripSummary['longest'] = null
  for (const l of legs) {
    if (l.kind === 'drive') {
      miles += l.miles
      driveMin += l.minutes
      continue
    }
    stopMin += l.minutes
    stops++
    if (l.long) longRests++
    if (!longest || l.minutes > longest.minutes) {
      longest = { minutes: l.minutes, location: l.location, long: l.long }
    }
  }
  return {
    miles,
    driveMin,
    stopMin,
    stops,
    longRests,
    // Час за рулём — нижняя граница, ниже которой средняя скорость считается по шуму.
    avgMph: driveMin >= 60 ? Math.round(miles / (driveMin / 60)) : null,
    longest,
  }
}

/**
 * Итог одного календарного дня. Мили отрезка, перешедшего полночь, делятся между
 * днями пропорционально времени: приписать все 471 милю дню, в котором рейс начался,
 * значит показать дню, где трак ехал до утра, ноль.
 */
export function dayTotals(legs: HistoryLeg[], dayMs: number): { miles: number; driveMin: number } {
  let miles = 0
  let driveMin = 0
  for (const s of daySpans(legs, dayMs)) {
    if (s.leg.kind !== 'drive') continue
    const whole = Date.parse(s.leg.to) - Date.parse(s.leg.from)
    const share = whole > 0 ? (s.toMs - s.fromMs) / whole : 1
    miles += s.leg.miles * share
    driveMin += (s.toMs - s.fromMs) / 60000
  }
  return { miles: Math.round(miles), driveMin: Math.round(driveMin) }
}

/** Остановка груза: город и дата по рейт-кону. Дата обязательна — без неё домашний
 * город водителя, совпавший с городом погрузки, помечался бы «на погрузке» всегда. */
export type LoadStop = { city: string; kind: 'pickup' | 'delivery'; day: string | null }

/** «12.0mi N from Bakersfield, CA» → «bakersfield, ca». */
function cityKey(place: string | null | undefined): string | null {
  const s = place?.trim()
  if (!s) return null
  const tail = /from\s+(.+)$/i.exec(s)?.[1] ?? s
  // Приставка с фактическим штатом («NV · …») тут не участвует: она стоит перед
  // «from», и до хвоста с городом не доходит.
  return tail.toLowerCase().trim() || null
}

const NEAR_DAY_MS = 36 * 60 * 60 * 1000

/**
 * Стояла ли машина под погрузкой или выгрузкой — то, за что диспетчер выставляет
 * детеншен. Своего ELD об этом не спросишь: он знает только, что трак не двигался.
 * Мы знаем груз, поэтому сопоставляем город стоянки с городом рейт-кона.
 */
export function stopRole(
  location: string | null,
  atIso: string,
  stops: LoadStop[],
): 'pickup' | 'delivery' | null {
  const key = cityKey(location)
  if (!key) return null
  const at = Date.parse(atIso)
  for (const s of stops) {
    const sk = cityKey(s.city)
    if (!sk || sk !== key) continue
    if (!s.day) continue
    const day = Date.parse(s.day)
    if (Number.isNaN(day) || Number.isNaN(at)) continue
    if (Math.abs(at - day) > NEAR_DAY_MS) continue
    return s.kind
  }
  return null
}
