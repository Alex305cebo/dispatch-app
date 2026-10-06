import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipState } from './zip-state.ts'

test('zipState: штат по индексу', () => {
  assert.equal(zipState('70445'), 'LA') // Lacombe, LA — тот самый груз
  assert.equal(zipState('17847'), 'PA') // Milton, PA
  assert.equal(zipState('29666'), 'SC') // Ninety Six — индекс Южной Каролины
  assert.equal(zipState('02134'), 'MA')
  assert.equal(zipState('88510'), 'TX') // El Paso
  assert.equal(zipState('68102'), 'NE')
  assert.equal(zipState('99501'), 'AK')
})

test('zipState: не индекс — null', () => {
  assert.equal(zipState(null), null)
  assert.equal(zipState('7044'), null)
  assert.equal(zipState('abcde'), null)
  assert.equal(zipState('00601'), null) // Пуэрто-Рико — не штат
})
