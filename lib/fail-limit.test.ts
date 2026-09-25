import test from 'node:test'
import assert from 'node:assert/strict'
import { failLimiter } from './fail-limit.ts'

const MIN = 60_000

test('после max промахов адрес под запретом до конца окна', () => {
  const lim = failLimiter({ max: 3, windowMs: 10 * MIN })
  const t0 = 1_000_000
  lim.fail('1.2.3.4', t0)
  lim.fail('1.2.3.4', t0 + 1)
  assert.equal(lim.blocked('1.2.3.4', t0 + 2), false)
  lim.fail('1.2.3.4', t0 + 2)
  assert.equal(lim.blocked('1.2.3.4', t0 + 3), true)
  // Соседний адрес не страдает.
  assert.equal(lim.blocked('5.6.7.8', t0 + 3), false)
  // Окно кончилось — снова можно.
  assert.equal(lim.blocked('1.2.3.4', t0 + 10 * MIN), false)
})

test('промах после окна открывает новое окно с нуля', () => {
  const lim = failLimiter({ max: 2, windowMs: MIN })
  lim.fail('a', 0)
  lim.fail('a', MIN + 1)
  assert.equal(lim.blocked('a', MIN + 2), false)
  lim.fail('a', MIN + 3)
  assert.equal(lim.blocked('a', MIN + 4), true)
})

test('память ограничена: при переполнении старые записи уходят', () => {
  const lim = failLimiter({ max: 1, windowMs: 10 * MIN, maxKeys: 3 })
  for (const k of ['a', 'b', 'c']) lim.fail(k, 0)
  assert.equal(lim.blocked('a', 1), true)
  lim.fail('d', 2)
  // «a» — самая старая, её место занял «d».
  assert.equal(lim.blocked('a', 3), false)
  assert.equal(lim.blocked('d', 3), true)
})
