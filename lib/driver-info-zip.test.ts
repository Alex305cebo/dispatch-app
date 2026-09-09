import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lonelyZips, withCities } from './driver-info-zip.ts'

// Настоящий текст с груза 1370: рейт-кон напечатал улицу и индекс, город потерялся.
const REAL = `Pick up Address:

Shell

157 Starpointe Boulevard
15021

--------------------------

Delivery Address:

OZARK AUTOMOTIVE-MEM

1241 Commerce Parkway North
38637`

test('находит индексы, у которых нет города', () => {
  assert.deepEqual(lonelyZips(REAL), ['15021', '38637'])
})

test('дописывает город и штат, индекс оставляет', () => {
  const out = withCities(REAL, {
    '15021': 'Canonsburg, PA',
    '38637': 'Southaven, MS',
  })
  assert.match(out, /Canonsburg, PA 15021/)
  assert.match(out, /Southaven, MS 38637/)
  // Улица и название пункта не тронуты.
  assert.match(out, /157 Starpointe Boulevard/)
  assert.match(out, /OZARK AUTOMOTIVE-MEM/)
})

test('полный адрес не трогаем — там город уже есть', () => {
  const full = 'Chicago, IL 60607'
  assert.deepEqual(lonelyZips(full), [])
  assert.equal(withCities(full, { '60607': 'НЕВЕРНО' }), full)
})

test('неизвестный индекс остаётся как был — город не выдумывается', () => {
  const out = withCities('99999', {})
  assert.equal(out, '99999')
})

test('ZIP+4 тоже узнаётся, но подставляется по пяти знакам', () => {
  assert.deepEqual(lonelyZips('60607-1234'), ['60607'])
  assert.equal(withCities('60607-1234', { '60607': 'Chicago, IL' }), 'Chicago, IL 60607-1234')
})

test('номер дома из пяти цифр в строке с улицей за индекс не считается', () => {
  const line = '15021 Main Street'
  assert.deepEqual(lonelyZips(line), [])
  assert.equal(withCities(line, { '15021': 'Canonsburg, PA' }), line)
})

test('пустой текст не ломает разбор', () => {
  assert.deepEqual(lonelyZips(''), [])
  assert.equal(withCities('', {}), '')
})

import { withAddresses, stopNames, hasStreets } from './driver-info-zip.ts'

test('город в тексте водителю заменяется полным адресом склада с городом из груза', () => {
  const text =
    'LOAD ID: #1\n\nPick up Address:\n\nAnahiem, CA\n\nTime: 05:00\n\nDelivery Address:\n\nLake Havasu City, AZ\n'
  const out = withAddresses(text, {
    pickup: '400 E Orangethorpe Ave, 92801',
    delivery: '1155 Aviation Dr Unit D, 86404',
    origin: 'Anaheim, CA',
    destination: 'Lake Havasu City, AZ',
  })
  assert.match(out, /Pick up Address:\n\n400 E Orangethorpe Ave, Anaheim, CA 92801\n/)
  assert.match(out, /Delivery Address:\n\n1155 Aviation Dr Unit D, Lake Havasu City, AZ 86404\n/)
})
test('улица уже есть — строка не трогается; без адреса — тоже', () => {
  const text = 'Pick up Address:\n\n1 Main St, Dallas, TX 75201\n\nDelivery Address:\n\nTulsa, OK\n'
  assert.equal(withAddresses(text, { pickup: '9 Other Rd, 75001', origin: 'Dallas, TX' }), text)
})

test('название склада — первая строка блока пункта, город и улица названием не считаются', () => {
  const sheet =
    'LOAD ID: #1\n\nPick up Address:\n\nWoodmark\n\n400 E Orangethorpe Ave\nAnaheim, CA 92801\n\nDelivery Address:\n\nSquared Away Installation\n\n1155 Aviation Dr Unit D\nLake Havasu City, AZ 86404\n'
  assert.deepEqual(stopNames(sheet), {
    pickup: 'Woodmark',
    delivery: 'Squared Away Installation',
  })
  const rc = 'Pick up Address:\n\nAnahiem, CA\n\nDelivery Address:\n\n1155 Aviation Dr, 86404\n'
  assert.deepEqual(stopNames(rc), { pickup: null, delivery: null })
  assert.equal(hasStreets(sheet), true)
  assert.equal(hasStreets('Pick up Address:\n\nAnahiem, CA\n'), false)
})

test('название склада перед адресом не затирается, а блок с улицей не трогается', () => {
  const text = 'Pick up Address:\n\nFiberon\n\n23680 NE Glisan St\nGresham, OR 97030\n\n____\nTime: 08:00\n'
  assert.equal(withAddresses(text, { pickup: '23680 NE Glisan St, 97030', origin: 'Gresham, OR' }), text)
  const cityOnly = 'Pick up Address:\n\nWoodmark\n\nAnahiem, CA\n\n____\nTime: 05:00\n'
  assert.equal(
    withAddresses(cityOnly, { pickup: '400 E Orangethorpe Ave, 92801', origin: 'Anaheim, CA' }),
    'Pick up Address:\n\nWoodmark\n\n400 E Orangethorpe Ave, Anaheim, CA 92801\n\n____\nTime: 05:00\n',
  )
})
