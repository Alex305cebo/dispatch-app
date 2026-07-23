import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mondayOf, weekLabel, normalizeApptTime } from './fmt.ts'

// Relative to Date.now() rather than hardcoded ISO strings — a fixed UTC timestamp
// can land on a different local calendar day depending on the machine's timezone,
// which would make this brittle across dev/CI without actually testing the logic.
const DAY = 24 * 60 * 60 * 1000

test('mondayOf always lands on a Monday', () => {
  for (let offset = 0; offset < 14; offset++) {
    assert.equal(new Date(mondayOf(Date.now() + offset * DAY)).getDay(), 1, `offset ${offset} days`)
  }
})

test('every day in the same calendar week maps to the same Monday', () => {
  const monday = mondayOf(Date.now())
  for (let i = 0; i < 7; i++) {
    assert.equal(mondayOf(monday + i * DAY), monday, `day ${i} of the week`)
  }
})

test('a Monday midnight maps to itself (idempotent)', () => {
  const monday = mondayOf(Date.now())
  assert.equal(mondayOf(monday), monday)
})

test('the week before and the week after are both 7 days away', () => {
  const monday = mondayOf(Date.now())
  assert.equal(mondayOf(monday - DAY), monday - 7 * DAY)
  assert.equal(mondayOf(monday + 7 * DAY + DAY), monday + 7 * DAY)
})

test('weekLabel returns a non-empty label with a year', () => {
  const label = weekLabel(mondayOf(Date.now()), 'en')
  assert.ok(label.length > 0)
  assert.match(label, /\d{4}/)
})

test('weekLabel works in both locales', () => {
  const monday = mondayOf(Date.now())
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
