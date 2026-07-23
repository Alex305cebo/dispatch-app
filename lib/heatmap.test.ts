import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayKey, daysBetween } from './heatmap.ts'

// daysBetween spreads a load across every day it ran — the whole point of the
// utilisation heatmap. Two things break it silently: an off-by-one that drops the last
// day, and a delivery-before-pickup row that would spin the loop forever. Both pinned.

test('a same-day load is exactly one cell', () => {
  const d = new Date('2026-07-15T12:00:00')
  assert.deepEqual(daysBetween(d, d), [dayKey(d)])
})

test('a multi-day haul fills every day inclusive of both ends', () => {
  const from = new Date('2026-07-15T08:00:00')
  const to = new Date('2026-07-18T14:00:00')
  const got = daysBetween(from, to)
  assert.equal(got.length, 4, 'Jul 15,16,17,18')
  assert.equal(got[0], dayKey(from))
  assert.equal(got[got.length - 1], dayKey(to))
})

test('delivery before pickup collapses to one day, never loops', () => {
  const from = new Date('2026-07-18T00:00:00')
  const to = new Date('2026-07-15T00:00:00')
  assert.deepEqual(daysBetween(from, to), [dayKey(from)])
})

test('time of day never leaks a truck into an extra column', () => {
  // 11pm pickup to 1am two days later is still three calendar days, not more.
  const from = new Date('2026-07-15T23:00:00')
  const to = new Date('2026-07-17T01:00:00')
  assert.equal(daysBetween(from, to).length, 3)
})
