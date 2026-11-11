import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tidyTimes } from './driver-info-zip.ts'

// Груз 3655 (11/10/26): «Time: 11/10/2026 1330» уходило водителю как есть.
test('дата MM/DD/YY и время с двоеточием', () => {
  assert.equal(tidyTimes('Time: 11/10/2026 1330'), 'Time: 11/10/26 13:30')
})

test('окно и одиночные цифры дня', () => {
  assert.equal(tidyTimes('Time: 1/5/2026 0800-1500 FCFS'), 'Time: 01/05/26 08:00-15:00 FCFS')
  assert.equal(tidyTimes('Time: 11/12/2026 08:00 - 15:00 Appt'), 'Time: 11/12/26 08:00 - 15:00 Appt')
})

test('уже правильное не меняется', () => {
  assert.equal(tidyTimes('Time: 07/15/26 12:00 Appt'), 'Time: 07/15/26 12:00 Appt')
})

test('год не становится временем, остальные строки не трогаются', () => {
  assert.equal(tidyTimes('Time: 11/10/2026'), 'Time: 11/10/26')
  const other = 'LOAD ID: #1403934\n5008 S Boyle Ave\nVERNON, CA 90058\nRef: SEKU1396116 PO 2026 1330'
  assert.equal(tidyTimes(other), other)
})
