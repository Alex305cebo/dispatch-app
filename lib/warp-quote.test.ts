import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIG_CITY, nextMonday } from './warp-quote.ts'
import { US_STATES } from './us-states.ts'

test('дата котировки — понедельник следующей недели, даже если сегодня понедельник', () => {
  assert.equal(nextMonday(new Date('2026-09-17T12:00:00Z')), '2026-09-21') // четверг
  assert.equal(nextMonday(new Date('2026-09-20T12:00:00Z')), '2026-09-21') // воскресенье
  assert.equal(nextMonday(new Date('2026-09-21T12:00:00Z')), '2026-09-28') // понедельник → не сегодня
})

test('у каждого штата планировщика есть главный город «City, ST»', () => {
  for (const [code] of US_STATES) assert.ok(BIG_CITY[code]?.endsWith(`, ${code}`), code)
})
