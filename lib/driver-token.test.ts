import test from 'node:test'
import assert from 'node:assert/strict'
import { isDriverToken, shortToken, unitSlug } from './driver-token.ts'

test('короткая ссылка: номер трака и двенадцать символов без 0/O/1/l', () => {
  const tok = shortToken(unitSlug('2237', 1), new Uint8Array([0, 5, 30, 31, 200, 255, 7, 8, 9, 10, 11, 12]))
  assert.match(tok, /^2237-[a-z0-9]{12}$/)
  assert.doesNotMatch(tok, /[01ol]/i)
  assert.equal(isDriverToken(tok), true)
  // Шести байтов на двенадцать символов не хватит — лучше отказ, чем «undefined» в коде.
  assert.throws(() => shortToken('2237', new Uint8Array(6)))
  assert.equal(unitSlug('TRK #12-A', 9), 'trk12a')
  assert.equal(unitSlug('', 9), 't9')
})

test('принимаются оба поколения токенов, мусор — нет', () => {
  assert.equal(isDriverToken('a'.repeat(48)), true)
  assert.equal(isDriverToken('2237-k7m3xq'), true)
  assert.equal(isDriverToken('2237-k7m3xq9pwd4h'), true)
  // Ни 6, ни 12 — не наш формат.
  assert.equal(isDriverToken('2237-k7m3xq9'), false)
  assert.equal(isDriverToken('2237-K7M3XQ'), false)
  assert.equal(isDriverToken('2237'), false)
  assert.equal(isDriverToken('../etc'), false)
})
