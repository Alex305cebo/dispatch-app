import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normName, pickExact, type NameHitLike } from './broker-match.ts'

const hit = (p: Partial<NameHitLike>): NameHitLike =>
  ({ dot: '1', legalName: 'ALLEN LUND COMPANY, LLC', dbaName: null, active: true, ...p })

test('форма собственности и пунктуация не мешают совпадению', () => {
  assert.equal(normName('ALLEN LUND COMPANY, LLC'), normName('Allen Lund Company'))
  assert.equal(normName('C.H. Robinson Worldwide, Inc.'), 'ch robinson worldwide')
  assert.equal(normName('R & L Carriers'), 'r and l carriers')
})

test('точное совпадение и один кандидат — можно проставлять само', () => {
  const got = pickExact('Allen Lund Company', [hit({ dot: '77' })])
  assert.equal(got?.dot, '77')
})

test('два одинаковых имени — решает человек, а не мы', () => {
  const got = pickExact('TQL', [
    hit({ dot: '1', legalName: 'TQL LLC' }),
    hit({ dot: '2', legalName: 'TQL, INC' }),
  ])
  assert.equal(got, null)
})

test('похожее имя не считается совпадением', () => {
  const got = pickExact('Cura Freight', [hit({ dot: '9', legalName: 'CURA FREIGHT SERVICES LLC' })])
  assert.equal(got, null)
})

test('недействующая запись не проставляется, даже если имя совпало', () => {
  const got = pickExact('Allen Lund Company', [hit({ active: false })])
  assert.equal(got, null)
})

test('совпадение по dba засчитывается — в рейт-коне пишут именно его', () => {
  const got = pickExact('Mode Global', [
    hit({ dot: '5', legalName: 'MODE TRANSPORTATION LLC', dbaName: 'MODE GLOBAL' }),
  ])
  assert.equal(got?.dot, '5')
})

test('пустое имя ничего не подбирает', () => {
  assert.equal(pickExact('', [hit({})]), null)
  assert.equal(pickExact('  ', [hit({})]), null)
})

test('среди нескольких кандидатов берётся тот единственный, что совпал точно', () => {
  const got = pickExact('Landstar Ranger', [
    hit({ dot: '1', legalName: 'LANDSTAR RANGER INC' }),
    hit({ dot: '2', legalName: 'LANDSTAR INWAY INC' }),
  ])
  assert.equal(got?.dot, '1')
})
