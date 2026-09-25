import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWorkingDays, daySpan, heatSegments, idleDays } from './heatmap.ts'
import type { LoadRecord } from './map.ts'

// Прод-сервер в UTC, диспетчеры в New York, а в Kiritimati (UTC+14) уже завтра: дни
// сетки — по восточному времени и в любом поясе процесса одинаковы.
function zonedTest(name: string, fn: () => void) {
  for (const zone of ['UTC', 'America/New_York', 'Pacific/Kiritimati']) {
    test(`${name} [${zone}]`, () => {
      // delete process.env.TZ на Windows пояс не сбрасывает — возвращаем по имени.
      const saved = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      process.env.TZ = zone
      try {
        fn()
      } finally {
        process.env.TZ = saved
      }
    })
  }
}

const load = (over: Partial<LoadRecord>) =>
  ({ id: 1, status: 'booked', rate: 1000, origin: 'A, IL', destination: 'B, TX', transitDays: 1, pickupDate: null, deliveryDate: null, createdAt: '2026-09-01T12:00:00Z', ...over }) as LoadRecord

const days = (l: Partial<LoadRecord>) => [...buildWorkingDays([load(l)]).keys()]

zonedTest('даты пикапа и выгрузки — календарные дни, без сдвига', () => {
  const w = buildWorkingDays([load({ pickupDate: '2026-07-15', deliveryDate: '2026-07-18' })])
  assert.deepEqual([...w.keys()], ['2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18'])
  assert.deepEqual([...w.values()].map(([d]) => [d!.isPickup, d!.isDelivery]), [[true, false], [false, false], [false, false], [false, true]])
})

zonedTest('рейс через перевод часов — каждый день ровно один раз, выгрузка на месте', () => {
  assert.deepEqual(days({ pickupDate: '2026-03-07', deliveryDate: '2026-03-09' }), ['2026-03-07', '2026-03-08', '2026-03-09'])
  assert.deepEqual(days({ pickupDate: '2026-10-31', deliveryDate: '2026-11-02' }), ['2026-10-31', '2026-11-01', '2026-11-02'])
})

zonedTest('без даты пикапа — день заведения по ET: вечером у сервера в UTC уже завтра', () => {
  // 14 сентября, 21:30 EDT; рейс на двое суток.
  assert.deepEqual(days({ createdAt: '2026-09-15T01:30:00Z', transitDays: 2 }), ['2026-09-14', '2026-09-15'])
})

// daySpan spreads a load across every day it ran — the whole point of the utilisation
// heatmap. Two things break it silently: an off-by-one that drops the last day, and a
// delivery-before-pickup row that would spin the loop forever. Both pinned.

zonedTest('a same-day load is exactly one cell', () => {
  assert.deepEqual(daySpan('2026-07-15', '2026-07-15'), ['2026-07-15'])
})

zonedTest('delivery before pickup collapses to one day, never loops', () => {
  assert.deepEqual(daySpan('2026-07-18', '2026-07-15'), ['2026-07-18'])
})

zonedTest('полосы рейсов: обрезка краем окна и дорожки партиалов', () => {
  const w = buildWorkingDays([
    load({ id: 1, pickupDate: '2026-09-08', deliveryDate: '2026-09-11' }),
    load({ id: 2, pickupDate: '2026-09-11', deliveryDate: '2026-09-12' }),
    load({ id: 3, pickupDate: '2026-09-14', deliveryDate: '2026-09-16', destination: 'Reno, NV' }),
  ])
  const segs = heatSegments(w, daySpan('2026-09-10', '2026-09-15'))
  assert.deepEqual(
    segs.map((s) => [s.load.id, s.start, s.end, s.lane, s.cutStart, s.cutEnd]),
    [
      [1, 0, 1, 0, true, false],
      [2, 1, 2, 1, false, false],
      [3, 4, 5, 0, false, true],
    ],
  )
  assert.equal(segs[2]!.load.dest, 'Reno, NV')
})

zonedTest('дни простоя считаются от последнего дня рейса', () => {
  const w = buildWorkingDays([load({ pickupDate: '2026-09-08', deliveryDate: '2026-09-11' })])
  assert.equal(idleDays(w, '2026-09-14'), 3)
  assert.equal(idleDays(w, '2026-09-11'), null)
  assert.equal(idleDays(new Map(), '2026-09-14'), null)
})
