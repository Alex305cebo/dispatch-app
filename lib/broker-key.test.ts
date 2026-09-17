import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brokerKeyOf, prettyCompany } from './broker-key.ts'

test('ключ брокера: MC, иначе домен почты, иначе название', () => {
  assert.equal(brokerKeyOf({ mc: 'MC# 322572', email: 'a@tql.com', name: 'TQL' }), '322572')
  assert.equal(brokerKeyOf({ mc: null, email: 'Tyler.Simpson@chrobinson.com', name: 'Tyler Simpson' }), 'chrobinson.com')
  assert.equal(brokerKeyOf({ mc: '', email: 'x@gmail.com', name: ' Some Broker ' }), 'some broker')
  assert.equal(brokerKeyOf({ mc: null, email: null, name: null }), null)
})

test('название из реестра — по-человечески', () => {
  assert.equal(prettyCompany('CH ROBINSON COMPANY LLC'), 'CH Robinson Company LLC')
  assert.equal(prettyCompany('Arrive Logistics'), 'Arrive Logistics')
})
