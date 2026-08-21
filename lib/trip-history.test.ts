import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DAY_MS,
  dayTotals,
  daySpans,
  segmentTrail,
  startOfDay,
  stopRole,
  summarize,
  type HistoryLeg,
  type LoadStop,
  type TrailPoint,
} from './trip-history.ts'

const BASE = { lat: 35.96, lng: -83.92 }
const t = (mins: number) => new Date(2026, 6, 19, 6, mins, 0).toISOString()

// ~0.09deg longitude at this latitude is ~5 miles — comfortably past the 0.5mi
// stop radius, so a tick here reads as "moving", not GPS jitter.
const STEP_DEG = 0.09

/** `ticks` points 5 minutes apart, starting at `fromMin`, moving `STEP_DEG`/tick
 * from `startLng`. Returns the points plus the lng the trail ended on. */
function drivingFrom(fromMin: number, ticks: number, startLng: number) {
  const points: TrailPoint[] = Array.from({ length: ticks }, (_, i) => ({
    lat: BASE.lat,
    lng: startLng + STEP_DEG * i,
    at: t(fromMin + i * 5),
    location: null,
  }))
  return { points, endLng: points[points.length - 1].lng, endMin: fromMin + (ticks - 1) * 5 }
}

function parkedFrom(fromMin: number, ticks: number, lng: number, label = 'Knoxville, TN') {
  const points: TrailPoint[] = Array.from({ length: ticks }, (_, i) => ({
    lat: BASE.lat,
    lng,
    at: t(fromMin + i * 5),
    location: label,
  }))
  return { points, endMin: fromMin + (ticks - 1) * 5 }
}

test('steady driving with no stops is one leg', () => {
  const { points } = drivingFrom(0, 6, BASE.lng)
  const legs = segmentTrail(points)
  assert.equal(legs.length, 1)
  assert.equal(legs[0].kind, 'drive')
})

test('a short traffic-light pause does not become a stop', () => {
  const d1 = drivingFrom(0, 3, BASE.lng) // t0..t10
  const p1 = parkedFrom(d1.endMin + 10, 2, d1.endLng) // t20..t25, isolated by a 10-min gap
  const d2 = drivingFrom(p1.endMin + 10, 3, d1.endLng) // resumes 10 min after parking ends
  const legs = segmentTrail([...d1.points, ...p1.points, ...d2.points])
  assert.ok(
    legs.every((l) => l.kind === 'drive'),
    'a pause under 30 minutes must not surface as a stop leg',
  )
  // Regression: at dense (~30s) ELD polling a brief still blip used to still cut the
  // drive into fragments around it, even though it never became a visible stop leg —
  // e.g. one continuous highway drive showing up as a handful of "1 mi · 1m" rows.
  assert.equal(legs.length, 1, 'the pause must not fracture one continuous drive into pieces')
})

test('parking for 45 minutes shows up as a stop, not a long rest', () => {
  const d1 = drivingFrom(0, 3, BASE.lng)
  // One more tick of movement to "pull into" the lot, then hold still there —
  // keeps the stop's start unambiguous instead of blending into the last drive tick.
  const p1 = parkedFrom(d1.endMin + 5, 10, d1.endLng + STEP_DEG) // 45 min stationary
  const legs = segmentTrail([...d1.points, ...p1.points])
  const stop = legs.find((l) => l.kind === 'stop')
  assert.ok(stop)
  assert.equal((stop as Extract<typeof stop, { kind: 'stop' }>).location, 'Knoxville, TN')
  assert.equal((stop as Extract<typeof stop, { kind: 'stop' }>).long, false)
  const minutes = (stop as Extract<typeof stop, { kind: 'stop' }>).minutes
  assert.equal(minutes, 45)
})

test('parking for 8 hours is flagged as a long rest', () => {
  const d1 = drivingFrom(0, 3, BASE.lng)
  const p1 = parkedFrom(d1.endMin + 5, 97, d1.endLng + STEP_DEG) // 8 hours stationary
  const legs = segmentTrail([...d1.points, ...p1.points])
  const stop = legs.find((l) => l.kind === 'stop')
  assert.ok(stop && (stop as Extract<typeof stop, { kind: 'stop' }>).long === true)
})

test('fewer than two points yields no legs', () => {
  assert.deepEqual(segmentTrail([]), [])
  assert.deepEqual(segmentTrail([{ lat: 0, lng: 0, at: t(0), location: null }]), [])
})

