import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixTimeIso, liveShareFixTime } from './fix-time.ts'

const NOW = Date.parse('2026-11-13T18:00:00Z')

test('миллисекунды, секунды, строки', () => {
  assert.equal(fixTimeIso(NOW - 60_000, NOW), '2026-11-13T17:59:00.000Z')
  assert.equal(fixTimeIso((NOW - 60_000) / 1000, NOW), '2026-11-13T17:59:00.000Z')
  assert.equal(fixTimeIso(String(NOW - 60_000), NOW), '2026-11-13T17:59:00.000Z')
  assert.equal(fixTimeIso('2026-11-13T17:30:00Z', NOW), '2026-11-13T17:30:00.000Z')
})

test('мусор, имя источника, будущее и древность — null', () => {
  for (const x of [null, undefined, '', 'live share', 'samsara', 0, -5, NOW + 3_600_000, '1999-01-01T00:00:00Z', {}])
    assert.equal(fixTimeIso(x, NOW), null, String(x))
})

test('Live Share: время из location или из корня', () => {
  assert.equal(liveShareFixTime({ location: { updateDate: NOW - 120_000 } }, NOW), '2026-11-13T17:58:00.000Z')
  assert.equal(liveShareFixTime({ updateDate: 'x', time: '2026-11-13T17:00:00Z' }, NOW), '2026-11-13T17:00:00.000Z')
  assert.equal(liveShareFixTime({ location: { latitude: 1 } }, NOW), null)
})
