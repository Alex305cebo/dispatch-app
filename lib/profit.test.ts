import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcLoad, type TruckSettings } from './profit.ts'

const cpmTruck: TruckSettings = {
  mpg: 6.5,
  fuelPricePerGallon: 4.0,
  driverPay: { mode: 'cpm', centsPerMile: 60 },
  fixedCostPerDay: 250,
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
  assert.equal(r.fixed, 500)
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
    const be = calcLoad(load, truck).breakEvenRate
    const atBreakEven = calcLoad({ ...load, rate: be }, truck)
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
