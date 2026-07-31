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

// The same matcher now decides an UPLOADED FILE's kind by its name (lib/ai-doc.ts).
// Real broker filenames, including the one that got filed as "Другое" in production
// because the name was never looked at.
test('broker filenames classify as ratecon', () => {
  for (const s of [
    'RateConf_2002711744.pdf',
    'rate_confirmation_88213.PDF',
    'Rate-Con 4471.pdf',
    'RATECON_TQL_99812.pdf',
    'рейткон_4471.pdf',
  ]) {
    assert.equal(captionKind(s), 'ratecon', s)
  }
})

test('other paperwork filenames are NOT force-labelled a rate con', () => {
  for (const s of ['POD_2002711744.pdf', 'bol-88213.pdf', 'invoice_4471.pdf', 'IMG_20260729.jpg']) {
    assert.equal(captionKind(s), null, s)
  }
})

test('unrelated or empty captions match nothing', () => {
  for (const s of ['', '   ', 'POD attached', 'фото груза', 'moderate concern', 'concon']) {
    assert.equal(captionKind(s), null, JSON.stringify(s))
  }
})
