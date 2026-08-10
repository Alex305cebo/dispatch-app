import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailDomain } from './broker-key.ts'

// The grouping key for a broker with no MC. Reported live: two C.H. Robinson loads
// both stored the REP's name ("Tyler Simpson") as the broker, so the brokerage they
// belong to showed zero loads. The domain is what actually identifies the company.
test('the company domain is what identifies a broker without an MC', () => {
  assert.equal(emailDomain('Tyler.Simpson@chrobinson.com'), 'chrobinson.com')
  // Same brokerage, different rep and a different address format — one key.
  assert.equal(emailDomain('SIMPTYL@chrobinson.com'), 'chrobinson.com')
  assert.equal(emailDomain('OPS@CHRobinson.com'), 'chrobinson.com')
})

// The reason this cannot simply be "the part after @": merging every broker who
// happens to use Gmail into one row is worse than not merging at all.
test('free webmail never becomes a grouping key', () => {
  for (const e of ['bob@gmail.com', 'x@yahoo.com', 'y@outlook.com', 'z@mail.ru']) {
    assert.equal(emailDomain(e), null, e)
  }
})

test('missing or malformed addresses fall through instead of throwing', () => {
  for (const e of [null, '', 'not-an-email', 'trailing@']) {
    assert.equal(emailDomain(e as string | null), null, JSON.stringify(e))
  }
})
