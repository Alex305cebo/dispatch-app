import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agoText, weekAnchorOf, weekLabel, loadWeekAnchorMs, normalizeApptTime, shortName, usDate } from './fmt.ts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

test('shortName keeps the first name and initials the surname', () => {
  assert.equal(shortName('Alex Morgan'), 'Alex M.')
  assert.equal(shortName('Mary Jane Watson'), 'Mary W.') // middle dropped, last initialled
  assert.equal(shortName('Eduard'), 'Eduard') // one word passes through
  assert.equal(shortName('  Sam   Rivera '), 'Sam R.') // extra whitespace collapsed
  assert.equal(shortName(''), '')
  assert.equal(shortName(null), '')
})

// Зарплатная неделя — с пятницы 00:00 по восточному времени, а сервер Hostinger в UTC:
// одни и те же проверки в обоих поясах процесса.
test('неделя с пятницы по восточному — одна и та же на сервере в UTC и в New York', () => {
  const saved = process.env.TZ
  try {
    for (const zone of ['UTC', 'America/New_York']) {
      process.env.TZ = zone // Node меняет пояс процесса на лету
      const friday = Date.parse('2026-09-11T04:00:00Z') // пятница, 00:00 EDT
      for (let h = 0; h < 7 * 24; h++) assert.equal(weekAnchorOf(friday + h * HOUR), friday, `${zone} +${h}h`)
      // Четверг 22:30 в New York — в UTC уже пятница, но неделя ещё эта.
      assert.equal(weekAnchorOf(Date.parse('2026-09-18T02:30:00Z')), friday, zone)
      assert.equal(weekAnchorOf(Date.parse('2026-09-18T04:00:00Z')), friday + 7 * DAY, zone)
      // Пикап — день, а не момент: пятничный груз в неделе своей пятницы.
      assert.equal(weekAnchorOf(loadWeekAnchorMs('2026-09-18', '2026-09-01T12:00:00Z')), friday + 7 * DAY, zone)
      assert.equal(weekLabel(friday, 'en'), 'Sep 11–17, 2026', zone)

      // Неделя перевода часов (1 ноября) на час длиннее: четверг 23:30 EST ещё в ней,
      // конец для weekBounds — полночь следующей пятницы, подпись не теряет день.
      const fall = Date.parse('2026-10-30T04:00:00Z')
      assert.equal(weekAnchorOf(Date.parse('2026-11-06T04:30:00Z')), fall, zone)
      assert.equal(weekAnchorOf(fall + 10 * DAY), fall + 7 * DAY + HOUR, zone)
      assert.equal(weekLabel(fall, 'en'), 'Oct 30 – Nov 5, 2026', zone)
    }
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
})

// normalizeApptTime cleans rate-con appointment strings the AI mashed together. The
// real-world bug: a pickup WINDOW written as two datetimes with no separator and
// military times with no colon. The trap is the YEAR — /2026 must never become 20:26.
test('a mashed pickup window is split and given colons', () => {
  assert.equal(normalizeApptTime('07/22/2026 060007/22/2026 2100'), '07/22/26 06:00 – 21:00')
})

test('the year inside a date is never turned into a time', () => {
  // If /2026 were treated as HHMM it would read "20:26" — this guards that.
  assert.equal(normalizeApptTime('07/22/2026'), '07/22/26')
})

test('an already well-formed appointment passes through untouched', () => {
  assert.equal(normalizeApptTime('07/15/26 12:00 Appt'), '07/15/26 12:00 Appt')
})

test('a bare military time gets its colon', () => {
  assert.equal(normalizeApptTime('0600'), '06:00')
  assert.equal(normalizeApptTime('2100 - 2300'), '21:00 - 23:00')
})

test('a month-name date keeps its year and comes out as MM/DD/YY', () => {
  assert.equal(normalizeApptTime('Sep 4, 2026 13:00 CDT'), '09/04/26 13:00 CDT')
  assert.equal(normalizeApptTime('AUG 20, 2026 0900 - 1400'), '08/20/26 09:00 - 14:00')
})

test('a year already mangled into a time is repaired', () => {
  assert.equal(normalizeApptTime('Sep 4, 20:26 13:00 CDT'), '09/04/26 13:00 CDT')
})

test('usDate: ISO date and timestamp both come out as MM/DD/YY', () => {
  assert.equal(usDate('2026-09-08'), '09/08/26')
  assert.equal(usDate(new Date(2026, 8, 8, 15, 4)), '09/08/26')
  assert.equal(usDate(null), '')
})

// Сервер Hostinger в UTC, диспетчеры в New York: вечерний момент — день по восточному
// времени в любом поясе процесса, а не завтрашний день сервера.
test('agoText: день старого момента — по восточному и в UTC, и в New York', () => {
  const saved = process.env.TZ
  try {
    for (const zone of ['UTC', 'America/New_York']) {
      process.env.TZ = zone
      assert.equal(agoText('2025-07-11T02:30:00Z', 'en'), '07/10/25', zone) // 22:30 EDT
      assert.equal(agoText(new Date('2025-01-10T03:30:00Z'), 'ru'), '01/09/25', zone) // 22:30 EST
      assert.equal(agoText('2025-07-11T04:00:00Z', 'en'), '07/11/25', zone) // полночь EDT
      assert.equal(agoText('not a date', 'en'), '', zone)
    }
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
})

test('empty and null collapse to null', () => {
  assert.equal(normalizeApptTime(null), null)
  assert.equal(normalizeApptTime('   '), null)
})
