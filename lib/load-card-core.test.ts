import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWindow, tripFit, thinCoords, directionsUrl, isRateCon } from './load-card-core.ts'

const H = 3_600_000

test('окна из живых рейт-конов разбираются', () => {
  // TQL 38295964
  const tqlPu = parseWindow('9/13/2026 FCFS 07:00 to 22:00')!
  assert.equal((tqlPu.end - tqlPu.start) / H, 15)
  assert.equal(new Date(tqlPu.start).toISOString(), '2026-09-13T07:00:00.000Z')
  const tqlDel = parseWindow('9/14/2026 Appt 09:00')!
  assert.equal(tqlDel.start, tqlDel.end)
  // Arrive Logistics 9497205 — месяц словом
  const arrive = parseWindow('Sep 3, 2026 10:00 CDT')!
  assert.equal(new Date(arrive.start).toISOString(), '2026-09-03T10:00:00.000Z')
  // MODE 16374612
  const mode = parseWindow('08/19/2026 08:00 - 15:00')!
  assert.equal((mode.end - mode.start) / H, 7)
  // 12-часовой формат и двузначный год
  const ampm = parseWindow('7/29/26 8:00 am - 3:00 pm')!
  assert.equal(new Date(ampm.start).toISOString(), '2026-07-29T08:00:00.000Z')
  assert.equal(new Date(ampm.end).toISOString(), '2026-07-29T15:00:00.000Z')
  // Мусор — null, не выдуманная дата
  assert.equal(parseWindow('FCFS'), null)
  assert.equal(parseWindow(''), null)
  assert.equal(parseWindow(null), null)
})

test('успевает ли рейс: живой TQL Wapakoneta → Cleveland, TN', () => {
  // ~447 миль, окно от 07:00 13-го до 09:00 14-го — 26 часов
  const fit = tripFit(447, '9/13/2026 FCFS 07:00 to 22:00', '9/14/2026 Appt 09:00')!
  assert.equal(fit.shifts, 1)
  assert.equal(fit.availMin, 26 * 60)
  assert.equal(fit.tone, 'good')
})

test('невыполнимый рейс ловится до того, как груз взят', () => {
  // 890 миль за 15 часов: две смены с ночёвкой не влезают
  const fit = tripFit(890, '08/16/2026 15:00', '08/17/2026 06:00')!
  assert.equal(fit.shifts, 2)
  assert.ok(fit.slackMin! < 0)
  assert.equal(fit.tone, 'bad')
})

test('без дат считаем только время за рулём, вердикта нет', () => {
  const fit = tripFit(500, null, null)!
  assert.equal(fit.availMin, null)
  assert.equal(fit.tone, null)
  assert.ok(fit.driveMin > 0)
  assert.equal(tripFit(0, null, null), null)
})

test('линия маршрута прореживается, концы на месте', () => {
  const line: [number, number][] = Array.from({ length: 3000 }, (_, i) => [i, i])
  const thin = thinCoords(line, 300)
  assert.equal(thin.length, 300)
  assert.deepEqual(thin[0], [0, 0])
  assert.deepEqual(thin[299], [2999, 2999])
  assert.equal(thinCoords(line.slice(0, 10)).length, 10)
})

test('ссылка на маршрут и признак рейт-кона', () => {
  assert.equal(directionsUrl(null, 'Cleveland, TN'), null)
  assert.ok(directionsUrl('12860 Dixie Hwy, Wapakoneta, OH', 'Cleveland, TN')!.includes('origin=12860%20Dixie%20Hwy'))
  const empty = { pickupName: null, pickupAddress: null, pickupRefs: null, deliveryName: null, deliveryAddress: null, deliveryRefs: null }
  assert.equal(isRateCon(empty), false)
  assert.equal(isRateCon({ ...empty, pickupRefs: 'PU 17093609' }), true)
})
