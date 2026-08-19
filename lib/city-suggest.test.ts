import { test } from 'node:test'
import assert from 'node:assert/strict'
import { citySuggestions, normalizeCity } from './city-suggest.ts'

test('приводит регистр к одному виду, штат оставляет заглавным', () => {
  assert.equal(normalizeCity('EVANSVILLE, IN'), 'Evansville, IN')
  assert.equal(normalizeCity('  auburndale ,  fl '), 'Auburndale, FL')
})

test('составные названия не ломаются', () => {
  assert.equal(normalizeCity('SALT LAKE CITY, UT'), 'Salt Lake City, UT')
  assert.equal(normalizeCity("o'fallon, mo"), "O'Fallon, MO")
  assert.equal(normalizeCity('WINSTON-SALEM, NC'), 'Winston-Salem, NC')
})

test('один город в разном регистре не задваивается в подсказках', () => {
  const list = citySuggestions(['EVANSVILLE, IN', 'Evansville, IN'])
  assert.equal(list.filter((c) => c === 'Evansville, IN').length, 1)
})

test('своя история идёт впереди справочника — по ней и ездят', () => {
  const list = citySuggestions(['Auburndale, FL'])
  assert.equal(list[0], 'Auburndale, FL')
  assert.ok(list.includes('Chicago, IL'), 'узлы тоже на месте')
})

test('пустые и мусорные строки истории не попадают в список', () => {
  const list = citySuggestions(['', null, '   '])
  assert.ok(!list.includes(''))
  assert.ok(list.length > 50)
})
