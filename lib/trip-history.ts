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
  | { kind: 'drive'; from: string; to: string; miles: number; minutes: number }
  | { kind: 'stop'; from: string; to: string; minutes: number; location: string | null; long: boolean }

const STOP_RADIUS_MI = 0.5 // GPS jitter while parked stays well inside this
const MIN_STOP_MIN = 30 // shorter stills are traffic/lights, not a "stop"
const LONG_STOP_MIN = 6 * 60 // long enough to be a rest break, not a fuel stop

/** Breadcrumb (oldest→newest) → drive/stop legs. Stills under MIN_STOP_MIN are
 * folded into the surrounding drive leg — not worth a line of their own. */
export function segmentTrail(points: TrailPoint[]): HistoryLeg[] {
  if (points.length < 2) return []

  const stillGap = points.slice(1).map((p, k) => haversineMiles(points[k], p) <= STOP_RADIUS_MI)
  const legs: HistoryLeg[] = []
  let start = 0
  let runStill = stillGap[0]

  const flush = (endIdx: number, still: boolean) => {
    const seg = points.slice(start, endIdx + 1)
    const from = seg[0].at
    const to = seg[seg.length - 1].at
    const minutes = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000)
    if (still) {
      if (minutes >= MIN_STOP_MIN) {
        legs.push({ kind: 'stop', from, to, minutes, location: seg[0].location, long: minutes >= LONG_STOP_MIN })
      }
      return
    }
    const miles = seg.slice(1).reduce((s, p, i) => s + haversineMiles(seg[i], p), 0)
    legs.push({ kind: 'drive', from, to, miles: Math.round(miles), minutes })
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
