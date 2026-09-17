import { test } from 'node:test'
import assert from 'node:assert/strict'
import { queueFit } from './queue-fit-core.ts'

const now = Date.parse('2026-09-18T12:00:00Z')

test('не успевает: ехать 10 ч, а пикап закрывается через 6', () => {
  const fit = queueFit({ nowMs: now, etaMin: 600, deadheadMi: 100, pickupEndMs: now + 6 * 3600_000 })
  // 600 мин пути + 90 разгрузка + 120 мин на 100 миль = 810; до пикапа 360 → опоздание 450
  assert.deepEqual(fit, { lateMin: 450, slackMin: 0 })
})

test('успевает: запас в минутах', () => {
  const fit = queueFit({ nowMs: now, etaMin: 60, deadheadMi: 0, pickupEndMs: now + 5 * 3600_000 })
  assert.deepEqual(fit, { lateMin: 0, slackMin: 150 })
})

test('нет ETA или нет срока пикапа — молчим', () => {
  assert.equal(queueFit({ nowMs: now, etaMin: null, deadheadMi: 10, pickupEndMs: now }), null)
  assert.equal(queueFit({ nowMs: now, etaMin: 100, deadheadMi: 10, pickupEndMs: null }), null)
})
