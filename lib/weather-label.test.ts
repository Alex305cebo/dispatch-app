import test from 'node:test'
import assert from 'node:assert/strict'
import { weatherKind, weatherTone } from './weather-label.ts'

test('сырые названия службы погоды сводятся к понятным типам', () => {
  assert.equal(weatherKind('Extreme Heat Warning'), 'heat')
  assert.equal(weatherKind('Wind Chill Advisory'), 'cold')
  assert.equal(weatherKind('Ice Storm Warning'), 'ice')
  assert.equal(weatherKind('Winter Storm Warning'), 'snow')
  assert.equal(weatherKind('High Wind Warning'), 'wind')
  assert.equal(weatherKind('Severe Thunderstorm Warning'), 'storm')
  assert.equal(weatherKind('Flash Flood Warning'), 'flood')
  assert.equal(weatherKind('Dense Fog Advisory'), 'fog')
  assert.equal(weatherKind('Red Flag Warning'), 'fire')
  assert.equal(weatherKind('Something Unheard Of'), 'other')
})

test('гололёд ловится раньше общей бури, а не как снегопад', () => {
  assert.equal(weatherKind('Ice Storm Warning'), 'ice')
  assert.equal(weatherKind('Freezing Rain Advisory'), 'ice')
})

test('красным только то, что останавливает рейс', () => {
  assert.equal(weatherTone(weatherKind('Tornado Warning')), 'bad')
  assert.equal(weatherTone(weatherKind('Blizzard Warning')), 'bad')
  assert.equal(weatherTone(weatherKind('Extreme Heat Warning')), 'warn')
  assert.equal(weatherTone(weatherKind('Dense Fog Advisory')), 'warn')
})
