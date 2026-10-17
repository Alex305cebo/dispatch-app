import test from 'node:test'
import assert from 'node:assert/strict'
import { bytesToBase64, readUploadFile, safeUploadFile, safeUploadName, textToHex, wireUploadName } from './upload-name.ts'

test('символы, на которые Hostinger отвечает 403, заменяются', () => {
  assert.equal(
    safeUploadName('eyJDYXJyaWVySWQiOjYyNTI0MCwiRG9jSWQiOjI0OTYzNzkzfQ==.pdf'),
    'eyJDYXJyaWVySWQiOjYyNTI0MCwiRG9jSWQiOjI0OTYzNzkzfQ__.pdf',
  )
  assert.equal(safeUploadName("BOL; driver's copy.pdf"), 'BOL_ driver_s copy.pdf')
})

test('по сети имя без даты и времени: file.<расширение>', () => {
  assert.equal(wireUploadName('Scan 2026-10-17 14.17.05.pdf'), 'file.pdf')
  assert.equal(wireUploadName('Screenshot 2026-10-17 at 2.17.05\u202FPM.PNG'), 'file.png')
  assert.equal(wireUploadName('BOL 10-17-26 (2)'), 'file')
  const f = new File(['x'], 'file.pdf', { type: 'application/pdf' })
  assert.equal(safeUploadFile(f), f)
})

test('сетевой файл сохраняет тип и содержимое', async () => {
  const f = new File(['%PDF-1.4'], 'POD 10.17.2026 2:17 PM.pdf', { type: 'application/pdf' })
  const g = safeUploadFile(f)
  assert.equal(g.name, 'file.pdf')
  assert.equal(g.type, 'application/pdf')
  assert.equal(await g.text(), '%PDF-1.4')
})

test('readUploadFile: копия в памяти под сетевым именем, пустой файл — null', async () => {
  const f = new File(['%PDF-1.4'], 'a=b 2026-10-17.pdf', { type: 'application/pdf' })
  const g = await readUploadFile(f)
  assert.ok(g)
  assert.equal(g.name, 'file.pdf')
  assert.equal(g.type, 'application/pdf')
  assert.equal(await g.text(), '%PDF-1.4')
  assert.equal(await readUploadFile(new File([], 'empty.pdf')), null)
})

test('textToHex: настоящее имя доезжает hex-строкой целиком', () => {
  const name = 'BOL Иванов 10.17.26 14:17 №5.pdf'
  const hex = textToHex(name)
  assert.match(hex, /^[0-9a-f]+$/)
  assert.equal(Buffer.from(hex, 'hex').toString('utf8'), name)
})

test('bytesToBase64 совпадает с Buffer и на больших файлах', () => {
  const bytes = new Uint8Array(200_000).map((_, i) => (i * 31) % 256)
  assert.equal(bytesToBase64(bytes.buffer), Buffer.from(bytes).toString('base64'))
})
