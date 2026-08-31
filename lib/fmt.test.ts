import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weekAnchorOf, weekLabel, normalizeApptTime, shortName } from './fmt.ts'

// Relative to Date.now() rather than hardcoded ISO strings — a fixed UTC timestamp
// can land on a different local calendar day depending on the machine's timezone,
// which would make this brittle across dev/CI without actually testing the logic.
const DAY = 24 * 60 * 60 * 1000

test('shortName keeps the first name and initials the surname', () => {
  assert.equal(shortName('Alex Morgan'), 'Alex M.')
  assert.equal(shortName('Mary Jane Watson'), 'Mary W.') // middle dropped, last initialled
  assert.equal(shortName('Eduard'), 'Eduard') // one word passes through
  assert.equal(shortName('  Sam   Rivera '), 'Sam R.') // extra whitespace collapsed
  assert.equal(shortName(''), '')
  assert.equal(shortName(null), '')
})

test('расчётная неделя всегда начинается в ПЯТНИЦУ (зарплата с пятницы по пятницу)', () => {
  for (let offset = 0; offset < 14; offset++) {
    assert.equal(new Date(weekAnchorOf(Date.now() + offset * DAY)).getDay(), 5, `offset ${offset} days`)
  }
})

test('все семь дней недели ложатся в одну и ту же пятницу', () => {
  const friday = weekAnchorOf(Date.now())
  for (let i = 0; i < 7; i++) {
    assert.equal(weekAnchorOf(friday + i * DAY), friday, `day ${i} of the week`)
  }
})

test('полночь пятницы отображается сама в себя', () => {
  const friday = weekAnchorOf(Date.now())
  assert.equal(weekAnchorOf(friday), friday)
})

test('соседние недели ровно в семи днях', () => {
  const friday = weekAnchorOf(Date.now())
  assert.equal(weekAnchorOf(friday - DAY), friday - 7 * DAY)
  assert.equal(weekAnchorOf(friday + 7 * DAY + DAY), friday + 7 * DAY)
})

test('четверг — ещё прошлая неделя, пятница — уже новая', () => {
  const friday = weekAnchorOf(Date.now())
  const thursday = friday + 6 * DAY + 12 * 60 * 60 * 1000 // четверг, полдень
  assert.equal(weekAnchorOf(thursday), friday)
  assert.equal(weekAnchorOf(friday + 7 * DAY), friday + 7 * DAY)
})

test('weekLabel returns a non-empty label with a year', () => {
  const label = weekLabel(weekAnchorOf(Date.now()), 'en')
  assert.ok(label.length > 0)
  assert.match(label, /\d{4}/)
})

test('weekLabel works in both locales', () => {
  const monday = weekAnchorOf(Date.now())
  assert.ok(weekLabel(monday, 'ru').length > 0)
  assert.ok(weekLabel(monday, 'en').length > 0)
})

// normalizeApptTime cleans rate-con appointment strings the AI mashed together. The
// real-world bug: a pickup WINDOW written as two datetimes with no separator and
// military times with no colon. The trap is the YEAR — /2026 must never become 20:26.
test('a mashed pickup window is split and given colons', () => {
  assert.equal(
    normalizeApptTime('07/22/2026 060007/22/2026 2100'),
    '07/22/2026 06:00 – 21:00',
  )
})

test('the year inside a date is never turned into a time', () => {
  // If /2026 were treated as HHMM it would read "20:26" — this guards that.
  assert.equal(normalizeApptTime('07/22/2026'), '07/22/2026')
})

test('an already well-formed appointment passes through untouched', () => {
  assert.equal(normalizeApptTime('07/15/26 12:00 Appt'), '07/15/26 12:00 Appt')
})

test('a bare military time gets its colon', () => {
  assert.equal(normalizeApptTime('0600'), '06:00')
  assert.equal(normalizeApptTime('2100 - 2300'), '21:00 - 23:00')
})

test('empty and null collapse to null', () => {
  assert.equal(normalizeApptTime(null), null)
  assert.equal(normalizeApptTime('   '), null)
})
