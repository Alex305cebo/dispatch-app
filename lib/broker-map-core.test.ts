import test from 'node:test'
import assert from 'node:assert/strict'
import { BROKER_TOKEN_RE, brokerTruck, cityState, fuzz, makeBrokerToken, roughPath, roundEta } from './broker-map-core.ts'

test('токен — 32 символа своего алфавита', () => {
  const tok = makeBrokerToken(new Uint8Array(32).map((_, i) => i * 7))
  assert.match(tok, BROKER_TOKEN_RE)
  assert.throws(() => makeBrokerToken(new Uint8Array(8)))
  assert.equal(BROKER_TOKEN_RE.test('2237-k7m3xq9pwd4h'), false)
})

test('огрубление: точка прилипает к сетке ~10 миль', () => {
  const a = fuzz(35.1234, -85.4321)
  assert.ok(Math.abs(a.lat - 35.1234) <= 0.075 + 1e-9)
  assert.ok(Math.abs(a.lng + 85.4321) <= 0.075 + 1e-9)
  // Рядом стоящий трак — та же точка: по ней не видно, на какой он стоянке.
  assert.deepEqual(fuzz(35.1301, -85.4402), a)
})

test('город со штатом без улицы и индекса', () => {
  assert.equal(cityState('1200 Main St, Dallas, TX 75201'), 'Dallas, TX')
  assert.equal(cityState('Atlanta, GA'), 'Atlanta, GA')
  assert.equal(cityState('12.0mi N from Ashland, VA'), 'Ashland, VA')
  assert.equal(cityState('TX · El Paso, TX'), 'El Paso, TX')
  assert.equal(cityState('somewhere'), null)
  assert.equal(cityState(null), null)
})

test('линия огрублена и прорежена', () => {
  const coords = Array.from({ length: 1000 }, (_, i) => [35 + i * 0.001234, -85 - i * 0.001] as [number, number])
  const p = roughPath(coords)
  assert.ok(p.length <= 302)
  assert.deepEqual(p[0], [35, -85])
  for (const [a] of p) assert.equal(Math.round(a * 100) / 100, a)
})

test('ETA до четверти часа', () => {
  assert.equal(roundEta(Date.UTC(2026, 9, 28, 14, 8)), Date.UTC(2026, 9, 28, 14, 15))
})

const base = {
  n: 2,
  lat: 35.12,
  lng: -85.43,
  near: 'Cleveland, TN',
  moving: true,
  origin: '500 Industrial Dr, Dalton, GA 30721',
  destination: 'Chicago, IL',
  pickupEta: '10/28/26 15:00 EDT',
  deliveryEta: '10/29/26 18:00 CDT',
  milesLeft: 684,
  path: [[35.12345, -85.4321]] as [number, number][],
}

test('в строке брокера только белый список полей', () => {
  const t = brokerTruck({ ...base, status: 'loaded' })
  assert.deepEqual(Object.keys(t).sort(), ['deliveryEta', 'from', 'lat', 'lng', 'milesLeft', 'moving', 'n', 'near', 'path', 'pickupEta', 'status', 'to'])
  assert.equal(t.from, 'Dalton, GA')
  assert.equal(t.pickupEta, null)
  assert.equal(t.milesLeft, 680)
  const json = JSON.stringify(t)
  assert.ok(!json.includes('Industrial'))
  assert.ok(!json.includes('30721'))
  assert.ok(!json.includes('35.12345'))
})

test('свободный трак: ни маршрута, ни ETA', () => {
  const t = brokerTruck({ ...base, status: 'available' })
  assert.equal(t.from, null)
  assert.equal(t.to, null)
  assert.equal(t.deliveryEta, null)
  assert.deepEqual(t.path, [])
})
