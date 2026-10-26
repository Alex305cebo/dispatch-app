import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeZip, zipNear } from './us-zip.ts'

test('индекс рядом с Manteno, IL', () => {
  assert.equal(zipNear(41.2506, -87.8314), '60950')
  assert.equal(placeZip('0.4mi E from Manteno, IL', 41.2506, -87.8314), 'Manteno, IL 60950')
})

test('без координат — только город, вне США — null', () => {
  assert.equal(placeZip('Aurora, CO', null, null), 'Aurora, CO')
  assert.equal(zipNear(45, -30), null)
  assert.equal(placeZip(null, 41.25, -87.83), null)
})
