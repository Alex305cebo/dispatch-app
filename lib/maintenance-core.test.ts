import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expiries, oilStatus, type TruckMeta } from './maintenance-core.ts'

test('масло: пробег ниже, чем при прошлой замене, — не отсчёт, а неверное показание', () => {
  const meta = { oilLastOdometer: 128_581, oilIntervalMi: 25_000 } as TruckMeta
  assert.deepEqual(oilStatus(meta, 150_000), { milesLeft: 3_581, tone: 'warn' })
  assert.deepEqual(oilStatus(meta, 160_000), { milesLeft: -6_419, tone: 'bad' })
  // ELD прислал одометр 1 (трак 1935, 09/14/26): было «масло через 153,580 mi» зелёным
  assert.equal(oilStatus(meta, 1), null)
  assert.equal(oilStatus(meta, null), null)
})

// Сервер Hostinger в UTC, браузер диспетчера в New York: в 22:30 ET у сервера уже
// завтра. Прод 14.09.26: сервер «Inspection 45 d», браузер «46 d» — React #418.
test('сроки документов: дни по восточному — одни и те же в UTC и в New York', () => {
  const meta = {
    inspectionExpiry: '2026-10-30',
    registrationExpiry: '2027-04-03',
    insuranceExpiry: '2027-07-12',
    cdlExpiry: null,
    medcardExpiry: '2027-10-20',
  } as TruckMeta
  const days = (at: string) => expiries(meta, 'en', new Date(at)).map((e) => [e.date, e.daysLeft])
  const saved = process.env.TZ
  try {
    for (const zone of ['UTC', 'America/New_York']) {
      process.env.TZ = zone
      // 14.09, 22:30 EDT
      assert.deepEqual(days('2026-09-15T02:30:00Z'), [
        ['2026-10-30', 46],
        ['2027-04-03', 201],
        ['2027-07-12', 301],
        ['2027-10-20', 401],
      ], zone)
      // День сменяется в полночь EDT, а не в 20:00 EDT вместе с UTC
      assert.equal(days('2026-09-15T04:00:00Z')[0]![1], 45, zone)
    }
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
})
