import test from 'node:test'
import assert from 'node:assert/strict'
import { isProductHost } from './brand.ts'

test('витрина продукта — только dispatch4you.pro и его поддомены', () => {
  assert.equal(isProductHost('dispatch4you.pro'), true)
  assert.equal(isProductHost('DISPATCH4YOU.PRO:443'), true)
  assert.equal(isProductHost('demo.dispatch4you.pro'), true)
  assert.equal(isProductHost('app.mayalogisticsinc.com'), false)
  assert.equal(isProductHost('dispatch4you.pro.evil.example'), false)
  assert.equal(isProductHost('notdispatch4you.pro'), false)
  assert.equal(isProductHost(null), false)
})
