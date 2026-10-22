import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchTruck, scanToInput, toEt, type ScanAnswer } from './service-scan-core.ts'

test('чек: время в ET', () => {
  assert.equal(toEt('12:11', 'CT'), '13:11')
  assert.equal(toEt('23:30', 'PDT'), '02:30')
  assert.equal(toEt('9:05', null), '09:05')
  assert.equal(toEt('25:00', 'ET'), null)
  assert.equal(toEt(null, 'CT'), null)
})

test('чек: трак по юниту, номеру машины, VIN', () => {
  const trucks = [
    { id: 1, number: '1935', plate: 'TN 4455K', vin: '1FUJHHDR0LLLA1234' },
    { id: 2, number: '2235', plate: 'U2180HY', vin: '3AKJHHDR0RSSVY2364' },
  ]
  assert.equal(matchTruck({ unit: '2235', plate: null, vin: null }, trucks), 2)
  assert.equal(matchTruck({ unit: null, plate: '4455K', vin: null }, trucks), 1)
  assert.equal(matchTruck({ unit: null, plate: null, vin: 'SSVY2364' }, trucks), 2)
  assert.equal(matchTruck({ unit: '999', plate: null, vin: null }, trucks), null)
})

test('чек: ответ модели → запись (образец LubeZone)', () => {
  const a: ScanAnswer = {
    kind: 'oil', title: 'Замена масла', details: 'Rotella T6 5W40 10 gal, масляный и топливный фильтр, смазка',
    date: '2026-10-16', time: '12:11', timezone: 'CT', shop: 'LubeZone Truck Lube Center, Sayre OK',
    odometer: 294452, odometerUnit: 'mi', total: 713.18, unit: '2235', plate: 'U2180HY', vin: 'SSVY2364',
  }
  assert.deepEqual(scanToInput(a), {
    kind: 'oil', title: 'Замена масла', notes: 'Rotella T6 5W40 10 gal, масляный и топливный фильтр, смазка',
    cost: 713.18, odometer: 294452, doneAt: '2026-10-16', doneTime: '13:11', shop: 'LubeZone Truck Lube Center, Sayre OK',
  })
  assert.equal(scanToInput({ ...a, odometer: 100, odometerUnit: 'km', date: '10/16/26' }).odometer, 62)
  assert.equal(scanToInput({ ...a, date: '10/16/26' }).doneAt, null)
})

import { titleHints } from './service-scan-core.ts'

test('чек: подсказки из имени бумаги', () => {
  assert.deepEqual(titleHints('REPAIR #1705 08-29-26 - Truck 1705 Tire Steer 2 1230 - Aug 29 20.pdf'), {
    doneAt: '2026-08-29',
    what: 'Truck 1705 Tire Steer 2 1230 - Aug 29 20',
  })
  assert.deepEqual(titleHints('REPAIR #1705 07-21-26 - Tire - Rear Truck чек.pdf'), { doneAt: '2026-07-21', what: 'Tire - Rear Truck чек' })
  assert.deepEqual(titleHints('Headlamp invoice.pdf'), { doneAt: null, what: 'Headlamp invoice' })
})
