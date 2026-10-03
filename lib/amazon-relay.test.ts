import test from 'node:test'
import assert from 'node:assert/strict'
import { findDateTimes, parseRelayText, stopsFromJson, tripRpm } from './amazon-relay.ts'

const TODAY = '2026-10-03'

test('один рейс: VRID, склады, время, деньги, мили, трейлер', () => {
  const d = parseRelayText(
    `Trip ID: 115XKZ7QD
     ONT8 Moreno Valley, CA 92551
     Mon, Oct 6, 14:30 PDT
     LAS2 North Las Vegas, NV
     Mon, Oct 6, 21:00 PDT
     265 mi · $1,045.50 · $3.95/mi
     Power Only · Drop & Hook
     Trailer ID: AZNU 53123`,
    TODAY,
  )
  assert.equal(d.vrid, '115XKZ7QD')
  assert.equal(d.tourId, null)
  assert.deepEqual(
    d.stops.map((s) => [s.code, s.city, s.date, s.time, s.tz]),
    [
      ['ONT8', 'Moreno Valley, CA', '2026-10-06', '14:30', 'PDT'],
      ['LAS2', 'North Las Vegas, NV', '2026-10-06', '21:00', 'PDT'],
    ],
  )
  assert.equal(d.rate, 1045.5)
  assert.equal(d.miles, 265)
  assert.equal(d.trailerOwner, 'amazon')
  assert.equal(d.loadKind, 'drop')
})

test('тур: номер тура и несколько складов в строке', () => {
  const d = parseRelayText('Tour T-11ABC234Q  VRID 1179PQRS2\nMDW2 → DCK6 → KRB1\n10/07 08:00 CT\n1,203 miles  $3,410', TODAY)
  assert.equal(d.tourId, 'T-11ABC234Q')
  assert.equal(d.vrid, '1179PQRS2')
  assert.deepEqual(d.stops.map((s) => s.code), ['MDW2', 'DCK6', 'KRB1'])
  assert.equal(d.stops[0]!.date, '2026-10-07')
  assert.equal(d.stops[0]!.time, '08:00')
  assert.equal(d.miles, 1203)
  assert.equal(d.rate, 3410)
})

test('без кодов складов — города по порядку; live load', () => {
  const d = parseRelayText('Pickup Joliet, IL 10/08/2026 6:15 AM\nDeliver Indianapolis, IN 10/08/2026 1:00 PM\nLive unload', TODAY)
  assert.deepEqual(
    d.stops.map((s) => [s.code, s.city, s.time]),
    [
      [null, 'Joliet, IL', '06:15'],
      [null, 'Indianapolis, IN', '13:00'],
    ],
  )
  assert.equal(d.loadKind, 'live')
  assert.equal(d.trailerOwner, null)
})

test('пустой и мусорный текст не падает', () => {
  const d = parseRelayText('hello', TODAY)
  assert.equal(d.vrid, null)
  assert.deepEqual(d.stops, [])
  assert.equal(d.rate, null)
})

test('даты: год без года в декабре — следующий', () => {
  assert.equal(findDateTimes('Jan 3 07:00', '2026-12-28')[0]!.date, '2027-01-03')
  assert.equal(findDateTimes('12:00 AM', TODAY)[0]!.time, '00:00')
  assert.equal(findDateTimes('2026-10-06T16:45', TODAY)[0]!.time, '16:45')
})

test('rpm и остановки из JSON', () => {
  assert.equal(tripRpm(1045.5, 265), 3.95)
  assert.equal(tripRpm(1000, null), null)
  assert.deepEqual(stopsFromJson('[{"code":"ont8","city":"X, CA"},{"foo":1},null]'), [
    { code: 'ONT8', city: 'X, CA', date: null, time: null, tz: null },
  ])
  assert.deepEqual(stopsFromJson('nope'), [])
})
