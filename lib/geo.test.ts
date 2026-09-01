import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distToPathMiles, haversineMiles, simplifyPath, deadheadEstimate, bearing, type LatLng } from './geo.ts'

const CHICAGO: LatLng = { lat: 41.8781, lng: -87.6298 }
const DALLAS: LatLng = { lat: 32.7767, lng: -96.797 }
const NYC: LatLng = { lat: 40.7128, lng: -74.006 }
const LA: LatLng = { lat: 34.0522, lng: -118.2437 }

// Distances checked against known great-circle values, with a tolerance band so the
// test isn't brittle on the last mile.
test('great-circle matches known city distances', () => {
  assert.ok(Math.abs(haversineMiles(CHICAGO, DALLAS) - 800) < 15, 'Chicago–Dallas ≈ 800 mi')
  assert.ok(Math.abs(haversineMiles(NYC, LA) - 2450) < 25, 'NYC–LA ≈ 2450 mi')
})

test('a point is zero miles from itself', () => {
  assert.equal(haversineMiles(CHICAGO, CHICAGO), 0)
})

test('distance is symmetric', () => {
  assert.equal(haversineMiles(NYC, LA), haversineMiles(LA, NYC))
})

test('deadhead applies road circuity and rounds', () => {
  const straight = haversineMiles(CHICAGO, DALLAS)
  const dh = deadheadEstimate(CHICAGO, DALLAS)
  // Road estimate is longer than straight-line, and an integer.
  assert.ok(dh > straight)
  assert.equal(dh, Math.round(dh))
  assert.ok(Math.abs(dh - straight * 1.2) < 1)
})

test('short local deadhead stays small', () => {
  // Truck 12 mi from pickup → deadhead is tens of miles, not hundreds.
  const near: LatLng = { lat: 41.98, lng: -87.9 } // ~O'Hare, ~12 mi from downtown Chicago
  assert.ok(deadheadEstimate(near, CHICAGO) < 30)
})

test('bearing points north/east/south/west correctly', () => {
  const origin: LatLng = { lat: 40, lng: -90 }
  assert.ok(bearing(origin, { lat: 41, lng: -90 }) < 5, 'due north ≈ 0°')
  assert.ok(Math.abs(bearing(origin, { lat: 40, lng: -89 }) - 90) < 5, 'due east ≈ 90°')
  assert.ok(Math.abs(bearing(origin, { lat: 39, lng: -90 }) - 180) < 5, 'due south ≈ 180°')
  assert.ok(Math.abs(bearing(origin, { lat: 40, lng: -91 }) - 270) < 5, 'due west ≈ 270°')
})

test('bearing to yourself is defined, not NaN', () => {
  const p: LatLng = { lat: 35, lng: -85 }
  assert.equal(Number.isNaN(bearing(p, p)), false)
})

test('distToPathMiles: на маршруте — ноль, в стороне — расстояние до него', () => {
  // Отрезок трассы I-40 западнее Мемфиса, примерно по 35-й широте
  const path: [number, number][] = [[35.15, -90.05], [35.15, -90.55], [35.15, -91.05]]
  assert.ok(distToPathMiles({ lat: 35.15, lng: -90.55 }, path)! < 1)
  // Точка на полградуса южнее — ~35 миль от линии
  const off = distToPathMiles({ lat: 34.65, lng: -90.55 }, path)!
  assert.ok(off > 30 && off < 40, `вышло ${off}`)
  assert.equal(distToPathMiles({ lat: 0, lng: 0 }, []), null)
})

test('simplifyPath: прямая из ста точек схлопывается в две, изгиб остаётся', () => {
  const straight: [number, number][] = Array.from({ length: 100 }, (_, i) => [35, -90 + i * 0.01])
  assert.deepEqual(simplifyPath(straight), [straight[0], straight[99]])
  // Угол: в середине точка уходит на полградуса (~35 миль) — её нельзя выбросить
  const bent: [number, number][] = [[35, -90], [35.5, -89.5], [35, -89]]
  assert.equal(simplifyPath(bent).length, 3)
  // Совсем короткое не трогаем
  assert.deepEqual(simplifyPath([[1, 2]]), [[1, 2]])
})

test('simplifyPath: точки ложатся на прежнюю дорогу — ничто не отходит дальше допуска', () => {
  // Дуга из 400 точек; после прореживания каждая исходная точка не дальше ~0.03 мили
  const arc: [number, number][] = Array.from({ length: 400 }, (_, i) => {
    const t = (i / 399) * Math.PI
    return [35 + Math.sin(t) * 0.5, -90 + Math.cos(t) * 0.5]
  })
  const thin = simplifyPath(arc, 0.02)
  assert.ok(thin.length < 80, `осталось ${thin.length}`)
  // Расстояние до ОТРЕЗКА (в градусах, 1° ≈ 69 миль): distToPathMiles меряет до
  // вершин, а после прореживания вершины стоят за десятки миль друг от друга.
  const segDist = (p: [number, number]) => {
    let best = Infinity
    for (let i = 1; i < thin.length; i++) {
      const [ax, ay] = thin[i - 1]!, [bx, by] = thin[i]!
      const dx = bx - ax, dy = by - ay
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
      best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)))
    }
    return best * 69
  }
  for (const p of arc) {
    const d = segDist(p)
    assert.ok(d < 0.05, `точка ушла на ${d.toFixed(3)} миль`)
  }
})
