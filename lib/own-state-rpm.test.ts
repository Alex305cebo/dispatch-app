import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ownStateRpm } from './own-state-rpm.ts'
import type { LoadRecord } from './map.ts'

const load = (p: Partial<LoadRecord>): LoadRecord =>
  ({ id: 1, status: 'delivered', rate: 2000, loadedMiles: 1000, origin: 'Dallas, TX', pickupDate: '2026-09-01', ...p }) as LoadRecord

test('ставка штата — весь гросс на все гружёные мили, только по настоящим грузам за год', () => {
  const now = Date.parse('2026-09-15')
  const own = ownStateRpm(
    [
      load({ rate: 2000, loadedMiles: 1000 }),
      load({ id: 2, rate: 1000, loadedMiles: 250 }),
      load({ id: 3, status: 'cancelled', rate: 9000, loadedMiles: 100 }),
      load({ id: 4, status: 'quoted', rate: 9000, loadedMiles: 100 }),
      load({ id: 5, pickupDate: '2025-01-01', rate: 9000, loadedMiles: 100 }),
      load({ id: 6, origin: 'Laredo', rate: 9000, loadedMiles: 100 }),
      load({ id: 7, origin: 'Atlanta, GA', rate: 0, loadedMiles: 100 }),
    ],
    now,
  )
  assert.deepEqual(own, { TX: { rpm: 2.4, n: 2 } })
})
