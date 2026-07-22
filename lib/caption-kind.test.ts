import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captionKind } from './caption-kind.ts'

test('rate-con captions file as ratecon, EN + RU + spacing variants', () => {
  for (const s of [
    'Rate con updated',
    'ratecon',
    'Rate Confirmation',
    'RATE-CON new',
    'обновлённый рейткон',
    'рейт кон',
    'рейт-кон',
  ]) {
    assert.equal(captionKind(s), 'ratecon', s)
  }
})

test('unrelated or empty captions match nothing', () => {
  for (const s of ['', '   ', 'POD attached', 'фото груза', 'moderate concern', 'concon']) {
    assert.equal(captionKind(s), null, JSON.stringify(s))
  }
})
