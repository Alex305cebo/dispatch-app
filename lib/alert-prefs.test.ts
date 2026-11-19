import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALERT_DEFAULTS, alertKindOf, parseAlertPrefs } from './alert-prefs.ts'

test('по умолчанию: всплывающих нет, «не оплачено» выключено, важное от брокера — в колокольчике', () => {
  const p = parseAlertPrefs(null)
  assert.equal(p.popups, false)
  assert.equal(p.overdue, false)
  assert.equal(p.notes, true)
})

test('сохранённое перекрывает умолчание, мусор игнорируется', () => {
  const p = parseAlertPrefs(JSON.stringify({ popups: true, overdue: true, notes: false, nogps: 'x', junk: true }))
  assert.equal(p.popups, true)
  assert.equal(p.overdue, true)
  assert.equal(p.notes, false)
  assert.equal(p.nogps, ALERT_DEFAULTS.nogps)
  assert.equal((p as Record<string, unknown>).junk, undefined)
  assert.deepEqual(parseAlertPrefs('{bad'), ALERT_DEFAULTS)
})

test('вид события по идентификатору', () => {
  assert.equal(alertKindOf('notes:12'), 'notes')
  assert.equal(alertKindOf('overdue:5:2'), 'overdue')
  assert.equal(alertKindOf('dnote:7'), 'dnote')
  assert.equal(alertKindOf('weird:1'), null)
})
