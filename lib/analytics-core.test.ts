import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, buildAnalytics, deltaPct, metricValue, regionOfState, stageOf, stateOf, toALoads } from './analytics-core.ts'
import type { LoadRecord, TruckRecord } from './map.ts'

const load = (patch: Partial<LoadRecord> = {}) =>
  ({
    id: 1, truckId: 1, status: 'delivered', rate: 1000, loadedMiles: 400, deadheadMiles: 0,
    pickupDate: '2026-10-20', deliveryDate: '2026-10-21', origin: 'Dallas, TX', destination: 'Atlanta, GA',
    brokerName: 'TQL', ...patch,
  }) as LoadRecord
const trucks = [
  { id: 1, name: 'T1', number: '101', driverName: 'Juan Perez', unavailable: null },
  { id: 2, name: 'T2', number: '102', driverName: 'Ann Lee', unavailable: null },
] as TruckRecord[]
const aTrucks = [{ id: 1, name: '#101 · Juan P.' }, { id: 2, name: '#102 · Ann L.' }]
const today = '2026-10-22'
const rows = (xs: LoadRecord[]) => toALoads(xs, trucks, (iso) => iso.slice(0, 10))
const build = (xs: LoadRecord[], days = 30) => buildAnalytics(rows(xs), aTrucks, today, days)

test('addDays crosses month and year', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31')
})

test('deltaPct: sign, rounding, empty base', () => {
  assert.equal(deltaPct(120, 100), '+20%')
  assert.equal(deltaPct(90, 100), '-10%')
  assert.equal(deltaPct(5, 0), '')
})

test('stateOf reads codes, addresses and full names, not country codes', () => {
  assert.equal(stateOf('Dallas, TX'), 'TX')
  assert.equal(stateOf(null, '1200 Main St, Las Vegas NV 89101'), 'NV')
  assert.equal(stateOf('Memphis, Tennessee'), 'TN')
  assert.equal(stateOf('Laredo, TX, US'), 'TX')
  assert.equal(stateOf('Warehouse 7'), null)
})

test('toALoads drops quotes and cancels, finds the state in the address', () => {
  const r = rows([
    load({ id: 1 }),
    load({ id: 2, status: 'quoted' }),
    load({ id: 3, status: 'cancelled' }),
    load({ id: 4, origin: 'Amazon DFW7', pickupAddress: '700 Westport Pkwy, Fort Worth, TX 76177' }),
  ])
  assert.deepEqual(r.map((x) => x.id), [1, 4])
  assert.equal(r[1]!.os, 'TX')
  assert.equal(r[0]!.truck, '#101 · Juan P.')
})

test('future and dateless loads stay out of revenue', () => {
  const a = build([load({ rate: 1000 }), load({ rate: 900, pickupDate: '2026-10-25' }), load({ rate: 300, pickupDate: null })])
  assert.equal(a.kpi.revenue.now, 1000)
  assert.equal(a.series.length, 30)
  assert.equal(a.series.at(-1)!.to, today)
  assert.equal(a.series.at(-3)!.revenue, 1000)
})

test('period buttons: 7 and 90 days by day, a year by week, compared with the period before', () => {
  const xs = [load({ id: 1, rate: 400, pickupDate: '2026-09-30' }), load({ id: 2, rate: 600 }), load({ id: 3, rate: 500, pickupDate: '2026-09-01' })]
  assert.equal(build(xs, 7).series.length, 7)
  assert.equal(build(xs, 7).kpi.revenue.now, 600)
  assert.equal(build(xs, 30).kpi.revenue.delta, '+100%')
  assert.equal(build(xs, 90).series.length, 90)
  const y = build(xs, 365)
  assert.equal(y.series.length, 53)
  assert.equal(y.kpi.revenue.now, 1500)
  assert.deepEqual(y.series.at(-1)!.ids, [2])
})

test('metricValue: same totals give every key number', () => {
  const x = { revenue: 3000, loads: 2, miles: 1200, dh: 300 }
  assert.equal(metricValue('revenue', x), 3000)
  assert.equal(metricValue('rpm', x), 2.5)
  assert.equal(metricValue('avg', x), 1500)
  assert.equal(metricValue('deadhead', x), 25)
})

