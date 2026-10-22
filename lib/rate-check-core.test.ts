import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rateCheckFrom, withRate } from './rate-check-core.ts'

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
  assert.equal(r.target?.lowTotal, 5212) // $2.61 × 1,997 — от вилки в центах, как её видят
  assert.equal(r.dat?.diff, -4)
})

test('ниже вилки — сколько долларов не хватает за рейс', () => {
  const r = rateCheckFrom({ ...base, rate: 4800, miles: 1997, shipper: 3.15 })
  assert.equal(r.target?.verdict, 'below')
  assert.equal(r.target?.gap, 412) // $2.61 × 1,997 − $4,800
})

test('ставка из браузера к проверке без ставки даёт то же, что проверка со ставкой', () => {
  const full = rateCheckFrom({ ...base, rate: 4800, miles: 1997, shipper: 3.15 })
  const bare = rateCheckFrom({ ...base, rate: null, miles: null, shipper: 3.15 })
  assert.deepEqual(withRate(bare, 4800, 1997), full)
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

test('нелепая ставка за милю ($314/mi) — без вердикта и без «выше рынка на 9296%»', () => {
  // 22.10.2026: OH → WA, рынок DAT $3.34, а пришли мили не те — $3,140 за 10 mi.
  const r = rateCheckFrom({ ...base, dat: { region: 'OH, IN', rpm: 3.34, date: null }, rate: 3140, miles: 10, deadhead: 50, shipper: 3.15 })
  assert.equal(r.rpm, null)
  assert.equal(r.allInRpm, null)
  assert.equal(r.dat?.diff, null)
  assert.equal(r.dat?.rpm, 3.34) // сам рынок показываем
  assert.equal(r.target?.verdict, null)
  assert.equal(r.target?.gap, null)
  // и в другую сторону: $100 за 2,000 mi
  assert.equal(rateCheckFrom({ ...base, rate: 100, miles: 2000, shipper: 3 }).dat?.diff, null)
  // обычная короткая дорогая ставка остаётся: $900 за 120 mi = $7.50
  assert.equal(rateCheckFrom({ ...base, rate: 900, miles: 120, shipper: 3 }).rpm, 7.5)
})
