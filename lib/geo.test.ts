import { test } from 'node:test'
import assert from 'node:assert/strict'
import { haversineMiles, deadheadEstimate, bearing, type LatLng } from './geo.ts'

const CHICAGO: LatLng = { lat: 41.8781, lng: -87.6298 }
const DALLAS: LatLng = { lat: 32.7767, lng: -96.797 }
const NYC: LatLng = { lat: 40.7128, lng: -74.006 }
const LA: LatLng = { lat: 34.0522, lng: -118.2437 }

// Distances checked against known great-circle values, with a tolerance band so the
// test isn't brittle on the last mile.
test('great-circle matches known city distances', () => {
  assert.ok(Math.abs(haversineMiles(CHICAGO, DALLAS) - 800) < 15, 'Chicago–Dallas ≈ 800 mi')
  assert.ok(Math.abs(haversineMiles(NYC, LA) - 2450) < 25, 'NYC–LA ≈ 2450 mi')
})

test('a point is zero miles from itself', () => {
  assert.equal(haversineMiles(CHICAGO, CHICAGO), 0)
})

test('distance is symmetric', () => {
  assert.equal(haversineMiles(NYC, LA), haversineMiles(LA, NYC))
})

test('deadhead applies road circuity and rounds', () => {
  const straight = haversineMiles(CHICAGO, DALLAS)
  const dh = deadheadEstimate(CHICAGO, DALLAS)
  // Road estimate is longer than straight-line, and an integer.
  assert.ok(dh > straight)
  assert.equal(dh, Math.round(dh))
  assert.ok(Math.abs(dh - straight * 1.2) < 1)
})

test('short local deadhead stays small', () => {
  // Truck 12 mi from pickup → deadhead is tens of miles, not hundreds.
  const near: LatLng = { lat: 41.98, lng: -87.9 } // ~O'Hare, ~12 mi from downtown Chicago
  assert.ok(deadheadEstimate(near, CHICAGO) < 30)
})

test('bearing points north/east/south/west correctly', () => {
  const origin: LatLng = { lat: 40, lng: -90 }
  assert.ok(bearing(origin, { lat: 41, lng: -90 }) < 5, 'due north ≈ 0°')
  assert.ok(Math.abs(bearing(origin, { lat: 40, lng: -89 }) - 90) < 5, 'due east ≈ 90°')
  assert.ok(Math.abs(bearing(origin, { lat: 39, lng: -90 }) - 180) < 5, 'due south ≈ 180°')
  assert.ok(Math.abs(bearing(origin, { lat: 40, lng: -91 }) - 270) < 5, 'due west ≈ 270°')
})

test('bearing to yourself is defined, not NaN', () => {
  const p: LatLng = { lat: 35, lng: -85 }
  assert.equal(Number.isNaN(bearing(p, p)), false)
})
