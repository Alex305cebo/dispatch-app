import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weekStats, weekStartIso, shiftDay, upcomingStop, stopOrder, scheduleConnection, whenText } from './loads-dashboard.ts'
import type { LoadRecord, TruckRecord } from './map.ts'
import type { LoadStop } from './stops.ts'

const load = (patch: Partial<LoadRecord> = {}) =>
  ({
    id: 1, truckId: 1, status: 'booked', rate: 1000, loadedMiles: 400, deadheadMiles: 100,
    pickupDate: '2026-09-11', deliveryDate: '2026-09-15', stops: null,
    origin: 'Dallas, TX', destination: 'Atlanta, GA', pickupAddress: null, deliveryAddress: null,
    pickupTime: null, deliveryTime: null, ...patch,
  }) as LoadRecord
const stop = (patch: Partial<LoadStop>): LoadStop =>
  ({ seq: 1, role: 'pickup', name: null, address: null, city: null, date: null, time: null, refs: [], ...patch })
const trucks = [{ id: 1, unavailable: null }, { id: 2, unavailable: 'repair' }] as TruckRecord[]

test('расчётная неделя начинается в пятницу, как везде в приложении', () => {
  assert.equal(weekStartIso('2026-09-11'), '2026-09-11') // пятница
  assert.equal(weekStartIso('2026-09-17'), '2026-09-11') // четверг — та же неделя
  assert.equal(weekStartIso('2026-11-01'), '2026-10-30') // через границу месяца и перевод часов
  assert.equal(shiftDay('2026-11-01', 1), '2026-11-02')
})

test('переходящий рейс занимает дни следующей недели, но не её выручку', () => {
  const stats = weekStats([load()], trucks, '2026-09-14')
  assert.equal(stats.occupied, 2)
  assert.equal(stats.capacity, 7) // трак в ремонте не в ёмкости
  assert.equal(stats.gross, 0)
  assert.equal(stats.busy.length, 1)
})

test('партиалы и пересечения не удваивают трако-дни', () => {
  assert.equal(weekStats([load(), load({ id: 2, partial: true })], trucks, '2026-09-14').occupied, 2)
})

test('заявки отдельно, отменённые и грузы без даты не раздувают суммы', () => {
  const stats = weekStats(
    [load(), load({ id: 2, status: 'quoted' }), load({ id: 3, status: 'cancelled' }), load({ id: 4, pickupDate: null })],
    trucks,
    '2026-09-11',
  )
  assert.equal(stats.gross, 1000)
  assert.equal(stats.rpm, 2)
  assert.equal(stats.buckets[0]!.quoted, 1000)
  assert.equal(stats.missingDates, 1)
})

test('без траков и без миль — неизвестно, а не ноль процентов', () => {
  const stats = weekStats([], [], '2026-09-11')
  assert.equal(stats.utilization, null)
  assert.equal(stats.rpm, null)
})

test('неназначенный груз не занимает первый трак', () => {
  assert.equal(weekStats([load({ truckId: null })], trucks, '2026-09-11').occupied, 0)
})

test('отметки водителя ведут по остановкам, закрытый груз без остановки', () => {
  const l = load({
    stops: [
      stop({ seq: 1, city: 'Dallas', date: '2026-09-11' }),
      stop({ seq: 2, role: 'delivery', city: 'Atlanta', date: '2026-09-12' }),
      stop({ seq: 3, role: 'delivery', city: 'Miami', date: '2026-09-13' }),
    ],
  })
  const marks = [{ kind: 'loaded', at: '2026-09-11', stopSeq: 1 }, { kind: 'delivered', at: '2026-09-12', stopSeq: 2 }]
  assert.equal(upcomingStop(l, marks)?.seq, 3)
  assert.equal(upcomingStop(load({ status: 'paid' })), null)
})

test('ближайшая остановка: раньше по дате, потом по окну, без даты — в конец', () => {
  const early = stopOrder(stop({ date: '2026-09-12', time: '8am-3pm' }))
  const late = stopOrder(stop({ date: '2026-09-12' }))
  assert.ok(early < late)
  assert.ok(late < stopOrder(stop({ date: '2026-09-13', time: '06:00' })))
  assert.equal(stopOrder(null), Infinity)
})

test('окно с датой внутри не дублирует дату', () => {
  assert.equal(whenText('2026-09-12', '09/12/26 06:30 FCFS', '?', '?'), '09/12/26 06:30 FCFS')
  assert.equal(whenText('2026-09-12', '8am-3pm', '?', '?'), '09/12/26 · 8am-3pm')
  assert.equal(whenText(null, null, 'no date', 'no time'), 'no date · no time')
  assert.equal(whenText('2026-09-12', null, '?', ''), '09/12/26')
})

test('стыковка сравнивает даты и не обещает, что водитель успеет', () => {
  assert.equal(scheduleConnection(load(), load({ pickupDate: '2026-09-16' })), 'review')
  assert.equal(scheduleConnection(load(), load({ pickupDate: '2026-09-14' })), 'overlap')
  assert.equal(scheduleConnection(load({ deliveryDate: null }), load()), 'unknown')
})
