import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcLoad, type TruckSettings } from './profit.ts'

/** Копейки: сравниваем деньги, а не двоичное представление float. */
const r2 = (n: number) => Math.round(n * 100) / 100

const cpmTruck: TruckSettings = {
  mpg: 6.5,
  fuelPricePerGallon: 4.0,
  driverPay: { mode: 'cpm', centsPerMile: 60 },
  // Sums to the same 250/day as before the truck-payment/insurance/ELD split, so the
  // rest of this test's numbers (net, breakEvenRate, etc.) didn't need to change.
  truckPaymentPerDay: 150,
  insurancePerDay: 80,
  eldPermitsPerDay: 20,
  maintenanceCostPerMile: 0.18,
  factoringPercent: 2,
  dispatchPercent: 0,
}

const pctTruck: TruckSettings = {
  ...cpmTruck,
  driverPay: { mode: 'percent', percentOfGross: 25 },
  dispatchPercent: 5,
}

const load = { rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2 }

test('cpm load breakdown', () => {
  const r = calcLoad(load, cpmTruck)
  assert.equal(r.totalMiles, 1100)
  assert.equal(r.fuel, (1100 / 6.5) * 4.0)
  assert.equal(r.driver, 660)
  assert.equal(r.maintenance, 198)
  assert.equal(r.truckPayment, 300)
  assert.equal(r.insurance, 160)
  assert.equal(r.eldPermits, 40)
  assert.equal(r.factoring, 48)
  assert.equal(r.net, r.gross - r.totalCost)
  assert.equal(r.loadedRpm, 2.4)
  assert.ok(Math.abs(r.allInRpm - 2400 / 1100) < 1e-9)
})

test('percent driver is paid off gross, not miles', () => {
  const r = calcLoad(load, pctTruck)
  assert.equal(r.driver, 600)
  assert.equal(r.dispatch, 120)
})

// The invariant that matters: hauling at exactly break-even nets zero.
for (const [name, truck] of [
  ['cpm', cpmTruck],
  ['percent', pctTruck],
] as const) {
  test(`break-even rate nets zero (${name})`, () => {
    const be = calcLoad(load, cpmTruck).breakEvenRate
    const atBreakEven = calcLoad({ ...load, rate: be }, cpmTruck)
    assert.ok(
      Math.abs(atBreakEven.net) < 1e-9,
      `expected net ~0 at rate ${be}, got ${atBreakEven.net}`,
    )
  })
}

test('rejects inputs that would divide by zero or silently lie', () => {
  assert.throws(() => calcLoad(load, { ...cpmTruck, mpg: 0 }), /MPG/)
  assert.throws(() => calcLoad({ ...load, loadedMiles: 0 }, cpmTruck), /Loaded miles/)
  assert.throws(() => calcLoad({ ...load, transitDays: 0 }, cpmTruck), /Transit days/)
  assert.throws(() => calcLoad({ ...load, deadheadMiles: -1 }, cpmTruck), /Deadhead/)
  assert.throws(
    () => calcLoad(load, { ...pctTruck, factoringPercent: 80 }),
    /under 100%/,
  )
})

test('толлы входят в себестоимость и съедают чистую ровно на свою сумму', () => {
  const base = calcLoad({ rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2 }, cpmTruck)
  const withTolls = calcLoad(
    { rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2, tolls: 150 },
    cpmTruck,
  )
  assert.equal(withTolls.tolls, 150)
  assert.equal(r2(base.net - withTolls.net), 150)
  assert.equal(r2(withTolls.totalCost - base.totalCost), 150)
})

test('без толлов ни одна прежняя цифра не сдвинулась', () => {
  const a = calcLoad({ rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2 }, cpmTruck)
  const b = calcLoad(
    { rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2, tolls: 0 },
    cpmTruck,
  )
  assert.deepEqual(a, b)
  assert.equal(a.tolls, 0)
})

test('толлы поднимают точку безубыточности — ставка ниже неё теперь в минус', () => {
  const plain = calcLoad({ rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2 }, cpmTruck)
  const tolled = calcLoad(
    { rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2, tolls: 150 },
    cpmTruck,
  )
  assert.ok(tolled.breakEvenRate > plain.breakEvenRate)
  // На ставке ровно в break-even чистая нулевая — и с толлами тоже.
  const atBreakEven = calcLoad(
    { rate: tolled.breakEvenRate, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2, tolls: 150 },
    cpmTruck,
  )
  assert.equal(r2(atBreakEven.net), 0)
})

test('отрицательные толлы отвергаются, а не тихо уменьшают себестоимость', () => {
  assert.throws(() =>
    calcLoad({ rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2, tolls: -50 }, cpmTruck),
  )
})
