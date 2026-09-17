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
