import test from 'node:test'
import assert from 'node:assert/strict'
import { pbkdf2Sync } from 'node:crypto'
import {
  attemptAllowed,
  hashPassword,
  hashSessionToken,
  needsRehash,
  PBKDF2_ITERATIONS,
  throttleEmail,
  verifyPassword,
} from './auth-core.ts'

test('токен сессии в базе — SHA-256 в hex, 64 знака, не сам токен', async () => {
  // Контрольное значение SHA-256("abc") из FIPS 180-2.
  assert.equal(await hashSessionToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  const token = crypto.randomUUID() + crypto.randomUUID()
  const h = await hashSessionToken(token)
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.notEqual(h, token)
  assert.equal(await hashSessionToken(token), h)
})

test('новый хеш пароля: «итерации:соль:хеш» на 600 000, проверяется', async () => {
  const stored = await hashPassword('correct horse')
  assert.match(stored, new RegExp(`^${PBKDF2_ITERATIONS}:[0-9a-f]{32}:[0-9a-f]{64}$`))
  assert.equal(PBKDF2_ITERATIONS, 600_000)
  assert.equal(await verifyPassword('correct horse', stored), true)
  assert.equal(await verifyPassword('correct hors', stored), false)
  assert.equal(needsRehash(stored), false)
})

test('старый хеш «соль:хеш» (100 000) по-прежнему проверяется и просится на переписку', async () => {
  const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
  const legacy = `${salt.toString('hex')}:${pbkdf2Sync('hunter22', salt, 100_000, 32, 'sha256').toString('hex')}`
  assert.equal(await verifyPassword('hunter22', legacy), true)
  assert.equal(await verifyPassword('hunter23', legacy), false)
  assert.equal(needsRehash(legacy), true)
})

test('мусор вместо хеша — отказ, а не исключение и не миллиард итераций', async () => {
  assert.equal(await verifyPassword('', ''), false) // демо и Google-аккаунты: хеш пустой
  assert.equal(await verifyPassword('x', 'abc'), false)
  assert.equal(await verifyPassword('x', '999999999:00:00'), false)
  assert.equal(await verifyPassword('x', '1000:00:00'), false)
  assert.equal(await verifyPassword('x', '6e5:00:00'), false)
  assert.equal(needsRehash(''), false)
  assert.equal(needsRehash(null), false)
})

test('ключ замка — только email, как он лежит в users', () => {
  assert.equal(throttleEmail('  Boss@Example.COM '), 'boss@example.com')
  assert.equal(throttleEmail('a'.repeat(400)).length, 320)
})

test('замок: вход — 10 попыток, сброс по дате — 5; номер попытки сверх лимита не пускается', () => {
  assert.equal(attemptAllowed('login', 1), true)
  assert.equal(attemptAllowed('login', 10), true)
  assert.equal(attemptAllowed('login', 11), false)
  assert.equal(attemptAllowed('reset', 5), true)
  assert.equal(attemptAllowed('reset', 6), false)
  // База не вернула номер попытки — замок закрыт, а не открыт.
  assert.equal(attemptAllowed('login', NaN), false)
})