// daySpans is the geometry behind the 24-hour ribbon. It fails silently and visibly:
// a bad clip draws a bar running off its own container, or a leg that vanishes.
const drive = (from: string, to: string): HistoryLeg => ({
  kind: 'drive', from, to, miles: 100, minutes: 60, fromLocation: null, toLocation: null,
})
const day = (s: string) => startOfDay(Date.parse(s))

test('a leg inside one day maps to its share of that day', () => {
  const d = day('2026-07-20T00:00:00')
  const [s] = daySpans([drive('2026-07-20T06:00:00', '2026-07-20T12:00:00')], d)
  assert.ok(Math.abs(s!.leftPct - 25) < 0.01, 'starts a quarter into the day')
  assert.ok(Math.abs(s!.widthPct - 25) < 0.01, 'spans a quarter of the day')
})

test('a leg crossing midnight is clipped to each day, never overflowing', () => {
  const leg = drive('2026-07-20T22:00:00', '2026-07-21T02:00:00')
  const first = daySpans([leg], day('2026-07-20T00:00:00'))[0]!
  const second = daySpans([leg], day('2026-07-21T00:00:00'))[0]!
  assert.ok(Math.abs(first.leftPct + first.widthPct - 100) < 0.01, 'day one ends exactly at midnight')
  assert.equal(second.leftPct, 0, 'day two starts at midnight')
  assert.ok(Math.abs(second.widthPct - (2 / 24) * 100) < 0.01, 'day two keeps only its 2 hours')
})

test('legs from other days are dropped, not drawn at a negative offset', () => {
  const d = day('2026-07-20T00:00:00')
  assert.equal(daySpans([drive('2026-07-18T06:00:00', '2026-07-18T09:00:00')], d).length, 0)
})

test('итог окна: мили, часы за рулём, стоянки и средняя по трассе', () => {
  const d1 = drivingFrom(0, 25, BASE.lng) // два часа хода
  const p1 = parkedFrom(d1.endMin + 5, 20, d1.endLng) // и полтора часа стоянки
  const s = summarize(segmentTrail([...d1.points, ...p1.points]))
  assert.equal(s.stops, 1)
  assert.ok(s.stopMin >= 90, 'стоянка целиком попадает в итог')
  assert.ok(s.driveMin >= 120)
  assert.ok(s.miles > 0)
  assert.ok(s.avgMph !== null && s.avgMph > 0, 'средняя считается по времени движения')
  assert.equal(s.longest?.minutes, s.stopMin)
})

test('короткая поездка не выдаёт среднюю скорость по одной точке', () => {
  const legs = segmentTrail(drivingFrom(0, 4, BASE.lng).points) // 15 минут хода
  assert.equal(summarize(legs).avgMph, null)
})

test('мили рейса через полночь делятся между днями, а не достаются одному', () => {
  const start = new Date(2026, 7, 20, 22, 0, 0).getTime()
  const legs: HistoryLeg[] = [
    {
      kind: 'drive',
      from: new Date(start).toISOString(),
      to: new Date(start + 4 * 3600_000).toISOString(), // 22:00 → 02:00
      miles: 200,
      minutes: 240,
      fromLocation: null,
      toLocation: null,
    },
  ]
  const d1 = dayTotals(legs, startOfDay(start))
  const d2 = dayTotals(legs, startOfDay(start) + DAY_MS)
  assert.equal(d1.miles, 100) // два часа до полуночи
  assert.equal(d2.miles, 100)
  assert.equal(d1.driveMin + d2.driveMin, 240)
})

test('стоянка в городе погрузки в день погрузки — это детеншен', () => {
  const stops: LoadStop[] = [
    { city: 'Bakersfield, CA', kind: 'pickup', day: '2026-08-20' },
    { city: 'Dallas, TX', kind: 'delivery', day: '2026-08-23' },
  ]
  const at = new Date(2026, 7, 20, 9, 0, 0).toISOString()
  assert.equal(stopRole('2.0mi N from Bakersfield, CA', at, stops), 'pickup')
  assert.equal(stopRole('Bakersfield, CA', at, stops), 'pickup')
})

test('тот же город, но не в те дни — обычная стоянка, а не детеншен', () => {
  const stops: LoadStop[] = [{ city: 'Bakersfield, CA', kind: 'pickup', day: '2026-08-20' }]
  const at = new Date(2026, 7, 27, 9, 0, 0).toISOString()
  assert.equal(stopRole('2.0mi N from Bakersfield, CA', at, stops), null)
  assert.equal(stopRole('Fresno, CA', new Date(2026, 7, 20, 9, 0, 0).toISOString(), stops), null)
  assert.equal(stopRole(null, at, stops), null)
})
