import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captionKind, docKindFromText } from './caption-kind.ts'

// A text PDF names itself in its own heading, so this saves the vision call entirely —
// which is what actually matters on a free tier metered in requests per day.
const pad = (s: string) => s + '\n' + 'x'.repeat(60)

test('a rate con is recognised from its own heading, no AI needed', () => {
  for (const s of [
    'RATE CONFIRMATION\nBroker: ABC Logistics',
    'Rate Confirmation Sheet\nLoad #998877',
    'LOAD CONFIRMATION\nLoad #998877',
    'CARRIER CONFIRMATION\nCarrier: Maya Logistics',
    'RATE CON\nAgreed rate $1,700',
  ]) {
    assert.equal(docKindFromText(pad(s)), 'ratecon', s)
  }
})

// The whole reason only rate cons are matched from text: a rate con names the other
// document types inside its own terms. Matching those words would relabel it, the load
// would never be created, and nothing would say why.
test('words a rate con merely mentions never decide the type', () => {
  for (const s of [
    'LOAD TENDER\nSubmit your invoice to accounting after delivery.',
    'RATE AGREEMENT\nReturn the signed bill of lading with your POD.',
    'CONFIRMATION SHEET\nInvoice and BOL required for payment.',
  ]) {
    // null means "ask the model", never "not a rate con" — nothing is lost here.
    assert.equal(docKindFromText(pad(s)), null, s)
  }
})

test('unrecognisable or too-short text falls through to the model', () => {
  assert.equal(docKindFromText(''), null)
  assert.equal(docKindFromText('RATE CONFIRMATION'), null) // too short to be a document
  assert.equal(docKindFromText(pad('Fuel receipt\nPilot Travel Center')), null)
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
