import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brokerCut, targetBand, vsTarget, DEFAULT_SHARE, MAX_SHARE } from './broker-cut.ts'

test('доля трака — медиана по своим грузам, выбросы отброшены', () => {
  const cut = brokerCut([
    { ours: 1350, shipper: 1620 }, // 0.83
    { ours: 2400, shipper: 3080 }, // 0.78
    { ours: 1800, shipper: 2020 }, // 0.89
    { ours: 5000, shipper: 1000 }, // 5.0 — не маржа, мимо
    { ours: 100, shipper: 1000 }, // 0.1 — тоже мимо
  ])
  assert.equal(cut.n, 3)
  assert.equal(cut.share, 0.83)
  // Мало данных — типовая доля, а не случайное число
  assert.deepEqual(brokerCut([{ ours: 1000, shipper: 2000 }]), { share: DEFAULT_SHARE, n: 1 })
  assert.deepEqual(brokerCut([]), { share: DEFAULT_SHARE, n: 0 })
})

test('цель торга: от «сколько обычно достаётся» до «сколько брокер отдаст с трудом»', () => {
  const band = targetBand(1620, { share: 0.83, n: 18 })!
  assert.ok(Math.abs(band.low - 1344.6) < 0.01)
  assert.ok(Math.abs(band.high - 1620 * MAX_SHARE) < 0.01)
  // Если по своим грузам достаётся больше 90% — вилка не переворачивается
  const rich = targetBand(1000, { share: 0.95, n: 10 })!
  assert.ok(rich.low < rich.high && Math.abs(rich.high - 950) < 0.01)
  assert.equal(targetBand(0, { share: 0.83, n: 18 }), null)
})

test('ставка брокера против цели', () => {
  const band = { low: 1345, high: 1458 }
  assert.equal(vsTarget(1200, band), 'below')
  assert.equal(vsTarget(1400, band), 'inside')
  assert.equal(vsTarget(1500, band), 'above')
})
