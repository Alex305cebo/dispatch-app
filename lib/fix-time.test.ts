import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixTimeIso, liveShareFixTime, samsaraUnit, shouldReplaceFix } from './fix-time.ts'

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

test('побеждает более свежая точка, а не последний опрошенный трекер', () => {
  const zigzag2h = '2026-11-13T16:00:00.000Z'
  const samsaraNow = '2026-11-13T17:59:00.000Z'
  assert.equal(shouldReplaceFix(zigzag2h, samsaraNow, NOW), false)
  assert.equal(shouldReplaceFix(samsaraNow, zigzag2h, NOW), true)
  assert.equal(shouldReplaceFix(samsaraNow, samsaraNow, NOW), true)
  // у сохранённой нет времени (старые строки 'live share'/'samsara')
  assert.equal(shouldReplaceFix(zigzag2h, 'live share', NOW), true)
  assert.equal(shouldReplaceFix(null, null, NOW), true)
  // новая без времени: свежую (<15 мин) не трогает, старую — заменяет
  assert.equal(shouldReplaceFix('live share', samsaraNow, NOW), false)
  assert.equal(shouldReplaceFix('live share', zigzag2h, NOW), true)
})

test('Samsara: «Juan - Freightliner 1935» → трак 1935', () => {
  const nums = ['1935', '2237', '0101', '1590', '193']
  assert.equal(samsaraUnit('Juan - Freightliner 1935', nums), '1935')
  assert.equal(samsaraUnit('Edwin - Freightliner 2237 (Edwin M)', nums), '2237')
  assert.equal(samsaraUnit('Nick D - Freightliner 0101', nums), '0101')
  assert.equal(samsaraUnit('1590', nums), '1590')
  assert.equal(samsaraUnit('Pavel Maya', nums), 'Pavel Maya')
  assert.equal(samsaraUnit('Truck 19350', nums), 'Truck 19350')
})
