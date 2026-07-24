import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextLoadStatus } from './load-status.ts'

const base = { pickupArrived: false, deliveryArrived: false, distToPickupMi: null, distToDeliveryMi: null }

test('booked: driving TOWARD pickup (far, never arrived) does NOT flip to in_transit', () => {
  assert.equal(nextLoadStatus({ ...base, status: 'booked', distToPickupMi: 300 }), null)
})

test('booked: sitting AT pickup stays booked', () => {
  assert.equal(nextLoadStatus({ ...base, status: 'booked', pickupArrived: true, distToPickupMi: 3 }), null)
})

test('booked: arrived then pulled away → in_transit', () => {
  assert.equal(nextLoadStatus({ ...base, status: 'booked', pickupArrived: true, distToPickupMi: 40 }), 'in_transit')
})

test('in_transit: en route, not yet at delivery → no change', () => {
  assert.equal(
    nextLoadStatus({ ...base, status: 'in_transit', pickupArrived: true, distToDeliveryMi: 200 }),
    null,
  )
})

test('in_transit: sitting AT delivery (unloading) stays in_transit', () => {
  assert.equal(
    nextLoadStatus({ ...base, status: 'in_transit', deliveryArrived: true, distToDeliveryMi: 2 }),
    null,
  )
})

test('in_transit: arrived at delivery then left → delivered', () => {
  assert.equal(
    nextLoadStatus({ ...base, status: 'in_transit', deliveryArrived: true, distToDeliveryMi: 30 }),
    'delivered',
  )
})

test('null distances never transition', () => {
  assert.equal(nextLoadStatus({ ...base, status: 'booked', pickupArrived: true }), null)
  assert.equal(nextLoadStatus({ ...base, status: 'in_transit', deliveryArrived: true }), null)
})
