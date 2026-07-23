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
