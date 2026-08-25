import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksTolled, stateOfCity, tollSpend, type TollLoad } from './toll-spend.ts'
import { nycZoneCost } from './toll-usa.ts'

const NOW = Date.parse('2026-08-25T12:00:00Z')
const day = (n: number) => new Date(NOW - n * 86400000).toISOString().slice(0, 10)

const load = (p: Partial<TollLoad>): TollLoad => ({
  id: 1,
  rate: 2000,
  miles: 1000,
  tolls: 100,
  origin: 'Chicago, IL',
  destination: 'Newark, NJ',
  status: 'delivered',
  at: day(3),
  ...p,
})

test('штат берётся из названия города', () => {
  assert.equal(stateOfCity('Dallas, TX'), 'TX')
  assert.equal(stateOfCity('winston-salem, nc'), 'NC')
  assert.equal(stateOfCity('Chicago'), null)
  assert.equal(stateOfCity(null), null)
})

test('рейс между платными штатами помечается к проверке', () => {
  assert.equal(looksTolled(load({ origin: 'Chicago, IL', destination: 'Newark, NJ' })), true)
  // Ни один конец не в платном штате — повода проверять нет.
  assert.equal(looksTolled(load({ origin: 'Boise, ID', destination: 'Helena, MT' })), false)
})

test('считается только то, что попало в период', () => {
  const s = tollSpend([load({ id: 1, tolls: 50, at: day(3) }), load({ id: 2, tolls: 999, at: day(60) })], 30, NOW)
  assert.equal(s.total, 50)
  assert.equal(s.counted, 1)
})

test('отменённые и заявки в расходы не идут', () => {
  const s = tollSpend(
    [load({ id: 1, tolls: 40, status: 'cancelled' }), load({ id: 2, tolls: 60, status: 'quoted' })],
    30,
    NOW,
  )
  assert.equal(s.total, 0)
})

test('толлы на милю считаются по всем милям этих рейсов', () => {
  const s = tollSpend([load({ id: 1, tolls: 100, miles: 500 }), load({ id: 2, tolls: 200, miles: 1500 })], 30, NOW)
  assert.equal(s.perMile.toFixed(3), (300 / 2000).toFixed(3))
})

test('доля от гросса считается от всей выручки периода, а не только платных рейсов', () => {
  const s = tollSpend(
    [load({ id: 1, rate: 1000, tolls: 100 }), load({ id: 2, rate: 1000, tolls: null, origin: 'Boise, ID', destination: 'Helena, MT' })],
    30,
    NOW,
  )
  assert.equal(s.shareOfGross.toFixed(1), '5.0')
})

test('непосчитанный толл — это не ноль, а отдельная строка «проверить»', () => {
  const s = tollSpend([load({ id: 7, tolls: null, origin: 'Chicago, IL', destination: 'Newark, NJ' })], 30, NOW)
  assert.equal(s.total, 0)
  assert.equal(s.missing.length, 1)
  assert.equal(s.missing[0]!.id, 7)
})

test('рейс вне платных штатов без толлов не поднимает ложную тревогу', () => {
  const s = tollSpend([load({ tolls: null, origin: 'Boise, ID', destination: 'Helena, MT' })], 30, NOW)
  assert.deepEqual(s.missing, [])
})

test('самые дорогие рейсы идут первыми', () => {
  const s = tollSpend([load({ id: 1, tolls: 20 }), load({ id: 2, tolls: 300 }), load({ id: 3, tolls: 90 })], 30, NOW)
  assert.deepEqual(s.top.map((l) => l.id), [2, 3, 1])
})

// Манхэттен: у грузовиков платится КАЖДЫЙ въезд, дневного потолка нет.
test('въезд в зону Манхэттена: каждый въезд платный, ночью на 75% дешевле', () => {
  assert.equal(nycZoneCost(3, 'large', false), 64.8)
  assert.equal(nycZoneCost(3, 'large', true), 16.2)
  assert.equal(nycZoneCost(0, 'large', false), 0)
})
