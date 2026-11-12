import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addressLines, refLabel } from './stops.ts'

test('addressLines: улица и город двумя строками', () => {
  assert.deepEqual(addressLines({ address: '880 TECHNOLOGY DR STE 101, FAYETTEVILLE, NC 28306', city: 'Fayetteville, NC' }), {
    street: '880 TECHNOLOGY DR STE 101',
    place: 'FAYETTEVILLE, NC 28306',
  })
})

test('addressLines: города в адресе нет — город второй строкой', () => {
  assert.deepEqual(addressLines({ address: '5421 US Highway 25 N', city: 'Hodges, SC' }), {
    street: '5421 US Highway 25 N',
    place: 'Hodges, SC',
  })
})

test('addressLines: только город', () => {
  assert.deepEqual(addressLines({ address: null, city: 'Hodges, SC' }), { street: null, place: 'Hodges, SC' })
  assert.deepEqual(addressLines({ address: 'Hodges, SC 29653', city: 'Hodges, SC' }), { street: null, place: 'Hodges, SC 29653' })
})

test('refLabel: подпись по роли, своя подпись не трогается', () => {
  assert.equal(refLabel('3403345588', 'pickup'), 'Pickup Number: 3403345588')
  assert.equal(refLabel('Chep Pallets 3403345588', 'delivery'), 'Delivery Number: Chep Pallets 3403345588')
  assert.equal(refLabel('PO# 4471', 'delivery'), 'PO# 4471')
  assert.equal(refLabel('BOL: 88', 'pickup'), 'BOL: 88')
})
