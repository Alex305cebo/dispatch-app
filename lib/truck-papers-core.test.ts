import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanIsoDate,
  daysUntil,
  expiryFill,
  expiryTone,
  paperOf,
  parseModelDate,
  slotExpiry,
} from './truck-papers-core.ts'

test('daysUntil считает по дням, без пояса', () => {
  assert.equal(daysUntil('2026-11-10', '2026-11-10'), 0)
  assert.equal(daysUntil('2026-12-10', '2026-11-10'), 30)
  assert.equal(daysUntil('2026-11-01', '2026-11-10'), -9)
  // Переход на зимнее время 11/01/26 не сдвигает счёт.
  assert.equal(daysUntil('2026-11-02', '2026-10-31'), 2)
})

test('expiryTone — те же пороги, что у expiries()', () => {
  assert.equal(expiryTone(-3), 'bad')
  assert.equal(expiryTone(30), 'bad')
  assert.equal(expiryTone(31), 'warn')
  assert.equal(expiryTone(60), 'warn')
  assert.equal(expiryTone(61), 'good')
})

test('expiryFill — от пустой до полной', () => {
  assert.equal(expiryFill(-10), 0)
  assert.equal(expiryFill(730), 1)
  assert.ok(Math.abs(expiryFill(182) - 0.4986) < 0.001)
})

test('cleanIsoDate отбрасывает мусор и несуществующие дни', () => {
  assert.equal(cleanIsoDate('2027-05-14'), '2027-05-14')
  assert.equal(cleanIsoDate('2027-02-30'), null)
  assert.equal(cleanIsoDate('1999-01-01'), null)
  assert.equal(cleanIsoDate(''), null)
  assert.equal(cleanIsoDate("2027-05-14' OR 1"), null)
})

test('parseModelDate понимает ISO и американский порядок', () => {
  assert.equal(parseModelDate('2027-05-14'), '2027-05-14')
  assert.equal(parseModelDate('EXP 05/14/2027'), '2027-05-14')
  assert.equal(parseModelDate('5/4/28'), '2028-05-04')
  assert.equal(parseModelDate('none'), null)
  assert.equal(parseModelDate('13/40/2027'), null)
})

test('paperOf: старые страховка и регистрация трака узнаются по kind', () => {
  assert.equal(paperOf({ paper: 'cdl', kind: 'other' }), 'cdl')
  assert.equal(paperOf({ paper: null, kind: 'insurance' }), 'insurance')
  assert.equal(paperOf({ paper: null, kind: 'registration' }), 'truck_reg')
  assert.equal(paperOf({ paper: null, kind: 'bol' }), null)
  assert.equal(paperOf({ paper: 'nonsense', kind: 'other' }), null)
})

test('slotExpiry: CDL — из truck_meta, трейлер — из свежего документа', () => {
  const docs = [
    { paper: 'trailer_reg' as const, expiresOn: '2026-12-01', uploadedAt: '2026-01-01T00:00:00Z' },
    { paper: 'trailer_reg' as const, expiresOn: '2027-12-01', uploadedAt: '2026-11-01T00:00:00Z' },
    { paper: 'cdl' as const, expiresOn: '2030-01-01', uploadedAt: '2026-11-01T00:00:00Z' },
  ]
  assert.equal(slotExpiry('cdl', { cdlExpiry: '2028-03-03' }, docs), '2028-03-03')
  assert.equal(slotExpiry('cdl', {}, docs), null)
  assert.equal(slotExpiry('trailer_reg', {}, docs), '2027-12-01')
  assert.equal(slotExpiry('permit', {}, docs), null)
})
