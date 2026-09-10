import test from 'node:test'
import assert from 'node:assert/strict'
import { detentionAmount, stopWindow, stopWindows } from './detention.ts'
import type { LoadStop } from './stops.ts'

test('до бесплатных часов детеншен не считается', () => {
  assert.equal(detentionAmount(90, 35, 2), 0)
})
test('после двух часов — по ставке, с округлением до четверти часа', () => {
  assert.equal(detentionAmount(180, 35, 2), 35)
  assert.equal(detentionAmount(200, 35, 2), 35 * 1.25)
})

test('стоянка на погрузке закрывается отметкой «Загрузился»', () => {
  const w = stopWindow(
    [
      { kind: 'arrived_pickup', at: '2026-09-08T19:04:00Z' },
      { kind: 'loaded', at: '2026-09-08T20:00:00Z' },
    ],
    Date.parse('2026-09-09T00:00:00Z'),
  )
  assert.deepEqual(w, {
    at: 'pickup',
    sinceIso: '2026-09-08T19:04:00Z',
    endIso: '2026-09-08T20:00:00Z',
    min: 56,
  })
})
test('без второй отметки стоянка идёт до сейчас, выгрузка важнее погрузки', () => {
  const w = stopWindow(
    [
      { kind: 'arrived_pickup', at: '2026-09-08T19:04:00Z' },
      { kind: 'loaded', at: '2026-09-08T20:00:00Z' },
      { kind: 'arrived_delivery', at: '2026-09-09T05:00:00Z' },
    ],
    Date.parse('2026-09-09T06:30:00Z'),
  )
  assert.equal(w?.at, 'delivery')
  assert.equal(w?.endIso, null)
  assert.equal(w?.min, 90)
})
test('без отметок прибытия стоянки нет', () => {
  assert.equal(stopWindow([{ kind: 'note', at: '2026-09-08T19:04:00Z' }]), null)
})

test('окна по каждой остановке: две выгрузки — два окна, старые отметки без номера — к концам', () => {
  const stops: LoadStop[] = [
    { seq: 1, role: 'pickup', name: null, address: null, city: 'Olathe, KS', date: null, time: null, refs: [] },
    { seq: 2, role: 'delivery', name: null, address: null, city: 'Omaha, NE', date: null, time: null, refs: [] },
    { seq: 3, role: 'delivery', name: null, address: null, city: 'Caldwell, ID', date: null, time: null, refs: [] },
  ]
  const w = stopWindows(
    [
      { kind: 'arrived_pickup', at: '2026-09-10T13:00:00Z' },
      { kind: 'loaded', at: '2026-09-10T14:00:00Z' },
      { kind: 'arrived_delivery', at: '2026-09-11T14:00:00Z', stopSeq: 2 },
      { kind: 'delivered', at: '2026-09-11T14:30:00Z', stopSeq: 2 },
      { kind: 'arrived_delivery', at: '2026-09-14T13:00:00Z', stopSeq: 3 },
    ],
    stops,
    Date.parse('2026-09-14T15:00:00Z'),
  )
  assert.deepEqual(
    w.map((x) => `${x.seq}:${x.at}:${x.min}:${x.endIso ? 'closed' : 'open'}`),
    ['1:pickup:60:closed', '2:delivery:30:closed', '3:delivery:120:open'],
  )
})
