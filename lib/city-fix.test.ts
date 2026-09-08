import test from 'node:test'
import assert from 'node:assert/strict'
import { pickCity, zipOf, stateOfPlace } from './city-fix.ts'

test('индекс — последние пять цифр адреса', () => {
  assert.equal(zipOf('4730 Ninety Six Hwy, Ninety Six, NC 29666'), '29666')
  assert.equal(zipOf('775 E. Highland Rd. Macadonia, OH 44056'), '44056')
  assert.equal(zipOf(null), null)
})

test('штат не совпал с индексом — верим индексу (Ninety Six, NC → SC)', () => {
  assert.equal(pickCity('Ninety Six, NC', 'Ninety Six, SC'), 'Ninety Six, SC')
})

test('опечатка в названии — верим индексу (Macadonia → Macedonia)', () => {
  assert.equal(pickCity('Macadonia, OH', 'Macedonia, OH'), 'Macedonia, OH')
})

test('всё совпало — остаётся как напечатано', () => {
  assert.equal(pickCity('Chicago, IL', 'Chicago, IL'), 'Chicago, IL')
  assert.equal(pickCity('SAINT LOUIS, MO', 'Saint Louis, MO'), 'SAINT LOUIS, MO')
})

test('нет индекса — город с бумаги; нет города — город по индексу', () => {
  assert.equal(pickCity('Dallas, TX', null), 'Dallas, TX')
  assert.equal(pickCity(null, 'Auburndale, FL'), 'Auburndale, FL')
  assert.equal(stateOfPlace('Ninety Six, sc'), 'SC')
})
