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
  const out = withCities(REAL, { '15021': 'Canonsburg, PA', '38637': 'Southaven, MS' })
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
