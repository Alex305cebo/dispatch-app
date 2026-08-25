import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lanes, repeatLanes, type PricedLoad } from './lanes.ts'
import type { LoadRecord } from './map.ts'

const load = (p: Partial<LoadRecord>): LoadRecord =>
  ({
    id: 1,
    rate: 2000,
    loadedMiles: 800,
    deadheadMiles: 100,
    transitDays: 2,
    origin: 'Dallas, TX',
    destination: 'Atlanta, GA',
    status: 'delivered',
    truckId: 1,
    createdAt: '2026-08-01T00:00:00Z',
    pickupDate: '2026-08-01',
    ...p,
  }) as LoadRecord

const row = (p: Partial<LoadRecord>, net: number, miles: number): PricedLoad => ({
  load: load(p),
  net,
  miles,
})

test('одинаковые города в разном регистре — одно направление', () => {
  const out = lanes([
    row({ id: 1, origin: 'Dallas, TX', destination: 'Atlanta, GA' }, 400, 900),
    row({ id: 2, origin: 'DALLAS, TX', destination: 'atlanta, ga' }, 600, 900),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0]!.loads, 2)
  assert.equal(out[0]!.net, 1000)
})

test('ставка за милю считается по всем милям, а не как среднее средних', () => {
  // Короткий дорогой рейс не должен перевешивать длинный: 4000 гросса на 1800 миль.
  const out = lanes([
    row({ id: 1, rate: 1000 }, 200, 200),
    row({ id: 2, rate: 3000 }, 500, 1600),
  ])
  assert.equal(out[0]!.rpm.toFixed(2), (4000 / 1800).toFixed(2))
})

test('отменённые и черновики в счёт не идут', () => {
  const out = lanes([
    row({ id: 1, status: 'cancelled' }, 999, 900),
    row({ id: 2, status: 'quoted' }, 999, 900),
    row({ id: 3, status: 'delivered' }, 500, 900),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0]!.loads, 1)
  assert.equal(out[0]!.net, 500)
})

test('направления идут по деньгам, а не по числу рейсов', () => {
  const out = lanes([
    row({ id: 1, origin: 'A, TX', destination: 'B, GA' }, 100, 500),
    row({ id: 2, origin: 'A, TX', destination: 'B, GA' }, 100, 500),
    row({ id: 3, origin: 'C, CA', destination: 'D, NV' }, 900, 500),
  ])
  assert.equal(out[0]!.origin, 'C, CA')
  assert.equal(out[1]!.loads, 2)
})

test('повторяющимися считаются направления с двумя и более рейсами', () => {
  const all = lanes([
    row({ id: 1, origin: 'A, TX', destination: 'B, GA' }, 100, 500),
    row({ id: 2, origin: 'A, TX', destination: 'B, GA' }, 100, 500),
    row({ id: 3, origin: 'C, CA', destination: 'D, NV' }, 900, 500),
  ])
  const rep = repeatLanes(all)
  assert.equal(rep.length, 1)
  assert.equal(rep[0]!.origin, 'A, TX')
})

test('груз без города не ломает свод, а просто не попадает в него', () => {
  const out = lanes([row({ id: 1, origin: null, destination: 'Atlanta, GA' }, 500, 900)])
  assert.deepEqual(out, [])
})

test('последняя дата берётся самая свежая', () => {
  const out = lanes([
    row({ id: 1, pickupDate: '2026-08-01' }, 100, 500),
    row({ id: 2, pickupDate: '2026-08-20' }, 100, 500),
  ])
  assert.equal(out[0]!.lastAt, '2026-08-20')
})
