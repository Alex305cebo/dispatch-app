import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stateOf } from './us-state.ts'

test('тот самый случай: под Тонопой это Невада, а не Калифорния', () => {
  // 38.07 -117.23 — Тонопа, NV. Вендор называл здесь «Mammoth lakes, CA» за 98 миль.
  assert.equal(stateOf(38.067, -117.23), 'NV')
  // А сами Mammoth Lakes действительно в Калифорнии — сдвига данных нет.
  assert.equal(stateOf(37.649, -118.972), 'CA')
})

test('города грузовых узлов попадают в свои штаты', () => {
  assert.equal(stateOf(41.878, -87.63), 'IL') // Chicago
  assert.equal(stateOf(32.776, -96.797), 'TX') // Dallas
  assert.equal(stateOf(33.749, -84.388), 'GA') // Atlanta
  assert.equal(stateOf(35.227, -80.843), 'NC') // Charlotte
  assert.equal(stateOf(39.739, -104.99), 'CO') // Denver
})

test('линия границы: два берега реки — разные штаты', () => {
  assert.equal(stateOf(35.146, -90.049), 'TN') // Memphis
  assert.equal(stateOf(35.146, -90.25), 'AR') // West Memphis, тот же мост
  assert.equal(stateOf(39.1, -94.55), 'MO') // Kansas City, MO
  assert.equal(stateOf(39.1, -94.75), 'KS') // Kansas City, KS
})

test('океан и мусор дают null, а не случайный штат', () => {
  assert.equal(stateOf(36.0, -140.0), null) // Тихий океан
  assert.equal(stateOf(null, null), null)
  assert.equal(stateOf(NaN, -100), null)
})
