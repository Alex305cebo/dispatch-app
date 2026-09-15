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
