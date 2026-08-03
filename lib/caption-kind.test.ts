import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captionKind, docKindFromText } from './caption-kind.ts'

// A text PDF names itself in its own heading, so this saves the vision call entirely —
// which is what actually matters on a free tier metered in requests per day.
const pad = (s: string) => s + '\n' + 'x'.repeat(60)

test('a document is classified from its own heading, no AI needed', () => {
  assert.equal(docKindFromText(pad('RATE CONFIRMATION\nBroker: ABC Logistics')), 'ratecon')
  assert.equal(docKindFromText(pad('LOAD CONFIRMATION\nLoad #998877')), 'ratecon')
  assert.equal(docKindFromText(pad('BILL OF LADING\nShipper: Acme')), 'bol')
  assert.equal(docKindFromText(pad('PROOF OF DELIVERY\nReceived by:')), 'pod')
  assert.equal(docKindFromText(pad('INVOICE #4471\nRemit to:')), 'invoice')
})

test('a rate con is not mistaken for an invoice or a BOL it merely mentions', () => {
  // Real rate cons name both in their terms; the self-declaring heading must win.
  const rc = pad('RATE CONFIRMATION\nSubmit your invoice with the signed bill of lading.')
  assert.equal(docKindFromText(rc), 'ratecon')
})

test('unrecognisable or too-short text falls through to the model', () => {
  assert.equal(docKindFromText(''), null)
  assert.equal(docKindFromText('RATE CONFIRMATION'), null) // too short to be a document
  assert.equal(docKindFromText(pad('Fuel receipt\nPilot Travel Center')), null)
  // Lowercase "pod"/"bol" hide inside ordinary words — must not trigger.
  assert.equal(docKindFromText(pad('the pods were bolted to the trailer floor')), null)
})

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
