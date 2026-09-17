import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avgDwell, facilitiesForLoad, facilityIndex, facilityKey, filterFacilities, type FacilityLoad } from './facilities.ts'

const load = (id: number, patch: Partial<FacilityLoad> = {}): FacilityLoad => ({
  id,
  status: 'delivered',
  createdAt: `2026-09-0${id}T12:00:00Z`,
  origin: 'Tampa, FL',
  destination: 'Dallas, TX',
  pickupAddress: '1234 N Dale Mabry Hwy, Tampa, FL 33607',
  deliveryAddress: '500 Commerce St, Dallas, TX 75201',
  pickupDate: `2026-09-0${id}`,
  deliveryDate: `2026-09-0${id + 1}`,
  pickupTime: null,
  deliveryTime: null,
  stops: null,
  ...patch,
})

test('старый груз без JSON-остановок: название склада — из текста водителю', () => {
  const info =
    'LOAD ID: #1\n\nPick up Address:\n\nWalmart DC 6094\n1234 N Dale Mabry Hwy, Tampa, FL 33607\n\nDelivery Address:\n\nKroger DC\n500 Commerce St, Dallas, TX 75201\n'
  const idx = facilityIndex([load(1, { driverInfo: info })], new Map())
  assert.equal(idx.get(facilityKey({ address: '1234 N Dale Mabry Hwy, Tampa, FL 33607', name: null, city: null })!)?.name, 'Walmart DC 6094')
  assert.equal(idx.get(facilityKey({ address: '500 Commerce St, Dallas, TX 75201', name: null, city: null })!)?.name, 'Kroger DC')
})

test('ключ склада: адрес без регистра и пунктуации, иначе название + город', () => {
  assert.equal(facilityKey({ address: '1234 N. Dale-Mabry Hwy, Tampa, FL 33607', name: null, city: null }), '1234 n dale mabry hwy tampa fl 33607')
  assert.equal(facilityKey({ address: null, name: 'Home Depot', city: 'Tampa, FL' }), 'home depot | tampa fl')
  assert.equal(facilityKey({ address: null, name: null, city: 'Tampa, FL' }), null)
})

test('индекс: визиты, стоянки, детеншн и «как заехать» с последнего раза', () => {
  const ev = (at: string, kind: string, stopSeq: number) => ({ kind, at, stopSeq })
  const events = new Map([
    [1, [ev('2026-09-01T10:00:00Z', 'arrived_pickup', 1), ev('2026-09-01T13:30:00Z', 'loaded', 1)]], // 3.5 ч — детеншн
    [2, [ev('2026-09-02T10:00:00Z', 'arrived_pickup', 1), ev('2026-09-02T11:00:00Z', 'loaded', 1)]], // 1 ч
  ])
  const idx = facilityIndex(
    [
      load(1, { stops: [{ seq: 1, role: 'pickup', name: 'HD 5432', address: '1234 N Dale Mabry Hwy, Tampa, FL 33607', city: 'Tampa, FL', date: '2026-09-01', time: null, refs: [], directions: 'Gate B, south side' }, { seq: 2, role: 'delivery', name: null, address: '500 Commerce St, Dallas, TX 75201', city: 'Dallas, TX', date: '2026-09-02', time: null, refs: [] }] }),
      load(2, { stops: [{ seq: 1, role: 'pickup', name: 'Home Depot', address: '1234 N. Dale Mabry Hwy, Tampa FL 33607', city: 'Tampa, FL', date: '2026-09-02', time: null, refs: [] }, { seq: 2, role: 'delivery', name: null, address: '500 Commerce St, Dallas, TX 75201', city: 'Dallas, TX', date: '2026-09-03', time: null, refs: [] }] }),
      load(3, { status: 'cancelled' }),
    ],
    events,
  )
  const tampa = idx.get('1234 n dale mabry hwy tampa fl 33607')!
  assert.equal(tampa.visits, 2)
  assert.equal(tampa.lastDate, '2026-09-02')
  assert.deepEqual(tampa.dwell.sort(), [210, 60].sort())
  assert.equal(tampa.detentions, 1)
  assert.equal(avgDwell(tampa), 135)
  assert.equal(tampa.directions, 'Gate B, south side')
  // Отменённый груз в индекс не попал: у Далласа два визита, не три.
  assert.equal(idx.get('500 commerce st dallas tx 75201')!.visits, 2)

  // Подсказки для нового груза на тот же пикап: свои визиты не считаются.
  const hints = facilitiesForLoad(idx, load(9, { pickupAddress: '1234 N Dale Mabry Hwy, Tampa, FL 33607', deliveryAddress: 'Nowhere 1, Reno, NV' }))
  assert.equal(hints.length, 1)
  assert.equal(hints[0]!.facility.visits, 2)
  assert.equal(hints[0]!.stop.role, 'pickup')

  assert.equal(filterFacilities([...idx.values()], 'dallas').length, 1)
  assert.equal(filterFacilities([...idx.values()], '').length, 2)
})
