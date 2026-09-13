import test from 'node:test'
import assert from 'node:assert/strict'
import { brokerShort, docName, extOf, nameDate, type DocNameInput } from './doc-name.ts'
import { safeUploadName } from './upload-name.ts'

const base: DocNameInput = {
  kind: 'ratecon',
  title: 'eyJDYXJyaWVySWQiOjYyNTI0MCwiRG9jSWQiOjI0OTYzNzkzfQ__.pdf',
  mime: 'application/pdf',
  stopSeq: null,
  stopCount: 2,
  ref: '38295964',
  invoiceNumber: null,
  broker: 'TQL',
  truck: '1935',
  // 22:30 UTC 13-го = 18:30 по восточному — всё ещё 13-е.
  uploadedAt: new Date('2026-09-13T22:30:00Z'),
}

test('рейт-кон: тип, номер груза, брокер, трак, дата по восточному времени', () => {
  assert.equal(docName(base), 'RATECON 38295964 TQL #1935 09-13-26.pdf')
  assert.equal(nameDate(new Date('2026-09-14T02:30:00Z')), '09-13-26')
})

test('POD промежуточной выгрузки — номер точки; у двухточечного груза номера нет', () => {
  const pod = { ...base, kind: 'pod', stopSeq: 2, stopCount: 3, ref: '620042', broker: 'Tallgrass Freight, Co.', truck: '1705', title: 'POD #1705 tg.pdf' }
  assert.equal(docName(pod), 'POD 2 of 3 620042 Tallgrass #1705 09-13-26.pdf')
  assert.equal(docName({ ...pod, stopCount: 2 }), 'POD 620042 Tallgrass #1705 09-13-26.pdf')
})

test('счёт — с номером счёта; документ без груза — тип, трак, дата', () => {
  assert.equal(
    docName({ ...base, kind: 'invoice', invoiceNumber: 'INV-620042', ref: '620042', broker: 'Tallgrass Freight, Co.', title: 'INV-620042 packet.pdf' }),
    'INVOICE INV-620042 Tallgrass #1935 09-13-26.pdf',
  )
  assert.equal(docName({ ...base, kind: 'repair', ref: null, broker: null, title: 'IMG_2041.JPEG', mime: 'image/jpeg' }), 'REPAIR #1935 09-13-26.jpg')
  assert.equal(docName({ ...base, kind: 'other', ref: null, broker: 'TQL', truck: null, title: 'scan', mime: 'image/png' }), 'DOC 09-13-26.png')
})

test('в имени нет символов, на которые срабатывает фильтр хостинга', () => {
  const n = docName({ ...base, ref: "PO=123;4'5", broker: "O'Neil Freight" })
  assert.equal(safeUploadName(n), n)
  assert.equal(n, 'RATECON PO12345 ONeil #1935 09-13-26.pdf')
})

test('брокер коротко, расширение из имени или типа', () => {
  assert.equal(brokerShort('C.H. Robinson Worldwide'), 'CH Robinson')
  assert.equal(brokerShort('Trinity Logistics, Inc.'), 'Trinity')
  assert.equal(brokerShort('Total Quality Logistics, LLC'), 'TQL')
  assert.equal(brokerShort(null), '')
  assert.equal(extOf('file', 'application/pdf'), 'pdf')
  assert.equal(extOf('photo.HEIC', 'image/heic'), 'heic')
})

test('человеческое описание сохраняется там, где тип сам ничего не говорит', () => {
  const repair = { ...base, kind: 'repair', ref: null, broker: null, truck: '1705', title: 'Truck 1705  Tire Steer 2(1230).pdf', uploadedAt: new Date('2026-08-29T20:00:00Z') }
  assert.equal(docName(repair), 'REPAIR #1705 08-29-26 - Truck 1705 Tire Steer 2 1230.pdf')
  const orphan = { ...base, kind: 'other', ref: null, broker: null, title: 'TQL (38072427) - Driver Info.pdf' }
  assert.equal(docName(orphan), 'DOC #1935 09-13-26 - TQL 38072427 - Driver Info.pdf')
  assert.equal(docName({ ...base, kind: 'insurance', ref: null, truck: null, title: 'Страховка (Proof of Insurance).pdf' }), 'INSURANCE 09-13-26 - Страховка Proof of Insurance.pdf')
})

test('у рейт-кона и POD груза описание не нужно; технические имена отбрасываются', () => {
  assert.equal(docName({ ...base, title: 'TQL Load info OH-TN.pdf' }), 'RATECON 38295964 TQL #1935 09-13-26.pdf')
  for (const t of ['IMG_2041.jpg', 'WhatsApp Image 2026-09-10 at 13.45.18.jpeg', 'photo_2026-09-02_13-14-04 (2).jpg', 'doc1823302963 (1).pdf', 'BOL #1935 tg.pdf', 'POD · 1935 · 2026-09-05.jpg', 'INV-620042 packet.pdf'])
    assert.equal(docName({ ...base, kind: 'photo', ref: null, title: t, mime: 'image/jpeg' }).includes(' - '), false, t)
})

test('пересчёт имени, собранного правилом, даёт то же имя — описание не теряется', () => {
  const first = docName({ ...base, kind: 'repair', ref: null, broker: null, title: 'Oil change receipt.pdf' })
  assert.equal(first, 'REPAIR #1935 09-13-26 - Oil change receipt.pdf')
  assert.equal(docName({ ...base, kind: 'repair', ref: null, broker: null, title: first }), first)
  // груз привязали позже — имя дополнилось номером и брокером, описание осталось
  assert.equal(docName({ ...base, kind: 'repair', title: first }), 'REPAIR 38295964 TQL #1935 09-13-26 - Oil change receipt.pdf')
  const rc = docName(base)
  assert.equal(docName({ ...base, title: rc }), rc)
})
