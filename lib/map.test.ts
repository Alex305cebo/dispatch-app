import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rowToLoad, rowToTruck, type LoadRow, type TruckRow } from './map.ts'
import { calcLoad } from './profit.ts'

const truckRow: TruckRow = {
  id: 1,
  name: 'Truck 1',
  number: '425',
  driver_name: 'Ravil',
  mpg: 6.5,
  fuel_price_per_gallon: 4.0,
  driver_pay_mode: 'cpm',
  driver_cents_per_mile: 60,
  driver_percent_of_gross: null,
  truck_payment_per_day: 60,
  insurance_per_day: 40,
  eld_permits_per_day: 8,
  maintenance_cost_per_mile: 0.18,
  factoring_percent: 2,
  dispatch_percent: 0,
}

const loadRow: LoadRow = {
  id: 7,
  truck_id: 1,
  status: 'booked',
  rate: 2400,
  loaded_miles: 1000,
  deadhead_miles: 100,
  transit_days: 2,
  origin: 'Chicago, IL',
  destination: 'Dallas, TX',
  truck_location: 'Joliet, IL',
  spot_rpm: 2.15,
  broker_mc: '123456',
  broker_email: 'ops@broker.com',
  broker_phone: '(555) 123-4567',
  reference_id: '9911',
  pickup_date: new Date('2026-07-20T00:00:00Z'),
  source: 'qr',
  created_at: new Date('2026-07-17T12:00:00Z'),
}

// The bridge is the money path. If a snake_case key is mistyped the value lands as
// undefined and calcLoad silently produces a plausible-but-wrong number — this
// asserts the mapped row computes identically to hand-built literals.
test('a mapped row computes the same money as literals', () => {
  const viaDb = calcLoad(rowToLoad(loadRow), rowToTruck(truckRow))
  const viaLiterals = calcLoad(
    { rate: 2400, loadedMiles: 1000, deadheadMiles: 100, transitDays: 2 },
    {
      mpg: 6.5,
      fuelPricePerGallon: 4.0,
      driverPay: { mode: 'cpm', centsPerMile: 60 },
      truckPaymentPerDay: 60,
      insurancePerDay: 40,
      eldPermitsPerDay: 8,
      maintenanceCostPerMile: 0.18,
      factoringPercent: 2,
      dispatchPercent: 0,
    },
  )
  assert.deepEqual(viaDb, viaLiterals)
})

test('cpm mode maps to the cpm arm', () => {
  const t = rowToTruck(truckRow)
  assert.deepEqual(t.driverPay, { mode: 'cpm', centsPerMile: 60 })
})

test('percent mode maps to the percent arm, not cpm', () => {
  const t = rowToTruck({
    ...truckRow,
    driver_pay_mode: 'percent',
    driver_cents_per_mile: null,
    driver_percent_of_gross: 25,
  })
  assert.deepEqual(t.driverPay, { mode: 'percent', percentOfGross: 25 })
  // Paid off gross, not miles — the whole point of the branch.
  assert.equal(calcLoad(rowToLoad(loadRow), t).driver, 600)
})

test('dates arrive as ISO strings, not Date objects', () => {
  const l = rowToLoad(loadRow)
  assert.equal(l.pickupDate, '2026-07-20')
  assert.equal(l.createdAt, '2026-07-17T12:00:00.000Z')
})

test('null date stays null', () => {
  assert.equal(rowToLoad({ ...loadRow, pickup_date: null }).pickupDate, null)
})

test('every calcLoad input carries over — no undefined slips through', () => {
  const l = rowToLoad(loadRow)
  for (const k of ['rate', 'loadedMiles', 'deadheadMiles', 'transitDays'] as const) {
    assert.equal(typeof l[k], 'number', `${k} must be a number, got ${l[k]}`)
  }
})
