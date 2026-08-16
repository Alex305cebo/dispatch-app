import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costPerIdleDay, idleFleet, idleSummary } from './idle-fleet.ts'
import type { LoadRecord, TruckRecord } from './map.ts'

const NOW = Date.parse('2026-08-16T12:00:00Z')

function truck(id: number, over: Partial<TruckRecord> = {}): TruckRecord {
  return {
    id,
    name: `Truck ${id}`,
    number: String(1000 + id),
    driverName: `Driver ${id}`,
    unavailable: null,
    mpg: 6.5,
    fuelPricePerGallon: 4,
    driverPay: { mode: 'cpm', centsPerMile: 60 },
    truckPaymentPerDay: 60,
    insurancePerDay: 40,
    eldPermitsPerDay: 8,
    maintenanceCostPerMile: 0.18,
    factoringPercent: 2,
    dispatchPercent: 0,
    ...over,
  } as TruckRecord
}

function load(over: Partial<LoadRecord>): LoadRecord {
  return {
    id: 1,
    truckId: 1,
    status: 'delivered',
    rate: 2000,
    loadedMiles: 800,
    deadheadMiles: 50,
    transitDays: 2,
    origin: 'A, IL',
    destination: 'B, TX',
    deliveryDate: '2026-08-10',
    createdAt: '2026-08-08T00:00:00Z',
    ...over,
  } as LoadRecord
}

test('постоянные расходы в сутки — платёж, страховка, ELD', () => {
  assert.equal(costPerIdleDay(truck(1)), 108)
})

test('стоящий трак: считает дни от последней выгрузки и цену простоя', () => {
  const rows = idleFleet([truck(1)], [load({ truckId: 1 })], new Map([[1, 'York, NE']]), NOW)
  assert.equal(rows[0]!.free, true)
  assert.equal(rows[0]!.days, 6) // 10 → 16 августа
  assert.equal(rows[0]!.idleCost, 6 * 108)
  assert.equal(rows[0]!.place, 'York, NE')
})

test('едущий трак: место — город выгрузки, дни отрицательные (ещё ехать)', () => {
  const rows = idleFleet(
    [truck(1)],
    [load({ truckId: 1, status: 'in_transit', deliveryDate: '2026-08-19', destination: 'NEWARK, CA' })],
    new Map(),
    NOW,
  )
  assert.equal(rows[0]!.free, false)
  assert.equal(rows[0]!.place, 'NEWARK, CA')
  assert.equal(rows[0]!.days, -3)
  assert.equal(rows[0]!.idleCost, 0)
})

test('отменённый груз не считается работой', () => {
  const rows = idleFleet([truck(1)], [load({ truckId: 1, status: 'cancelled' })], new Map(), NOW)
  assert.equal(rows[0]!.free, true)
  assert.equal(rows[0]!.days, null) // выгрузок не было вовсе
})

test('порядок: дольше всех стоящий сверху, занятые ниже, ремонт в самом конце', () => {
  const rows = idleFleet(
    [
      truck(1, { unavailable: 'repair' }),
      truck(2),
      truck(3),
      truck(4),
    ],
    [
      load({ id: 2, truckId: 2, deliveryDate: '2026-08-14' }), // стоит 2 дня
      load({ id: 3, truckId: 3, deliveryDate: '2026-08-05' }), // стоит 11 дней
      load({ id: 4, truckId: 4, status: 'in_transit', deliveryDate: '2026-08-18' }),
    ],
    new Map(),
    NOW,
  )
  assert.deepEqual(rows.map((r) => r.truckId), [3, 2, 4, 1])
})

test('в шапке — только те, кого реально можно загрузить', () => {
  const rows = idleFleet(
    [truck(1), truck(2), truck(3, { unavailable: 'repair' })],
    [load({ id: 2, truckId: 2, status: 'booked', deliveryDate: '2026-08-20' })],
    new Map(),
    NOW,
  )
  const s = idleSummary(rows)
  assert.equal(s.freeCount, 1) // #2 везёт груз, #3 в ремонте
  assert.equal(s.burnPerDay, 108)
})

test('дата «свободен с» не уезжает на день назад из-за часового пояса', () => {
  const rows = idleFleet([truck(1)], [load({ truckId: 1, deliveryDate: '2026-08-10' })], new Map(), NOW)
  assert.equal(rows[0]!.since, '2026-08-10')
})
