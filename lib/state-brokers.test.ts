import test from 'node:test'
import assert from 'node:assert/strict'
import { stateBrokers, type StateLoadRow } from './state-brokers.ts'

const row = (over: Partial<StateLoadRow>): StateLoadRow => ({
  id: 1,
  origin: 'Morristown, TN',
  destination: 'Vancouver, WA',
  rate: 6400,
  broker_name: 'MDS LOGISTICS INC',
  broker_mc: '322786',
  broker_phone: null,
  broker_email: null,
  day: '2026-09-04',
  created_at: new Date('2026-09-04T16:00:00Z'),
  ...over,
})

test('пикап или выгрузка в штате, по брокеру, свежие сверху', () => {
  const out = stateBrokers(
    [
      row({ id: 1, day: '2026-08-01' }),
      row({ id: 2, origin: 'Chicago, IL', destination: 'Cleveland, TN', day: '2026-09-04', broker_phone: '917-749-1588' }),
      row({ id: 3, origin: 'Chicago, IL', destination: 'Dallas, TX', day: '2026-09-10' }), // не в TN
      row({ id: 4, broker_mc: null, broker_name: 'RXO, Inc.', day: '2026-09-03' }),
      row({ id: 5, broker_mc: null, broker_name: null }), // без брокера
      row({ id: 6, origin: 'Nashville, TN', destination: 'Memphis, TN', broker_mc: '1', broker_name: 'TQL', day: '2026-07-01' }),
      row({ id: 7, origin: 'Austin, TNX', destination: 'Bristol, VA' }), // TNX — не TN
    ],
    'TN',
    (mc) => (mc === '322786' ? 12 : null),
  )
  assert.deepEqual(out.map((b) => b.name), ['MDS LOGISTICS INC', 'RXO, Inc.', 'TQL'])
  const mds = out[0]!
  assert.equal(mds.total, 2)
  assert.equal(mds.payDays, 12)
  assert.equal(mds.phone, '917-749-1588')
  assert.deepEqual(mds.loads.map((l) => [l.id, l.pickup, l.delivery]), [[2, false, true], [1, true, false]])
  assert.deepEqual([out[2]!.loads[0]!.pickup, out[2]!.loads[0]!.delivery], [true, true])
})

test('у брокера видно не больше трёх грузов, итог — все', () => {
  const rows = [1, 2, 3, 4, 5].map((id) => row({ id, day: `2026-09-0${id}` }))
  const [b] = stateBrokers(rows, 'TN', () => null)
  assert.equal(b!.total, 5)
  assert.deepEqual(b!.loads.map((l) => l.id), [5, 4, 3])
})

// Сервер в UTC, диспетчеры в New York: груз без даты пикапа, заведённый в 22:30 по
// восточному, — в своём дне, а не в завтрашнем дне сервера.
test('без даты пикапа — день заведения по восточному и в UTC, и в New York', () => {
  const saved = process.env.TZ
  try {
    for (const zone of ['UTC', 'America/New_York']) {
      process.env.TZ = zone
      const [b] = stateBrokers(
        [
          row({ id: 1, day: null, created_at: new Date('2026-09-15T02:30:00Z') }), // 22:30 EDT
          row({ id: 2, day: null, created_at: '2026-01-10T03:30:00.000Z' }), // 22:30 EST
          row({ id: 3, day: '2026-09-15', created_at: new Date('2026-09-15T02:30:00Z') }), // пикап главнее
        ],
        'TN',
        () => null,
      )
      assert.deepEqual(b!.loads.map((l) => [l.id, l.day]), [[3, '2026-09-15'], [1, '2026-09-14'], [2, '2026-01-09']], zone)
    }
  } finally {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  }
})
