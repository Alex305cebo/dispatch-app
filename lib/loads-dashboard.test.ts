import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weekStats, weekStartIso, shiftDay, upcomingStop, stopOrder, scheduleConnection, whenText, lateStop, priorityRank, onTimeStats } from './loads-dashboard.ts'
import { zonedMs } from './trip-eta.ts'
import { weekLabel } from './fmt.ts'
import { todayEt } from './payments.ts'
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

test('календарь недели одинаков на сервере в UTC и в браузере в Нью-Йорке (#418)', () => {
  // Четверг 22:30 в Нью-Йорке — в UTC уже пятница, то есть новая неделя; и это неделя
  // перевода часов, где сдвиг на 24 ч давал один день дважды.
  const now = new Date('2026-11-06T03:30:00Z')
  const render = (zone: string) => {
    process.env.TZ = zone
    const week = weekStartIso(todayEt(now))
    return { week, days: [0, 1, 2, 3, 4, 5, 6].map((i) => shiftDay(week, i)), label: weekLabel(Date.parse(`${week}T12:00:00`), 'ru') }
  }
  const saved = process.env.TZ
  try {
    const server = render('UTC')
    assert.deepEqual(render('America/New_York'), server)
    assert.deepEqual(server.days, ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
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

test('lateStop: окно пикапа закрылось по поясу штата, приезда нет — опаздывает', () => {
  const l = load({ origin: 'Olathe, KS', pickupDate: '2026-09-15', pickupTime: '8am-3pm' })
  const at = (h: number) => zonedMs('2026-09-15', h * 60, 'America/Chicago')!
  assert.equal(lateStop(l, [], at(14)), null)
  assert.equal(lateStop(l, [], at(16))?.minutes, 60)
  assert.equal(lateStop(l, [], at(16))?.stop.role, 'pickup')
  // Отметка «приехал» или GPS у точки — не опаздывает.
  assert.equal(lateStop(l, [{ kind: 'arrived_pickup', at: new Date(at(15)).toISOString() }], at(16)), null)
  assert.equal(lateStop(load({ ...l, pickupArrivedAt: '2026-09-15T19:00:00Z' }), [], at(16)), null)
  // Без даты и у закрытых грузов срока нет.
  assert.equal(lateStop(load({ ...l, pickupDate: null }), [], at(16)), null)
  assert.equal(lateStop(load({ ...l, status: 'delivered' }), [], at(16)), null)
  // Пикап пройден → следующая точка выгрузка, её окно ещё открыто.
  const loaded = [{ kind: 'loaded', at: new Date(at(12)).toISOString() }]
  assert.equal(lateStop(load({ ...l, status: 'in_transit', deliveryTime: '18:00' }), loaded, at(16)), null)
  assert.equal(lateStop(load({ ...l, status: 'in_transit', deliveryTime: '10:00' }), loaded, at(16))?.stop.role, 'delivery')
})

test('onTimeStats: приехал не позже конца окна; считаются только точки с окном и приездом за 90 дней', () => {
  const at = (day: string, h: number) => zonedMs(day, h * 60, 'America/Chicago')!
  const iso = (ms: number) => new Date(ms).toISOString()
  const l = load({
    id: 7, status: 'delivered', origin: 'Olathe, KS', destination: 'Dallas, TX',
    pickupDate: '2026-09-10', pickupTime: '8am-3pm', deliveryDate: '2026-09-12', deliveryTime: '10:00',
    deliveryArrivedAt: iso(at('2026-09-12', 11)), // GPS у выгрузки на час позже окна
  })
  const now = at('2026-09-16', 12)
  // Из двух отметок «приехал» на пикап берётся ранняя (14:00 при окне до 15:00).
  const events = new Map([[7, [
    { kind: 'arrived_pickup', at: iso(at('2026-09-10', 16)) },
    { kind: 'arrived_pickup', at: iso(at('2026-09-10', 14)) },
  ]]])
  assert.deepEqual(onTimeStats([l], events, now), { onTime: 1, total: 2 })
  // Без времени окна и без приезда точка не считается.
  assert.deepEqual(onTimeStats([load({ ...l, deliveryTime: null })], events, now), { onTime: 1, total: 1 })
  assert.deepEqual(onTimeStats([l], new Map(), now), { onTime: 0, total: 1 })
  // Окна старше 90 дней и отменённые грузы не в счёт.
  assert.deepEqual(onTimeStats([l], events, at('2026-12-20', 12)), { onTime: 0, total: 0 })
  assert.deepEqual(onTimeStats([load({ ...l, status: 'cancelled' })], events, now), { onTime: 0, total: 0 })
})

test('priorityRank: critical > important > caution > без флага', () => {
  assert.deepEqual(['critical', 'important', 'caution', null].map((p) => priorityRank(p as never)), [3, 2, 1, 0])
})
