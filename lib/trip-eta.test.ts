import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apptMinutes, realDriveMinutes, tripEta, zonedMs } from './trip-eta.ts'

test('короткий перегон едет без ночёвок', () => {
  assert.equal(realDriveMinutes(300), 300) // 5 часов
  assert.equal(realDriveMinutes(660), 660) // ровно 11 часов — ещё без отдыха
})

test('за каждой полной сменой — 10 часов отдыха', () => {
  assert.equal(realDriveMinutes(661), 661 + 600) // чуть за смену — одна ночёвка
  // 31ч драйва (груз 1414): две ночёвки → ~51ч реального пути
  assert.equal(realDriveMinutes(1860), 1860 + 2 * 600)
})

test('пустой или кривой ввод не ломает расчёт', () => {
  assert.equal(realDriveMinutes(0), 0)
  assert.equal(realDriveMinutes(NaN), 0)
})

test('время назначения читается по началу окна', () => {
  assert.equal(apptMinutes('14:00'), 14 * 60)
  assert.equal(apptMinutes('14:00-16:00'), 14 * 60)
  assert.equal(apptMinutes('FCFS'), null)
  assert.equal(apptMinutes(null), null)
})

test('стенное время переводится в UTC по поясу выгрузки', () => {
  // 29 авг 2026, 14:00 в Чикаго (CDT, UTC-5) = 19:00 UTC
  assert.equal(zonedMs('2026-08-29', 14 * 60, 'America/Chicago'), Date.UTC(2026, 7, 29, 19, 0))
  // Тот же час в Бойсе (MDT, UTC-6) = 20:00 UTC
  assert.equal(zonedMs('2026-08-29', 14 * 60, 'America/Boise'), Date.UTC(2026, 7, 29, 20, 0))
  assert.equal(zonedMs('мусор', 0, 'America/Chicago'), null)
})

test('запас и опоздание считаются от реального пути, не от чистого драйва', () => {
  const now = Date.UTC(2026, 7, 29, 12, 0) // полдень UTC
  // 10 часов драйва, срок сегодня 23:59 Чикаго (04:59 UTC следующего дня) → успевает
  const ok = tripEta(600, now, '2026-08-29', null, 'America/Chicago')
  assert.equal(ok.realMin, 600)
  assert.ok(ok.slackMin! > 0, `ожидался запас, вышло ${ok.slackMin}`)
  // 20 часов драйва = 30ч пути → к концу того же дня уже не успеть
  const late = tripEta(1200, now, '2026-08-29', null, 'America/Chicago')
  assert.equal(late.realMin, 1200 + 600)
  assert.ok(late.slackMin! < 0, `ожидалось опоздание, вышло ${late.slackMin}`)
})

test('без даты доставки срок не выдумывается', () => {
  assert.equal(tripEta(600, Date.UTC(2026, 7, 29), null, null, null).slackMin, null)
})

test('окно выгрузки: опоздание считается от КОНЦА окна, раньше открытия — ждать (груз 3656, 13.11.2026)', () => {
  // Сейчас 10:04 CST, ехать ~4ч32м → приезд 14:36 CST; окно 08:00–15:00 в Висконсине.
  const now = Date.UTC(2026, 10, 13, 16, 4)
  const eta = tripEta(272, now, '2026-11-13', '08:00 - 15:00', 'America/Chicago')
  assert.equal(eta.slackMin, 24)
  assert.equal(eta.waitMin, 0)
  // Окно с датой внутри строки — дата не путается с часами.
  assert.equal(tripEta(272, now, '2026-11-13', '11/13/26 08:00 - 15:00', 'America/Chicago').slackMin, 24)
  assert.equal(tripEta(272, now, '2026-11-13', '8am-3pm', 'America/Chicago').slackMin, 24)
  // После 15:00 — опоздание.
  assert.equal(tripEta(272 + 60, now, '2026-11-13', '08:00 - 15:00', 'America/Chicago').slackMin, -36)
  // Приезд до открытия: не опоздание, а ожидание.
  const early = tripEta(60, Date.UTC(2026, 10, 13, 12, 0), '2026-11-13', '08:00 - 15:00', 'America/Chicago')
  assert.ok(early.slackMin! > 0)
  assert.equal(early.waitMin, 60) // приезд 07:00 CST, окно с 08:00
  // Одно время назначения (Appt 06:00) — это и есть срок.
  assert.equal(tripEta(60, Date.UTC(2026, 10, 13, 12, 0), '2026-11-13', 'Appt 06:00', 'America/Chicago').slackMin, -60)
})
