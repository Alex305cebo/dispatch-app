import { test } from 'node:test'
import assert from 'node:assert/strict'
import { benchmarkRpm, emptyTable, ownRpmTable, rpmTableFrom, usdaOriginStates, usdaTable, type RpmBench } from './rpm-bench-core.ts'
import type { LoadRecord } from './map.ts'

const load = (p: Partial<LoadRecord>): LoadRecord =>
  ({ id: 1, status: 'delivered', rate: 2000, loadedMiles: 1000, origin: 'Dallas, TX', destination: 'Atlanta, GA', pickupDate: '2026-09-01', ...p }) as LoadRecord

test('таблица: весь гросс на все мили, направление и штат доставки, суммы из SQL с n', () => {
  const t = rpmTableFrom([
    { from: 'TX', to: 'GA', rate: 2000, miles: 1000 },
    { from: 'TX', to: 'GA', rate: 1000, miles: 250 },
    { from: 'CA', to: 'GA', rate: 6000, miles: 2000, n: 3 },
    { from: null, to: 'GA', rate: 500, miles: 100 },
    { from: 'TX', to: null, rate: 500, miles: 100 },
    { from: 'TX', to: 'FL', rate: 0, miles: 100 },
  ])
  assert.deepEqual(t.lane, { 'TX>GA': { rpm: 2.4, n: 2 }, 'CA>GA': { rpm: 3, n: 3 } })
  assert.deepEqual(t.into, { GA: { rpm: 2.84, n: 6 } })
})

test('наши рейт-коны за год — по направлению и по штату доставки', () => {
  const now = Date.parse('2026-09-16')
  const t = ownRpmTable(
    [
      load({ rate: 2000, loadedMiles: 1000 }),
      load({ id: 2, origin: 'Houston, TX', rate: 1000, loadedMiles: 250 }),
      load({ id: 3, origin: 'Laredo', destination: 'Atlanta, GA', rate: 3000, loadedMiles: 1000 }),
      load({ id: 4, status: 'cancelled', rate: 9000, loadedMiles: 100 }),
      load({ id: 5, pickupDate: '2025-01-01', rate: 9000, loadedMiles: 100 }),
      load({ id: 6, destination: 'Miami', rate: 9000, loadedMiles: 100 }),
    ],
    now,
  )
  assert.deepEqual(t.lane, { 'TX>GA': { rpm: 2.4, n: 2 } })
  assert.deepEqual(t.into, { GA: { rpm: 2.67, n: 3 } })
})

test('приоритет: направление точнее штата, DAT точнее наших, наши точнее USDA', () => {
  const bench: RpmBench = {
    dat: { lane: { 'TX>GA': { rpm: 2.9, n: 3 } }, into: { FL: { rpm: 2.5, n: 4 } } },
    own: { lane: { 'TX>FL': { rpm: 3.1, n: 1 } }, into: { GA: { rpm: 2.2, n: 5 }, NC: { rpm: 3.6, n: 2 } } },
    usda: { lane: { 'TX>NC': { rpm: 4.0, n: 2 } }, into: { NC: { rpm: 4.2, n: 6 }, MA: { rpm: 3.4, n: 9 } } },
    usdaWeek: '09/08/26',
  }
  assert.deepEqual(benchmarkRpm(bench, 'TX', 'GA'), { rpm: 2.9, n: 3, source: 'datLane', from: 'TX', to: 'GA' })
  // Своё направление (пусть и один рейт-кон) важнее DAT «в штат» откуда угодно
  assert.deepEqual(benchmarkRpm(bench, 'TX', 'FL'), { rpm: 3.1, n: 1, source: 'ownLane', from: 'TX', to: 'FL' })
  assert.equal(benchmarkRpm(bench, 'CA', 'FL')?.source, 'datInto')
  assert.equal(benchmarkRpm(bench, 'CA', 'GA')?.source, 'ownInto')
  assert.equal(benchmarkRpm(bench, 'TX', 'NC')?.source, 'usdaLane')
  assert.equal(benchmarkRpm(bench, 'CA', 'NC')?.source, 'ownInto')
  assert.deepEqual(benchmarkRpm(bench, 'CA', 'MA'), { rpm: 3.4, n: 9, source: 'usdaInto', from: null, to: 'MA' })
  // Ничего не нашлось — null, а не «примерно»
  assert.equal(benchmarkRpm(bench, 'CA', 'ME'), null)
  assert.equal(benchmarkRpm({ dat: emptyTable(), own: emptyTable(), usda: null, usdaWeek: null }, 'TX', 'GA'), null)
  assert.equal(benchmarkRpm(null, 'TX', 'GA'), null)
})

test('USDA: штаты из региона и текста района, город → штат, двойные строки CA/AZ — один раз в «в штат»', () => {
  const origin = 'IMPERIAL, COACHELLA VALLEYS CA, CENTRAL AND WESTERN AZ, MEXICO CROSSINGS THROUGH CALEXICO AND SAN LUIS'
  assert.deepEqual(usdaOriginStates('ARIZONA', origin), ['AZ'])
  assert.deepEqual(usdaOriginStates('CALIFORNIA', origin), ['CA'])
  assert.deepEqual(usdaOriginStates('MID-ATLANTIC', 'DELAWARE, MARYLAND AND EASTERN SHORE VIRGINIA'), ['DE', 'MD', 'VA'])
  assert.deepEqual(usdaOriginStates('PNW', 'YAKIMA VALLEY AND WENATCHEE DISTRICT, WASHINGTON'), ['WA'])
  assert.deepEqual(usdaOriginStates('SOUTHEAST', 'VIDALIA DISTRICT GEORGIA'), ['GA'])
  assert.deepEqual(usdaOriginStates('CENTRAL', 'WEST VIRGINIA'), ['WV'])
  const veg = 'LETTUCE, BROCCOLI'
  const { table, week } = usdaTable([
    { date: '2026-09-08T00:00:00.000', region: 'ARIZONA', origin, destination: 'ATLANTA', commodity: veg, distance: '2100', midpoint: '7100' },
    { date: '2026-09-08T00:00:00.000', region: 'CALIFORNIA', origin, destination: 'ATLANTA', commodity: veg, distance: '2100', midpoint: '7100' },
    { date: '2026-09-01T00:00:00.000', region: 'SOUTHEAST', origin: 'VIDALIA DISTRICT GEORGIA', destination: 'NEW YORK', commodity: 'ONIONS', distance: '900', midpoint: '3600' },
    { date: '2026-09-08T00:00:00.000', region: 'PNW', origin: 'YAKIMA VALLEY, WASHINGTON', destination: 'TORONTO', commodity: 'APPLES', distance: '2500', midpoint: '9000' },
    { date: '2026-09-08T00:00:00.000', region: 'PNW', origin: 'YAKIMA VALLEY, WASHINGTON', destination: 'DALLAS', commodity: 'APPLES', distance: '', midpoint: '5000' },
  ])
  assert.equal(week, '2026-09-08')
  assert.deepEqual(table.lane, { 'AZ>GA': { rpm: 3.38, n: 1 }, 'CA>GA': { rpm: 3.38, n: 1 }, 'GA>NY': { rpm: 4, n: 1 } })
  assert.deepEqual(table.into, { GA: { rpm: 3.38, n: 1 }, NY: { rpm: 4, n: 1 } })
})
