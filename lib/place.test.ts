import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixPlace, placeCity } from './place.ts'

// Тонопа, Невада — тот самый случай с боевого экрана.
const TONOPAH = { lat: 38.067, lng: -117.23 }

test('чужой штат в строке вендора исправляется фактическим', () => {
  assert.equal(
    fixPlace('98.0mi ENE from Mammoth lakes, CA', TONOPAH.lat, TONOPAH.lng),
    'NV · 98.0mi ENE from Mammoth lakes, CA',
  )
})

test('совпал — строка остаётся нетронутой, без лишней приставки', () => {
  // Bakersfield, CA: и город, и трак в Калифорнии.
  assert.equal(fixPlace('7.0mi WNW from Bakersfield, CA', 35.373, -119.018), '7.0mi WNW from Bakersfield, CA')
})

test('без координат и вне США ничего не выдумывается', () => {
  assert.equal(fixPlace('98.0mi ENE from Mammoth lakes, CA', null, null), '98.0mi ENE from Mammoth lakes, CA')
  assert.equal(fixPlace('somewhere at sea', 36.0, -140.0), 'somewhere at sea')
  assert.equal(fixPlace(null, TONOPAH.lat, TONOPAH.lng), null)
  assert.equal(fixPlace('   ', TONOPAH.lat, TONOPAH.lng), null)
})

test('короткая форма оставляет город со штатом', () => {
  assert.equal(placeCity('12.0mi N from Ashland, VA'), 'Ashland, VA')
  assert.equal(placeCity('Ashland, VA'), 'Ashland, VA')
  assert.equal(placeCity(null), null)
})

test('короткая форма не теряет фактический штат', () => {
  assert.equal(placeCity('NV · 98.0mi ENE from Mammoth lakes, CA'), 'NV · Mammoth lakes, CA')
})
