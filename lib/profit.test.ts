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

test('порожние мили: доля и цена считаются по тем же ставкам, что и рейс', () => {
  const load = { rate: 2000, loadedMiles: 800, deadheadMiles: 200, transitDays: 2 }
  const cpm = calcLoad(load, {
    mpg: 6,
    fuelPricePerGallon: 4.2,
    driverPay: { mode: 'cpm', centsPerMile: 60 },
    maintenanceCostPerMile: 0.15,
    truckPaymentPerDay: 60,
    insurancePerDay: 40,
    eldPermitsPerDay: 8,
    factoringPercent: 2,
    dispatchPercent: 4,
  })
  assert.equal(cpm.deadheadMiles, 200)
  assert.equal(Math.round(cpm.deadheadPercent), 20) // 200 из 1000
  // 200 миль × (4.2/6 топливо + 0.15 обслуживание + 0.60 водителю) = 290
  assert.equal(Math.round(cpm.deadheadCost), 290)
})

test('при проценте от гросса порожняк не тянет зарплату водителя', () => {
  const load = { rate: 2000, loadedMiles: 800, deadheadMiles: 200, transitDays: 2 }
  const pct = calcLoad(load, {
    mpg: 6,
    fuelPricePerGallon: 4.2,
    driverPay: { mode: 'percent', percentOfGross: 25 },
    maintenanceCostPerMile: 0.15,
    truckPaymentPerDay: 60,
    insurancePerDay: 40,
    eldPermitsPerDay: 8,
    factoringPercent: 2,
    dispatchPercent: 4,
  })
  // 200 × (0.7 + 0.15) = 170 — без зарплаты, она считается от ставки
  assert.equal(Math.round(pct.deadheadCost), 170)
})

test('нет порожняка — нет и его цены', () => {
  const r = calcLoad(
    { rate: 2000, loadedMiles: 800, deadheadMiles: 0, transitDays: 2 },
    {
      mpg: 6,
      fuelPricePerGallon: 4.2,
      driverPay: { mode: 'cpm', centsPerMile: 60 },
      maintenanceCostPerMile: 0.15,
      truckPaymentPerDay: 60,
      insurancePerDay: 40,
      eldPermitsPerDay: 8,
      factoringPercent: 2,
      dispatchPercent: 4,
    },
  )
  assert.equal(r.deadheadCost, 0)
  assert.equal(r.deadheadPercent, 0)
})
