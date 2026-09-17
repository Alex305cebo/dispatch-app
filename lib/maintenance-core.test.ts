import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oilStatus, type TruckMeta } from './maintenance-core.ts'

test('масло: пробег ниже, чем при прошлой замене, — не отсчёт, а неверное показание', () => {
  const meta = { oilLastOdometer: 128_581, oilIntervalMi: 25_000 } as TruckMeta
  assert.deepEqual(oilStatus(meta, 150_000), { milesLeft: 3_581, tone: 'warn' })
  assert.deepEqual(oilStatus(meta, 160_000), { milesLeft: -6_419, tone: 'bad' })
  // ELD прислал одометр 1 (трак 1935, 09/14/26): было «масло через 153,580 mi» зелёным
  assert.equal(oilStatus(meta, 1), null)
  assert.equal(oilStatus(meta, null), null)
})

import { homeSoon, homeUntil, parseStates } from './maintenance-core.ts'

test('профиль водителя: коды штатов, «дома до», «домой скоро»', () => {
  assert.deepEqual(parseStates('ny, ca; tx ny'), ['NY', 'CA', 'TX'])
  assert.deepEqual(parseStates(null), [])
  const p = { homeFrom: '2026-09-20', homeTo: '2026-09-23' }
  assert.equal(homeUntil(p, '2026-09-19'), null)
  assert.equal(homeUntil(p, '2026-09-20'), '2026-09-23')
  assert.equal(homeUntil(p, '2026-09-23'), '2026-09-23')
  assert.equal(homeUntil(p, '2026-09-24'), null)
  assert.equal(homeUntil({ homeFrom: null, homeTo: null }, '2026-09-20'), null)
  assert.equal(homeSoon(p, '2026-09-15'), '2026-09-20')
  assert.equal(homeSoon(p, '2026-09-10'), null)
  assert.equal(homeSoon(p, '2026-09-21'), null)
})

import { assignWarnings } from './maintenance-core.ts'

test('проверка трака под груз: документы до выгрузки и стоп-лист водителя', () => {
  const meta = {
    cdlExpiry: '2026-09-10',
    medcardExpiry: '2026-09-18',
    insuranceExpiry: '2026-09-20', // действует в день выгрузки — не предупреждение
    registrationExpiry: null,
    inspectionExpiry: '2027-01-01',
    avoidStates: ['NY'],
  } as TruckMeta
  const trip = { places: ['Dallas, TX', 'Albany, NY 12203', null], deliveryDate: '2026-09-20' }
  assert.deepEqual(assignWarnings(meta, trip, '2026-09-16'), [
    'Documents: Driver CDL expired 09/10/26 · Medical card expires 09/18/26, before delivery',
    'Driver no-go states on this trip: NY',
  ])
  // Без даты выгрузки — только то, что уже истекло.
  assert.deepEqual(assignWarnings(meta, { places: ['Dallas, TX'] }, '2026-09-16'), ['Documents: Driver CDL expired 09/10/26'])
  assert.deepEqual(assignWarnings(null, trip, '2026-09-16'), [])
})