test('weekday buckets: Monday first, pickups and deliveries apart', () => {
  // 2026-10-19 — понедельник, 2026-10-21 — среда.
  const a = build([load({ pickupDate: '2026-10-19', deliveryDate: '2026-10-21' })])
  assert.deepEqual(a.week.pickups[0], [1, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(a.week.deliveries[0], [0, 0, 1, 0, 0, 0, 0])
  assert.equal(a.week.count, 1)
})

test('states group into regions, unknown state goes to other', () => {
  const a = build([
    load({ id: 1, origin: 'Dallas, TX', rate: 2000 }),
    load({ id: 2, origin: 'Atlanta, GA', rate: 1000, brokerName: 'CH Robinson' }),
    load({ id: 3, origin: 'Yard 5', rate: 100 }),
  ])
  assert.deepEqual(a.states.map((s) => [s.name, s.group]), [['TX', 'south'], ['GA', 'southeast'], ['other', 'other']])
  assert.deepEqual(a.brokers.map((b) => b.name), ['TQL', 'CH Robinson'])
  assert.equal(regionOfState('ZZ'), 'other')
})

test('seasonality: months, average over active months, top trucks', () => {
  const a = build([load({ pickupDate: '2026-01-10', rate: 1000 }), load({ pickupDate: '2026-03-10', rate: 3000 }), load({ pickupDate: '2025-03-10', rate: 1000 })])
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
  const a = build([load({ id: 7, pickupDate: '2026-10-19' }), load({ id: 8 })])
  assert.deepEqual(a.series.find((p) => p.to === '2026-10-19')!.ids, [7])
  assert.deepEqual(a.week.ids[0], [7])
  assert.deepEqual(a.states[0]!.ids[1]!.sort(), [7, 8])
  assert.deepEqual(a.trucks[0]!.ids.sort(), [7, 8])
  assert.deepEqual(a.kpi.ids.sort(), [7, 8])
})

test('kpi: miles, $/mi, deadhead share, 12 spark bars', () => {
  const a = build([load({ rate: 1000, loadedMiles: 400, deadheadMiles: 100 })])
  assert.equal(a.kpi.miles.now, 500)
  assert.equal(a.kpi.rpm.now, 2)
  assert.equal(a.kpi.deadhead.now, 20)
  assert.equal(a.kpi.revenue.spark.length, 12)
  assert.equal(a.kpi.revenue.spark.at(-1), 1000)
})

test('trucks list every truck, even idle; brokers and lanes keyed for links', () => {
  const a = build([load({ id: 1, brokerMc: 'MC 12345' }), load({ id: 2, brokerMc: 'MC 12345' })])
  assert.deepEqual(a.trucks.map((t) => [t.id, t.loads]), [[1, 2], [2, 0]])
  assert.deepEqual(a.lanes.map((l) => [l.from, l.to, l.count]), [['TX', 'GA', 2]])
  assert.equal(a.brokers[0]!.key, '12345')
  assert.equal(a.brokers[0]!.loads, 2)
})

test('rate buckets: loads land by $/mi, no-mile loads skipped', () => {
  const a = build([
    load({ id: 1, rate: 500, loadedMiles: 400 }), // 1.25
    load({ id: 2, rate: 900, loadedMiles: 400 }), // 2.25
    load({ id: 3, rate: 2000, loadedMiles: 400 }), // 5
    load({ id: 4, rate: 800, loadedMiles: 0 }),
  ])
  assert.deepEqual(a.rpmDist.map((b) => b.ids), [[1], [], [2], [], [], [3]])
})

test('money stages: unpaid all time, paid only inside the period', () => {
  assert.equal(stageOf({ status: 'delivered', invoiced: true, paidDay: null }), 'invoiced')
  const xs = [
    load({ id: 1, status: 'booked', pickupDate: '2026-10-30' }),
    load({ id: 2, status: 'paid', paidAt: '2026-10-20T10:00:00.000Z' }),
    load({ id: 3, status: 'paid', paidAt: '2026-08-01T10:00:00.000Z' }),
    load({ id: 4, status: 'delivered', invoicedAt: null, paidAt: null }),
  ]
  const a = build(xs)
  assert.deepEqual(a.stages.booked.ids, [1])
  assert.deepEqual(a.stages.paid.ids, [2])
  assert.deepEqual(a.stages.delivered.ids, [4])
  assert.deepEqual(build(xs, 365).stages.paid.ids.sort(), [2, 3])
})
