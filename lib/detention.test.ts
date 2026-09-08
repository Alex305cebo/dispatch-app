import test from 'node:test'
import assert from 'node:assert/strict'
import { detentionAmount, stopWindow } from './detention.ts'

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
