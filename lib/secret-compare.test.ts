import test from 'node:test'
import assert from 'node:assert/strict'
import { secretMatches } from './secret-compare.ts'

test('совпадает только точно тот же секрет', () => {
  assert.equal(secretMatches('s3cr3t-value', 's3cr3t-value'), true)
  assert.equal(secretMatches('s3cr3t-valuE', 's3cr3t-value'), false)
  // Разная длина — не исключение из timingSafeEqual, а просто «нет».
  assert.equal(secretMatches('s3cr3t', 's3cr3t-value'), false)
  assert.equal(secretMatches('s3cr3t-value-and-more', 's3cr3t-value'), false)
  assert.equal(secretMatches('пароль', 'пароль'), true)
})

test('незаданный секрет держит адрес закрытым', () => {
  assert.equal(secretMatches('', ''), false)
  assert.equal(secretMatches('', undefined), false)
  assert.equal(secretMatches(null, ''), false)
  assert.equal(secretMatches('anything', undefined), false)
  assert.equal(secretMatches(null, 'set'), false)
  assert.equal(secretMatches(undefined, 'set'), false)
})
