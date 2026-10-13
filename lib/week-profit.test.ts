import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcLoad, type TruckSettings } from './profit.ts'
import { COST_GROUPS, groupCosts, weekProfit } from './week-profit.ts'

/** Копейки: сравниваем деньги, а не двоичное представление float. */
const r2 = (n: number) => Math.round(n * 100) / 100

const settings: TruckSettings = {
  mpg: 6.5,
  fuelPricePerGallon: 4.0,
  driverPay: { mode: 'cpm', centsPerMile: 60 },
  truckPaymentPerDay: 150,
  insurancePerDay: 80,
  eldPermitsPerDay: 20,
  maintenanceCostPerMile: 0.18,
  factoringPercent: 2,
  dispatchPercent: 5,
}
const a = { ...settings, id: 1 }
const b = { ...settings, id: 2, driverPay: { mode: 'percent' as const, percentOfGross: 25 } }

const load = (truckId: number | null, rate: number, miles: number, tolls = 0) => ({
  truckId,
  rate,
  loadedMiles: miles,
  deadheadMiles: 50,
  transitDays: 2,
  tolls,
})

test('четыре полосы расходов складываются ровно в расход груза', () => {
  const br = calcLoad(load(1, 2400, 1000, 35), a)
  const g = groupCosts(br)
  assert.equal(r2(COST_GROUPS.reduce((s, k) => s + g[k], 0)), r2(br.totalCost))
  assert.equal(r2(g.fees), r2(35 + 2400 * 0.07))
})

test('неделя: суммы по грузам, по тракам — самый прибыльный первым', () => {
  const loads = [load(1, 2400, 1000), load(2, 3000, 900), load(1, 900, 600)]
  const p = weekProfit(loads, [a, b])
  const each = [calcLoad(loads[0]!, a), calcLoad(loads[1]!, b), calcLoad(loads[2]!, a)]
  assert.equal(p.gross, 6300)
  assert.equal(r2(p.cost), r2(each.reduce((s, x) => s + x.totalCost, 0)))
  assert.equal(r2(p.net), r2(p.gross - p.cost))
  assert.equal(r2(COST_GROUPS.reduce((s, k) => s + p.costs[k], 0)), r2(p.cost))
  assert.deepEqual(
    p.byTruck.map((r) => r.truckId),
    [...p.byTruck].sort((x, y) => y.net - x.net).map((r) => r.truckId),
  )
  const one = p.byTruck.find((r) => r.truckId === 1)!
  assert.equal(one.loads, 2)
  assert.equal(one.gross, 3300)
  assert.equal(r2(one.net), r2(each[0]!.net + each[2]!.net))
  assert.equal(p.unpriced, 0)
})

test('груз без трака и трак, по карте которого не посчитать, — не в суммах', () => {
  const broken = { ...settings, id: 3, mpg: 0 }
  const p = weekProfit([load(null, 1500, 500), load(3, 2000, 800), load(1, 2400, 1000)], [a, broken])
  assert.equal(p.unpriced, 2)
  assert.equal(p.gross, 2400)
  assert.deepEqual(
    p.byTruck.map((r) => r.truckId),
    [1],
  )
})

test('пустая неделя — нули, а не NaN', () => {
  const p = weekProfit([], [a])
  assert.deepEqual([p.gross, p.cost, p.net, p.unpriced, p.byTruck.length], [0, 0, 0, 0, 0])
  assert.deepEqual(p.costs, { fuel: 0, driver: 0, truck: 0, fees: 0 })
})
