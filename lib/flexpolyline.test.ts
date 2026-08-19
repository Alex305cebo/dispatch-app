import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFlexPolyline } from './flexpolyline.ts'

// Официальный вектор из github.com/heremaps/flexible-polyline. Декодер без него
// проверить нечем: неверная линия на карте выглядит как «просто другой маршрут».
test('декодирует официальный пример HERE', () => {
  const pts = decodeFlexPolyline('BFoz5xJ67i1B1B7PzIhaxL7Y')
  assert.deepEqual(
    pts.map(([a, b]) => [Number(a.toFixed(5)), Number(b.toFixed(5))]),
    [
      [50.10228, 8.69821],
      [50.10201, 8.69567],
      [50.10063, 8.6915],
      [50.09878, 8.68752],
    ],
  )
})

test('мусор и пустая строка дают пустой список, а не исключение', () => {
  assert.deepEqual(decodeFlexPolyline(''), [])
  assert.deepEqual(decodeFlexPolyline('*** not a polyline ***'), [])
})
