import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boardShotLines } from './board-shot.ts'
import { parseBoardLoads } from './route-plan-core.ts'

test('скриншот DAT: груз из примера пользователя — строка, которую понимает поле сравнения', () => {
  // TQL W Sacramento, CA (102) → Sparks, NV, 139 mi, $1,000.
  const { lines, skipped } = boardShotLines({
    loads: [
      {
        origin: 'W Sacramento, CA',
        destination: 'Sparks, NV',
        tripMiles: 139,
        deadheadMiles: 102,
        rate: 1000,
        ratePerMile: null,
        company: 'Total Quality Logistics INC',
        pickupDate: '09/14',
      },
    ],
  })
  assert.equal(skipped, 0)
  assert.deepEqual(lines, ['NV 139 1000 102 · W Sacramento, CA → Sparks, NV · Total Quality Logistics INC · 09/14'])
  assert.deepEqual(parseBoardLoads(lines[0]!), [
    { state: 'NV', miles: 139, rate: 1000, deadhead: 102, label: 'W Sacramento, CA → Sparks, NV · Total Quality Logistics INC · 09/14' },
  ])
})

test('скриншот DAT: без ставки, ставка за милю, невозможная ставка', () => {
  const { lines } = boardShotLines({
    loads: [
      // Ставки на доске нет — «?», посчитается по рынку.
      { origin: 'Dallas, TX', destination: 'Atlanta, GA', tripMiles: 781, deadheadMiles: null, rate: null },
      // Только за милю.
      { origin: 'Reno, NV', destination: 'Boise, ID', tripMiles: 430, rate: null, ratePerMile: 2.5 },
      // В поле суммы — ставка за милю.
      { origin: 'Fresno, CA', destination: 'Phoenix, AZ', tripMiles: 600, rate: 2.2 },
      // $22.20/mi — склеенные цифры, не ставка.
      { origin: 'Ontario, CA', destination: 'Las Vegas, NV', tripMiles: 230, rate: 5106 },
    ],
  })
  assert.deepEqual(lines, [
    'GA 781 ? · Dallas, TX → Atlanta, GA',
    'ID 430 1075 · Reno, NV → Boise, ID',
    'AZ 600 1320 · Fresno, CA → Phoenix, AZ',
    'NV 230 ? · Ontario, CA → Las Vegas, NV',
  ])
  const parsed = parseBoardLoads(lines.join('\n'))
  assert.equal(parsed.length, 4)
  assert.equal(parsed[0]!.rate, null)
  assert.equal(parsed[0]!.deadhead, undefined)
  assert.equal(parsed[1]!.rate, 1075)
})

test('скриншот DAT: что посчитать нельзя — пропускается и считается', () => {
  const res = boardShotLines({
    loads: [
      { origin: 'Detroit, MI', destination: 'Toronto, ON', tripMiles: 230, rate: 900 },
      { origin: 'Dallas, TX', destination: 'Houston, TX', tripMiles: null, rate: 700 },
      { origin: null, destination: null, tripMiles: 500, rate: 1500 },
    ],
  })
  assert.deepEqual(res, { lines: [], skipped: 3 })
  assert.deepEqual(boardShotLines(null), { lines: [], skipped: 0 })
  assert.deepEqual(boardShotLines({ loads: null }), { lines: [], skipped: 0 })
})
