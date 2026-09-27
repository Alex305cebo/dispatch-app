import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateCheckFrom } from './rate-check-core.ts'

const base = {
  cut: { share: 0.83, n: 59 },
  dat: { region: 'West', rpm: 2.92, date: '09/27/26' },
  destDat: { region: 'Southeast', rpm: 2.6 },
  origin: null,
  dest: null,
  history: null,
}

test('ставка в вилке: цель, доля брокера, рынок DAT', () => {
  // Flagstaff → Eden: $5,600 за 1,997 mi = $2.80; цена грузоотправителя $3.15
  const r = rateCheckFrom({ ...base, rate: 5600, miles: 1997, shipper: 3.15 })
  assert.equal(r.rpm, 2.8)
  assert.equal(r.target?.low, 2.61)
  assert.equal(r.target?.high, 2.84)
  assert.equal(r.target?.verdict, 'inside')
  assert.equal(r.target?.gap, null)
  assert.equal(r.target?.brokerPct, 17)
  assert.equal(r.target?.brokerTake, 0.54)
  assert.equal(r.target?.lowTotal, 5221)
  assert.equal(r.dat?.diff, -4)
})

test('ниже вилки — сколько долларов не хватает за рейс', () => {
  const r = rateCheckFrom({ ...base, rate: 4800, miles: 1997, shipper: 3.15 })
  assert.equal(r.target?.verdict, 'below')
  assert.equal(r.target?.gap, 421) // 3.15 × 0.83 × 1,997 − 4,800
})

test('доля по брокеру важнее общей, если по нему сравнений хватает', () => {
  const cut = { share: 0.83, n: 59, byBroker: { 'total quality logistics': { share: 0.78, n: 8 } } }
  const r = rateCheckFrom({ ...base, cut, broker: 'TQL', rate: 3000, miles: 1000, shipper: 3.5 })
  assert.equal(r.target?.broker, 'total quality logistics')
  assert.equal(r.target?.n, 8)
  assert.equal(r.target?.brokerPct, 22)
})

test('без цены грузоотправителя цели нет, но рынок и мили на месте; Deadhead — в all-in', () => {
  const r = rateCheckFrom({ ...base, rate: 2000, miles: 800, deadhead: 100, shipper: null })
  assert.equal(r.target, null)
  assert.equal(r.rpm, 2.5)
  assert.equal(r.allInRpm, 2.22)
  assert.equal(r.dat?.rpm, 2.92)
  // нет ставки — нет и сравнения с рынком, но сам рынок показываем
  const empty = rateCheckFrom({ ...base, rate: null, miles: 800, shipper: 3 })
  assert.equal(empty.rpm, null)
  assert.equal(empty.target?.verdict, null)
  assert.equal(empty.dat?.diff, null)
  assert.equal(empty.target?.lowTotal, Math.round(3 * 0.83 * 800))
})
