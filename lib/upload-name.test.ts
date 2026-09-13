import test from 'node:test'
import assert from 'node:assert/strict'
import { safeUploadFile, safeUploadName } from './upload-name.ts'

test('символы, на которые Hostinger отвечает 403, заменяются', () => {
  assert.equal(
    safeUploadName('eyJDYXJyaWVySWQiOjYyNTI0MCwiRG9jSWQiOjI0OTYzNzkzfQ==.pdf'),
    'eyJDYXJyaWVySWQiOjYyNTI0MCwiRG9jSWQiOjI0OTYzNzkzfQ__.pdf',
  )
  assert.equal(safeUploadName("BOL; driver's copy.pdf"), 'BOL_ driver_s copy.pdf')
})

test('обычные имена не трогаются, файл тот же объект', () => {
  assert.equal(safeUploadName('TQL Rate Confirmation 38295964.pdf'), 'TQL Rate Confirmation 38295964.pdf')
  assert.equal(safeUploadName('Рейт кон (620042) #2.pdf'), 'Рейт кон (620042) #2.pdf')
  const f = new File(['x'], 'rc.pdf', { type: 'application/pdf' })
  assert.equal(safeUploadFile(f), f)
})

test('переименованный файл сохраняет тип и содержимое', async () => {
  const f = new File(['%PDF-1.4'], 'a=b.pdf', { type: 'application/pdf' })
  const g = safeUploadFile(f)
  assert.equal(g.name, 'a_b.pdf')
  assert.equal(g.type, 'application/pdf')
  assert.equal(await g.text(), '%PDF-1.4')
})
