import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distToPathMiles, haversineMiles, simplifyPath, deadheadEstimate, bearing, type LatLng, plausibleNaFix, trailSegments, overlapSlots, splitShared} from './geo.ts'

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

test('0,0 от ELD — не место трака, а Гвинейский залив', () => {
  assert.equal(plausibleNaFix(0, 0), false)
  assert.equal(plausibleNaFix(null, null), false)
  assert.equal(plausibleNaFix(43.8, 200), false)
  // настоящие точки парка: Айдахо, Техас, Аляска
  assert.equal(plausibleNaFix(43.78, -116.94), true)
  assert.equal(plausibleNaFix(27.52, -99.5), true)
  assert.equal(plausibleNaFix(61.2, -149.9), true)
})

test('след рвётся там, где пропадала связь: две дальние крошки — не проеханная дорога', () => {
  const coords: [number, number][] = [
    [30.19, -99.32],
    [30.18, -99.3],
    [29.28, -98.66], // 74 мили без единой точки — разрыв связи
    [29.27, -98.65],
  ]
  const segs = trailSegments(coords, [null, '1', '2', '3'])
  assert.equal(segs.length, 2)
  assert.deepEqual(segs[0]!.coords, coords.slice(0, 2))
  assert.deepEqual(segs[1]!.coords, coords.slice(2))
  // одиночная точка после разрыва не рисуется вовсе
  assert.equal(trailSegments([coords[0]!, coords[2]!], [null, '1']).length, 0)
})

// Пунктир со сдвигом фазы на карте ставится только тем тракам, которые правда
// едут по одной дороге. Координаты взяты по I-40 и I-75 — настоящие шоссе, а не
// выдуманные числа: сетка совпадений грубая, и на случайных точках тест бы врал.
const KNOXVILLE: [number, number] = [35.96, -83.92]
const NASHVILLE: [number, number] = [36.16, -86.78]
const MEMPHIS: [number, number] = [35.15, -90.05]
const ATLANTA: [number, number] = [33.75, -84.39]

test('один трак на карте — пунктир не нужен', () => {
  assert.equal(overlapSlots(new Map([[0, [[KNOXVILLE, NASHVILLE]]]])).size, 0)
})

test('два трака по одной дороге получают разные слоты фазы', () => {
  const slots = overlapSlots(
    new Map([
      [0, [[KNOXVILLE, NASHVILLE]]],
      [1, [[KNOXVILLE, NASHVILLE]]],
    ]),
  )
  assert.equal(slots.size, 2)
  assert.equal(slots.get(0)!.of, 2)
  assert.equal(slots.get(1)!.of, 2)
  assert.notEqual(slots.get(0)!.slot, slots.get(1)!.slot)
})

test('разные дороги — оба остаются сплошными', () => {
  const slots = overlapSlots(
    new Map([
      [0, [[KNOXVILLE, NASHVILLE]]], // I-40 на запад
      [1, [[KNOXVILLE, ATLANTA]]], // I-75 на юг
    ]),
  )
  assert.equal(slots.size, 0)
})

test('частично общий участок тоже считается: разъехались — но вместе ехали', () => {
  const slots = overlapSlots(
    new Map([
      [0, [[MEMPHIS, NASHVILLE, KNOXVILLE]]],
      [1, [[NASHVILLE, KNOXVILLE]]], // тот же кусок Нэшвилл → Ноксвилл
    ]),
  )
  assert.equal(slots.size, 2)
})

test('цепочка A–B, B–C держит фазу на всех троих', () => {
  // B едет и с A, и с C, а сами A и C общей дороги не имеют. Если считать парами,
  // A и C получили бы один слот — и на куске, где все трое рядом, закрыли бы друг
  // друга. Поэтому слот даётся по всей связной компании.
  const slots = overlapSlots(
    new Map([
      [0, [[MEMPHIS, NASHVILLE]]],
      [1, [[MEMPHIS, NASHVILLE, KNOXVILLE]]],
      [2, [[NASHVILLE, KNOXVILLE]]],
    ]),
  )
  assert.equal(slots.size, 3)
  assert.deepEqual(
    [...slots.values()].map((v) => v.slot).sort(),
    [0, 1, 2],
  )
  for (const v of slots.values()) assert.equal(v.of, 3)
})

test('два отрезка ОДНОГО трака сами с собой не пересекаются', () => {
  // У трака путь разбит на «до пикапа» и «от пикапа» — это один ключ, и пунктир
  // ему не полагается.
  assert.equal(
    overlapSlots(
      new Map([
        [
          0,
          [
            [MEMPHIS, NASHVILLE],
            [NASHVILLE, MEMPHIS],
          ],
        ],
      ]),
    ).size,
    0,
  )
})

test('мимолётное пересечение на перекрёстке пунктира не даёт', () => {
  // Пути скрещиваются под прямым углом: общих ячеек одна-две, вместе они не едут.
  const slots = overlapSlots(
    new Map([
      [0, [[[35.0, -86.0], [37.0, -86.0]] as [number, number][]]],
      [1, [[[36.0, -87.0], [36.0, -85.0]] as [number, number][]]],
    ]),
  )
  assert.equal(slots.size, 0)
})

test('пунктир только на общем куске: где трак поехал один — сплошная', () => {
  // 0 идёт Мемфис → Нэшвилл → Ноксвилл, 1 — только Мемфис → Нэшвилл. Общая у них
  // западная половина; хвост до Ноксвилла трак 0 едет один.
  const dense = (a: [number, number], b: [number, number]): [number, number][] =>
    Array.from({ length: 41 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 40, a[1] + ((b[1] - a[1]) * i) / 40] as [number, number])
  const west = dense(MEMPHIS, NASHVILLE)
  const east = dense(NASHVILLE, KNOXVILLE)
  const slots = overlapSlots(
    new Map([
      [0, [[...west, ...east]]],
      [1, [west]],
    ]),
  )
  const phase = slots.get(0)
  assert.ok(phase, 'трак 0 попал в компанию')
  const parts = splitShared([...west, ...east], phase.shared)
  assert.ok(
    parts.some((p) => p.shared),
    'общий кусок есть',
  )
  assert.ok(
    parts.some((p) => !p.shared),
    'одиночный хвост есть',
  )
  // Куски идут подряд и покрывают весь путь: между сплошной и пунктиром нет дыры.
  for (let i = 1; i < parts.length; i++) {
    assert.deepEqual(parts[i]!.coords[0], parts[i - 1]!.coords.at(-1), 'куски стыкуются')
  }
  assert.deepEqual(parts[0]!.coords[0], west[0])
  assert.deepEqual(parts.at(-1)!.coords.at(-1), east.at(-1))
})

test('без общих ячеек путь остаётся одним сплошным куском', () => {
  const parts = splitShared([MEMPHIS, NASHVILLE], new Set())
  assert.equal(parts.length, 1)
  assert.equal(parts[0]!.shared, false)
})
