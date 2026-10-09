import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attentionQueue, overdueDays } from './attention.ts'
import type { LoadRecord } from './map.ts'

const DAY = 86_400_000
const NOW = Date.parse('2026-10-09T15:00:00Z')

const load = (patch: Partial<LoadRecord> = {}) =>
  ({
    id: 1, truckId: null, status: 'booked', rate: 2000, loadedMiles: 500, deadheadMiles: 50,
    pickupDate: null, deliveryDate: null, stops: null, referenceId: null,
    origin: 'Dallas, TX', destination: 'Atlanta, GA', pickupAddress: null, deliveryAddress: null,
    pickupTime: null, deliveryTime: null, priority: null, brokerNotes: null, notesReadAt: null,
    invoicedAt: null, paidAt: null, paymentTermsDays: 30, milesEstimated: false, ...patch,
  }) as LoadRecord

const queue = (loads: LoadRecord[], { rc = [] as number[], pod = [] as number[], money = true } = {}) =>
  attentionQueue({ loads, trucks: [], rateCons: new Set(rc), pods: new Set(pod), marks: new Map(), now: NOW, locale: 'ru', money })

test('заявки, отменённые и оплаченные в ленту не попадают', () => {
  const rows = queue([load({ status: 'quoted' }), load({ status: 'cancelled' }), load({ status: 'paid' })])
  assert.deepEqual(rows, [])
})

test('не хватает бумаг: Rate Con у любого груза, POD — у доставленного', () => {
  const rows = queue([load({ id: 1 }), load({ id: 2, status: 'delivered' }), load({ id: 3, status: 'delivered' })], { rc: [3] })
  assert.deepEqual(
    rows.filter((r) => r.category === 'documents').map((r) => [r.id, r.detail]),
    [[1, 'RC'], [2, 'RC / POD'], [3, 'POD']],
  )
})

test('счёт пора выставлять, когда есть RC и конечный POD, — и только с правом «Финансы»', () => {
  const ready = load({ id: 5, status: 'delivered' })
  assert.deepEqual(
    queue([ready], { rc: [5], pod: [5] }).map((r) => [r.category, r.detail]),
    [['ready', '$2,000']],
  )
  assert.deepEqual(queue([ready], { rc: [5], pod: [5], money: false }), [])
})

test('просрочка оплаты считается как в «Деньги → Не оплачено»: целые дни больше срока', () => {
  const due = (days: number) => load({ status: 'delivered', invoicedAt: new Date(NOW - days * DAY).toISOString() })
  assert.equal(overdueDays(due(30), NOW), null)
  assert.equal(overdueDays(due(41), NOW), 11)
  assert.equal(overdueDays({ ...due(41), paidAt: new Date(NOW).toISOString() }, NOW), null)
  const [row] = queue([due(41)], { rc: [1], pod: [1] }).filter((r) => r.category === 'overdue')
  assert.equal(row.detail, '$2,000 · просрочено на 11 дн')
  assert.equal(row.bad, true)
})

test('важное от брокера — одной строкой, длинное обрезано; прочитанное уходит', () => {
  const long = 'Driver must call\n\n  1 hour before arrival. ' + 'Lumper receipts required. '.repeat(5)
  const rows = queue([load({ id: 7, brokerNotes: long }), load({ id: 8, brokerNotes: 'POD within 24h', notesReadAt: '2026-10-01T00:00:00Z' })], { rc: [7, 8] })
  const notes = rows.filter((r) => r.category === 'broker')
  assert.equal(notes.length, 1)
  assert.ok(notes[0].detail.startsWith('Driver must call 1 hour before arrival.'))
  assert.ok(notes[0].detail.endsWith('…') && notes[0].detail.length <= 89)
})

test('флаг: критичный выше важного, критичный горит красным', () => {
  const rows = queue([load({ id: 1, priority: 'caution' }), load({ id: 2, priority: 'critical' })], { rc: [1, 2] })
  const flags = rows.filter((r) => r.category === 'priority')
  assert.deepEqual(flags.map((r) => [r.id, r.bad]), [[2, true], [1, false]])
})

test('мили на глаз — проверить расчёт, пока груз в работе', () => {
  const rows = queue([load({ id: 9, milesEstimated: true }), load({ id: 10, status: 'delivered', milesEstimated: true })], { rc: [9, 10], pod: [10] })
  assert.deepEqual(rows.filter((r) => r.category === 'checks').map((r) => r.id), [9])
})
