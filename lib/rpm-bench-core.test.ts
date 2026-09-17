import { test } from 'node:test'
import assert from 'node:assert/strict'
import { benchmarkRpm, emptyTable, rpmTableFrom, usdaOriginStates, usdaTable, type RpmBench } from './rpm-bench-core.ts'

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

test('ставка — только по самому маршруту: DAT с доски, иначе USDA, иначе Warp; «в штат откуда угодно» не считается', () => {
  const bench: RpmBench = {
    dat: { lane: { 'TX>GA': { rpm: 2.9, n: 3 } }, into: { FL: { rpm: 2.5, n: 4 } } },
    usda: { lane: { 'TX>GA': { rpm: 3.3, n: 1 }, 'TX>NC': { rpm: 4.0, n: 2 } }, into: { NC: { rpm: 4.2, n: 6 } } },
    usdaWeek: '09/08/26',
    // Котировка грузоотправителя: только там, где нет ни DAT, ни USDA
    warp: { lane: { 'TX>GA': { rpm: 5.1, n: 1 }, 'TX>NC': { rpm: 5.2, n: 1 }, 'TX>OH': { rpm: 3.7, n: 1 } }, into: {} },
  }
  assert.deepEqual(benchmarkRpm(bench, 'TX', 'GA'), { rpm: 2.9, n: 3, source: 'datLane', from: 'TX', to: 'GA' })
  assert.deepEqual(benchmarkRpm(bench, 'TX', 'NC'), { rpm: 4, n: 2, source: 'usdaLane', from: 'TX', to: 'NC' })
  assert.deepEqual(benchmarkRpm(bench, 'TX', 'OH'), { rpm: 3.7, n: 1, source: 'warpLane', from: 'TX', to: 'OH' })
  // Средние «в штат» из других штатов — не ставка этого маршрута
  assert.equal(benchmarkRpm(bench, 'CA', 'FL'), null)
  assert.equal(benchmarkRpm(bench, 'CA', 'NC'), null)
  assert.equal(benchmarkRpm(bench, null, 'GA'), null)
  assert.equal(benchmarkRpm({ dat: emptyTable(), usda: null, usdaWeek: null }, 'TX', 'GA'), null)
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
