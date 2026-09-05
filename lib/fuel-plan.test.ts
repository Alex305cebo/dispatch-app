import test from 'node:test'
import assert from 'node:assert/strict'
import { seriesFor, statesAlong } from './fuel-plan-core.ts'

test('штаты сводятся к сериям EIA: Калифорния своя, остальные — регион', () => {
  assert.equal(seriesFor('CA'), 'SCA')
  assert.equal(seriesFor('TX'), 'R30')
  assert.equal(seriesFor('IL'), 'R20')
  assert.equal(seriesFor('WA'), 'R5XCA')
  assert.equal(seriesFor('ZZ'), null)
})

test('штаты вдоль линии — по порядку и без повторов подряд', () => {
  // Dallas → Oklahoma City → Kansas City: TX, OK, KS/MO
  const line: [number, number][] = [
    [32.78, -96.8], [33.9, -97.1], [35.47, -97.52], [36.9, -97.3], [38.5, -95.6], [39.1, -94.58],
  ]
  const s = statesAlong(line)
  assert.equal(s[0], 'TX')
  assert.ok(s.includes('OK'))
  assert.equal(new Set(s).size, s.length)
})
