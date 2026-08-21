import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixPlace, fixState, placeCity } from './place.ts'

// Тонопа, Невада — тот самый случай с боевого экрана.
const TONOPAH = { lat: 38.067, lng: -117.23 }

test('вместо города за 98 миль — тот, что рядом, и с верным штатом', () => {
  // Вендор присылал «98.0mi ENE from Mammoth lakes, CA» — чужой город, чужой штат.
  assert.equal(fixPlace('98.0mi ENE from Mammoth lakes, CA', TONOPAH.lat, TONOPAH.lng), '1.1mi SSW from Tonopah, NV')
})

test('в самом городе расстояние и румб не пишутся', () => {
  assert.equal(fixPlace('3.0mi N from Adelanto, CA', 34.57, -117.43), 'Adelanto, CA')
})

test('без координат остаётся строка вендора как есть', () => {
  assert.equal(fixPlace('98.0mi ENE from Mammoth lakes, CA', null, null), '98.0mi ENE from Mammoth lakes, CA')
  assert.equal(fixPlace(null, null, null), null)
})

test('строки от вендора может не быть вовсе — координат достаточно', () => {
  assert.equal(fixPlace(null, TONOPAH.lat, TONOPAH.lng), '1.1mi SSW from Tonopah, NV')
})

test('вне США: свой пункт не находится, штат не выдумывается', () => {
  assert.equal(fixPlace('somewhere at sea', 36.0, -140.0), 'somewhere at sea')
})

test('запасной путь: пункта рядом нет, но штат в строке чужой — правим штат', () => {
  // Тот же разбор без справочника пунктов проверяется напрямую на fixState.
  assert.equal(fixState('98.0mi ENE from Mammoth lakes, CA', TONOPAH.lat, TONOPAH.lng), 'NV · 98.0mi ENE from Mammoth lakes, CA')
  assert.equal(fixState('7.0mi WNW from Bakersfield, CA', 35.373, -119.018), '7.0mi WNW from Bakersfield, CA')
})

test('короткая форма оставляет город со штатом', () => {
  assert.equal(placeCity('12.0mi N from Ashland, VA'), 'Ashland, VA')
  assert.equal(placeCity('Ashland, VA'), 'Ashland, VA')
  assert.equal(placeCity(null), null)
})

test('короткая форма не теряет фактический штат', () => {
  assert.equal(placeCity('NV · 98.0mi ENE from Mammoth lakes, CA'), 'NV · Mammoth lakes, CA')
})
