import test from 'node:test'
import assert from 'node:assert/strict'
import { detentionAmount } from './detention.ts'

test('до бесплатных часов детеншен не считается', () => {
  assert.equal(detentionAmount(90, 35, 2), 0)
})
test('после двух часов — по ставке, с округлением до четверти часа', () => {
  assert.equal(detentionAmount(180, 35, 2), 35)
  assert.equal(detentionAmount(200, 35, 2), 35 * 1.25)
})
