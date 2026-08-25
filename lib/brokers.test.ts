import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailDomain, foldReps } from './broker-key.ts'

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

// foldReps — люди со стороны брокера. У крупного каждый груз ведёт свой менеджер.
test('один человек не задваивается, даже если писал с разным регистром', () => {
  const out = foldReps([
    { name: 'Tyler Simpson', email: 'Tyler.Simpson@chrobinson.com', phone: '312-944-7277', at: '2026-08-10' },
    { name: 'TYLER SIMPSON', email: 'tyler.simpson@CHROBINSON.com', phone: null, at: '2026-08-20' },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0]!.loads, 2)
  assert.equal(out[0]!.lastAt, '2026-08-20')
  // Телефон был только в одном грузе — он должен сохраниться.
  assert.equal(out[0]!.phone, '312-944-7277')
})

test('разные люди одной компании остаются разными', () => {
  const out = foldReps([
    { name: 'Tyler Simpson', email: 't@chrobinson.com', phone: null, at: '2026-08-10' },
    { name: 'Jessica Chambers', email: 'j@chrobinson.com', phone: null, at: '2026-08-11' },
  ])
  assert.equal(out.length, 2)
})

test('без почты человек узнаётся по имени', () => {
  const out = foldReps([
    { name: 'Bob', email: null, phone: '1', at: '2026-08-01' },
    { name: 'bob', email: null, phone: null, at: '2026-08-02' },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0]!.loads, 2)
})

test('запись без имени и без почты в список не идёт', () => {
  assert.deepEqual(foldReps([{ name: null, email: null, phone: '555', at: '2026-08-01' }]), [])
})

test('первым идёт тот, кто возит больше', () => {
  const out = foldReps([
    { name: 'A', email: 'a@x.com', phone: null, at: '2026-08-01' },
    { name: 'B', email: 'b@x.com', phone: null, at: '2026-08-02' },
    { name: 'B', email: 'b@x.com', phone: null, at: '2026-08-03' },
  ])
  assert.equal(out[0]!.name, 'B')
})

test('одна и та же фамилия с двух корпоративных адресов — один человек', () => {
  // Настоящий C.H. Robinson: «Tyler.Simpson@» и «SIMPTYL@» — один менеджер.
  const out = foldReps([
    { name: 'Tyler Simpson', email: 'Tyler.Simpson@chrobinson.com', phone: null, at: '2026-08-10' },
    { name: 'Tyler Simpson', email: 'SIMPTYL@chrobinson.com', phone: null, at: '2026-08-04' },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0]!.loads, 2)
})
