import { test } from 'node:test'
import assert from 'node:assert/strict'
import { segmentTrail, type TrailPoint } from './trip-history.ts'

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
