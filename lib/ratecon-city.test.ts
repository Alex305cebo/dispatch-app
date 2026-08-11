import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cityStateFrom } from './ratecon-ai-contract.ts'

// A real rate con (Corporate Traffic #11694630) printed each stop as one run of text,
// so the model filled `street` with the whole thing and left city/state empty. With no
// city there was nothing to geocode, mileage could not be computed, and the load was
// refused with "create it manually" — a document read correctly in every other respect.
test('city and state are recovered from a one-line address', () => {
  assert.deepEqual(cityStateFrom('909 MAGNOLIA AVENUE AUBURNDALE, FL 33823 US'), {
    city: 'AUBURNDALE',
    state: 'FL',
  })
  assert.deepEqual(cityStateFrom('27 MILL LANE P.O. BOX 660 SALEM, VA 24153 US'), {
    city: 'SALEM',
    state: 'VA',
  })
  // Without the trailing country, without the ZIP, and with a two-word city.
  assert.deepEqual(cityStateFrom('100 Dock Rd Kansas City, MO'), { city: 'Kansas City', state: 'MO' })
  assert.deepEqual(cityStateFrom('12 Elm St Salem VA 24153'), { city: 'Salem', state: 'VA' })
})

// The danger of a looser pattern: guessing a state out of ordinary street text would
// put a load on the map in the wrong place, which is worse than leaving it unplaced.
test('street text alone never invents a city', () => {
  for (const s of ['909 MAGNOLIA AVENUE', 'P.O. BOX 660', '', null, undefined]) {
    assert.equal(cityStateFrom(s as string | null), null, JSON.stringify(s))
  }
})
