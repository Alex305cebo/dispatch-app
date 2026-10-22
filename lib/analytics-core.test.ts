import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, buildAnalytics, deltaPct, regionOfState, stageOf } from './analytics-core.ts'
import type { LoadRecord, TruckRecord } from './map.ts'

const load = (patch: Partial<LoadRecord> = {}) =>
  ({
    id: 1, truckId: 1, status: 'delivered', rate: 1000, loadedMiles: 400, deadheadMiles: 0,
    pickupDate: '2026-10-20', deliveryDate: '2026-10-21', origin: 'Dallas, TX', destination: 'Atlanta, GA',
    brokerName: 'TQL', ...patch,
  }) as LoadRecord
const trucks = [{ id: 1, name: 'T1', number: '101', driverName: 'Juan Perez', unavailable: null }] as TruckRecord[]
const today = '2026-10-22'

test('addDays crosses month and year', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31')
})

test('deltaPct: sign, rounding, empty base', () => {
  assert.equal(deltaPct(120, 100), '+20%')
  assert.equal(deltaPct(90, 100), '-10%')
  assert.equal(deltaPct(5, 0), '')
})

test('quoted, cancelled and future loads stay out of revenue', () => {
  const a = buildAnalytics(
    [
      load({ rate: 1000 }),
      load({ rate: 500, status: 'quoted' }),
      load({ rate: 700, status: 'cancelled' }),
      load({ rate: 900, pickupDate: '2026-10-25' }),
      load({ rate: 300, pickupDate: null }),
    ],
    trucks,
    today,
  )
  assert.equal(a.revenue.total, 1000)
  assert.equal(a.revenue.series.length, 30)
  assert.equal(a.revenue.series.at(-1)!.day, today)
  assert.equal(a.revenue.series.at(-1)!.value, 1000)
  assert.equal(a.periods[0]!.total, 1000)
})

test('30-day series is cumulative and compares with the 30 days before', () => {
  const a = buildAnalytics([load({ rate: 400, pickupDate: '2026-09-30' }), load({ rate: 600 }), load({ rate: 500, pickupDate: '2026-09-01' })], trucks, today)
  const s = a.revenue.series
  assert.ok(s.every((p, i) => i === 0 || p.value >= s[i - 1]!.value))
  assert.equal(a.revenue.total, 1000)
  assert.equal(a.revenue.delta, '+100%')
})

test('weekday buckets: Monday first, pickups and deliveries apart', () => {
  // 2026-10-19 — понедельник, 2026-10-21 — среда.
  const a = buildAnalytics([load({ pickupDate: '2026-10-19', deliveryDate: '2026-10-21' })], trucks, today)
  assert.deepEqual(a.week.pickups[0], [1, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(a.week.deliveries[0], [0, 0, 1, 0, 0, 0, 0])
  assert.equal(a.week.count, 1)
})

test('states group into regions, brokers top three', () => {
  const a = buildAnalytics(
    [load({ origin: 'Dallas, TX', rate: 2000 }), load({ origin: 'Atlanta, GA', rate: 1000, brokerName: 'CH Robinson' })],
    trucks,
    today,
  )
  assert.deepEqual(a.states.map((s) => [s.name, s.group]), [['TX', 'south'], ['GA', 'southeast']])
  assert.deepEqual(a.brokers.map((b) => b.name), ['TQL', 'CH Robinson'])
  assert.equal(regionOfState('ZZ'), 'other')
})

test('seasonality: months, average over active months, top trucks', () => {
  const a = buildAnalytics(
    [load({ pickupDate: '2026-01-10', rate: 1000 }), load({ pickupDate: '2026-03-10', rate: 3000 }), load({ pickupDate: '2025-03-10', rate: 1000 })],
    trucks,
    today,
  )
  assert.deepEqual(a.years.map((y) => y.year), ['2026', '2025'])
  const y = a.years[0]!
  assert.equal(y.months[0], 1000)
  assert.equal(y.months[2], 3000)
  assert.equal(y.monthAvg, 2000)
  assert.equal(y.totalDelta, '+300%')
  assert.deepEqual(y.trucks.map((t) => [t.name, t.total, t.ids.length]), [['#101 · Juan P.', 4000, 2]])
  assert.equal(y.monthIds[2]!.length, 1)
})

test('every clickable point carries the ids of its loads', () => {
  const a = buildAnalytics([load({ id: 7, pickupDate: '2026-10-19' }), load({ id: 8 })], trucks, today)
  assert.deepEqual(a.revenue.series.find((p) => p.day === '2026-10-19')!.ids, [7])
  assert.deepEqual(a.week.ids[0], [7])
  assert.deepEqual(a.states[0]!.ids[1]!.sort(), [7, 8])
  assert.deepEqual(a.trucks[0]!.ids.sort(), [7, 8])
  assert.deepEqual(a.kpi.ids30.sort(), [7, 8])
  assert.ok(a.rows.some((r) => r.id === 7))
})

test('kpi: miles, $/mi, deadhead share', () => {
  const a = buildAnalytics([load({ rate: 1000, loadedMiles: 400, deadheadMiles: 100 })], trucks, today)
  assert.equal(a.kpi.miles.now, 500)
  assert.equal(a.kpi.rpm.now, 2)
  assert.equal(a.kpi.deadhead.now, 20)
  assert.equal(a.kpi.revenue.weeks.length, 12)
  assert.equal(a.kpi.revenue.weeks.at(-1), 1000)
})

test('lanes and brokers keyed for links', () => {
  const a = buildAnalytics(
    [load({ id: 1, brokerMc: 'MC 12345' }), load({ id: 2, brokerMc: 'MC 12345' })],
    trucks,
    today,
  )
  assert.deepEqual(a.lanes.map((l) => [l.from, l.to, l.count]), [['TX', 'GA', 2]])
  assert.equal(a.brokers[0]!.key, '12345')
  assert.equal(a.brokers[0]!.loads, 2)
})

test('money stages: unpaid all time, paid only last 30 days', () => {
  assert.equal(stageOf({ status: 'delivered', invoicedAt: '2026-10-01', paidAt: null }), 'invoiced')
  const a = buildAnalytics(
    [
      load({ id: 1, status: 'booked', pickupDate: '2026-10-30' }),
      load({ id: 2, status: 'paid', paidAt: '2026-10-20T10:00:00.000Z' }),
      load({ id: 3, status: 'paid', paidAt: '2026-08-01T10:00:00.000Z' }),
      load({ id: 4, status: 'delivered', invoicedAt: null, paidAt: null }),
    ],
    trucks,
    today,
  )
  assert.deepEqual(a.stages.booked.ids, [1])
  assert.deepEqual(a.stages.paid.ids, [2])
  assert.deepEqual(a.stages.delivered.ids, [4])
})
