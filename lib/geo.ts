// Deadhead math — distance from where the truck sits (ELD GPS) to a load's pickup.
// Pure and offline: no API, no key. Needed by every ELD path (official API,
// TrackEnsure, or extension), so it's built first and independently.

export type LatLng = { lat: number; lng: number }

const EARTH_MILES = 3958.8

/** Great-circle (straight-line) distance between two points, in miles. */
/**
 * Похожи ли координаты на настоящую точку в Северной Америке (США, Канада, Мексика).
 * ELD изредка присылает 0,0 — это Гвинейский залив, и от трака через Атлантику
 * тянулась линия следа (замечено 09/17/26 у трака 1705). Такие точки не наши.
 */
/** Где след рвётся: 25 миль между соседними крошками — это уже не «шёл рядом»,
 * а пропавшая связь (у 1705 09/17/26 было 74 мили за 2 часа без единой точки). */
const TRAIL_GAP_MI = 25

/**
 * Хвост пути — куски по непрерывным участкам. Одна линия через всю дыру выглядела
 * как проеханная дорога по прямой через поля, чего не было. Куски короче двух точек
 * рисовать нечего.
 */
export function trailSegments(
  coords: [number, number][],
  ats: (string | null)[],
): { coords: [number, number][]; ats: (string | null)[] }[] {
  const out: { coords: [number, number][]; ats: (string | null)[] }[] = []
  let cur: { coords: [number, number][]; ats: (string | null)[] } = { coords: [], ats: [] }
  coords.forEach((c, i) => {
    const prev = cur.coords[cur.coords.length - 1]
    if (prev && haversineMiles({ lat: prev[0], lng: prev[1] }, { lat: c[0], lng: c[1] }) > TRAIL_GAP_MI) {
      if (cur.coords.length > 1) out.push(cur)
      cur = { coords: [], ats: [] }
    }
    cur.coords.push(c)
    cur.ats.push(ats[i] ?? null)
  })
  if (cur.coords.length > 1) out.push(cur)
  return out
}

export function plausibleNaFix(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 14 &&
    lat <= 72 &&
    lng >= -170 &&
    lng <= -52
  )
}

export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Roads aren't straight lines. US road distance runs ~1.15–1.25× the great-circle
// distance on average, so a bare haversine underestimates deadhead. This factor is
// the deliberate approximation.
// ponytail: fixed 1.2 circuity factor. Swap for a real routing API (OSRM/Mapbox)
// only if the dispatcher's confirmed corrections show it's consistently off.
const CIRCUITY = 1.2

/**
 * Estimated deadhead miles from the truck to the load origin. This is a PROPOSAL —
 * the dispatcher sees it and confirms (same as the amber fields today), so a
 * straight-line×circuity estimate is fine; it doesn't silently drive the money.
 */
export function deadheadEstimate(truck: LatLng, origin: LatLng): number {
  return Math.round(haversineMiles(truck, origin) * CIRCUITY)
}

/**
 * Snap a coordinate onto a ~3.5 mile grid, for the CACHE KEY of anything looked up by
 * a moving truck's position — road routes and weather alerts both do this.
 *
 * Both caches used to key on the coordinate rounded to 0.01° (~0.7 mi). A truck at
 * highway speed leaves that cell in about 40 seconds, so their 30-minute TTLs never
 * got a single hit while a truck was rolling: every page load re-asked a free
 * external service and left another row behind in `settings`. 0.05° holds one cell
 * for ~3.5 minutes of driving.
 *
 * This is the accuracy/traffic dial: widen it for cheaper caching, shrink it for a
 * fresher answer.
 */
export const CACHE_CELL_DEG = 0.05

export function cacheCell(n: number): string {
  return (Math.round(n / CACHE_CELL_DEG) * CACHE_CELL_DEG).toFixed(2)
}

/** Compass bearing (0-360, 0=north, clockwise) from `a` to `b` — points the moving-
 * truck arrow at its actual direction of travel instead of a fixed "up". */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/**
 * Насколько точка в стороне от ломаной маршрута, в милях.
 *
 * Минимум по ВЕРШИНАМ, без проекции на отрезки: полилиния OSRM плотная (точки
 * через сотни футов), и на траковых масштабах разница с честной проекцией — шум.
 * Каждая десятая вершина: у маршрута через полстраны их до ~18 тысяч, а огрубление
 * шага до долей мили погоды в ответе «ушёл ли на 25+ миль» не делает.
 */
export function distToPathMiles(pt: LatLng, path: [number, number][]): number | null {
  if (!path.length) return null
  let best = Infinity
  const step = path.length > 1000 ? 10 : 1
  for (let i = 0; i < path.length; i += step) {
    const d = haversineMiles(pt, { lat: path[i]![0], lng: path[i]![1] })
    if (d < best) best = d
  }
  return best
}

/**
 * Проредить ломаную маршрута, не отрывая её от дороги (Дуглас–Пекер).
 *
 * OSRM отдаёт КАЖДУЮ точку геометрии: рейс через полстраны — это 17 000 точек и
 * ~600 КБ JSON. Такой кусок ехал в базу (одна строка settings), обратно из базы на
 * каждый рендер страницы и в HTML страницы каждому телефону — страница «Траки»
 * весила 650 КБ. При допуске в ~30 м ломаная визуально та же (на любом зуме, где
 * виден маршрут целиком), а точек в 10–20 раз меньше.
 *
 * Допуск — в милях, чтобы читалось предметно; внутри переводится в градусы грубо
 * (1° ≈ 69 миль), для отсева точек этого достаточно.
 */
export function simplifyPath(path: [number, number][], toleranceMi = 0.02): [number, number][] {
  if (path.length <= 2) return path
  const tol = toleranceMi / 69
  const keep = new Uint8Array(path.length)
  keep[0] = 1
  keep[path.length - 1] = 1
  const stack: [number, number][] = [[0, path.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = path[a]!
    const [bx, by] = path[b]!
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let worst = -1
    let worstD = tol
    for (let i = a + 1; i < b; i++) {
      const [px, py] = path[i]!
      let d: number
      if (len2 === 0) d = Math.hypot(px - ax, py - ay)
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      }
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  const out: [number, number][] = []
  for (let i = 0; i < path.length; i++) if (keep[i]) out.push(path[i]!)
  return out
}

/**
 * Кто с кем едет по одной дороге — и с каким сдвигом рисовать их пунктир.
 *
 * Два трака на одном шоссе рисуются одной линией поверх другой, и цвет нижнего
 * не увидеть вовсе. Поэтому пути, которые где-то накладываются, идут пунктиром со
 * сдвинутой фазой: штрих одного попадает в промежуток другого, и на общем участке
 * видно оба цвета сразу. Пути, которые ни с кем не совпадают, остаются сплошными —
 * пунктир у них означал бы совсем другое (прямая линия вместо дороги).
 *
 * Совпадение ищется не по геометрии, а по сетке ячеек примерно в милю: линия
 * проходит по ячейкам, и общие ячейки у двух траков значат общий участок. Сетка
 * грубая нарочно — встречные полосы одного шоссе должны попадать в одну ячейку.
 *
 * Ключ — трак (его colorIndex), а не отдельный отрезок: у одного трака путь часто
 * разбит на «до пикапа» и «от пикапа», и сам с собой он не пересекается.
 */
export const OVERLAP_CELL_DEG = 0.015

const cellOf = (lat: number, lng: number) =>
  `${Math.round(lat / OVERLAP_CELL_DEG)}:${Math.round(lng / OVERLAP_CELL_DEG)}`

/** Ячейки, через которые проходит ломаная. Длинные отрезки разбиваются по шагу
 * сетки: у прямой линии всего две точки, и без разбивки от неё осталось бы две
 * ячейки на всю страну. */
function pathCells(path: [number, number][]): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!
    out.add(cellOf(p[0], p[1]))
    const n = path[i + 1]
    if (!n) continue
    const steps = Math.ceil(Math.max(Math.abs(n[0] - p[0]), Math.abs(n[1] - p[1])) / OVERLAP_CELL_DEG)
    // Отрезок длиной в полстраны при шаге в милю — это тысячи ячеек; больше 2000
    // не считаем, точности это уже не добавляет, а время съедает.
    for (let s = 1; s < Math.min(steps, 2000); s++) {
      out.add(cellOf(p[0] + ((n[0] - p[0]) * s) / steps, p[1] + ((n[1] - p[1]) * s) / steps))
    }
  }
  return out
}

export type OverlapPhase = {
  /** Слот фазы пунктира внутри компании: 0, 1, 2… */
  slot: number
  /** Сколько траков в компании — столько промежутков между штрихами. */
  of: number
  /** Ячейки, которые этот трак делит с кем-то ещё: пунктиром рисуется только та
   * часть пути, что проходит по ним. */
  shared: Set<string>
}

/**
 * На входе — путь каждого трака (ключ → его ломаные). На выходе: для траков,
 * попавших в одну «компанию» по общей дороге, слот фазы, размер компании и общие
 * ячейки. Трак, ни с кем не совпавший, в ответе не появляется — он рисуется
 * сплошным целиком.
 *
 * `minShared` — сколько общих ячеек считать совпадением. Одна-две ячейки бывают
 * на обычном перекрёстке: пути пересеклись, но не идут вместе, и пунктир там был
 * бы шумом.
 */
export function overlapSlots(paths: Map<number, [number, number][][]>, minShared = 4): Map<number, OverlapPhase> {
  const keys = [...paths.keys()].sort((a, b) => a - b)
  const cells = new Map(keys.map((k) => [k, pathCells((paths.get(k) ?? []).flat())]))
  // Кто с кем делит дорогу. Список соседей, а не матрица: траков единицы.
  const near = new Map(keys.map((k) => [k, [] as number[]]))
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i]!
      const b = keys[j]!
      const [small, big] = [cells.get(a)!, cells.get(b)!].sort((x, y) => x.size - y.size) as [Set<string>, Set<string>]
      let shared = 0
      for (const c of small) if (big.has(c) && ++shared >= minShared) break
      if (shared >= minShared) {
        near.get(a)!.push(b)
        near.get(b)!.push(a)
      }
    }
  }
  // Компании связности: трак A едет с B, B с C — все трое делят фазу, иначе A и C
  // получили бы один слот и снова закрыли бы друг друга на своём общем куске.
  const out = new Map<number, OverlapPhase>()
  const seen = new Set<number>()
  for (const start of keys) {
    if (seen.has(start)) continue
    const group: number[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length) {
      const k = queue.shift()!
      group.push(k)
      for (const n of near.get(k) ?? []) if (!seen.has(n)) (seen.add(n), queue.push(n))
    }
    if (group.length < 2) continue
    group.sort((a, b) => a - b)
    group.forEach((k, slot) => {
      // Общие ячейки именно этого трака: там, где он один, путь останется сплошным.
      const mine = cells.get(k)!
      const shared = new Set<string>()
      for (const other of group) {
        if (other === k) continue
        const theirs = cells.get(other)!
        for (const c of mine) if (theirs.has(c)) shared.add(c)
      }
      out.set(k, { slot, of: group.length, shared })
    })
  }
  return out
}

/**
 * Режет путь на куски «идём вместе с кем-то» и «идём одни». Пунктир нужен только
 * на общем участке: если пунктиром сделать весь путь, то там, где трак свернул и
 * едет один, линия с дырами читается как «дороги не знаем» — а это в приложении
 * означает совсем другое (прямая вместо настоящего маршрута).
 *
 * Границу отдаём обоим кускам, иначе между сплошной и пунктиром остался бы разрыв.
 */
export function splitShared(
  path: [number, number][],
  shared: Set<string>,
): { coords: [number, number][]; shared: boolean }[] {
  if (path.length < 2 || shared.size === 0) return [{ coords: path, shared: false }]
  const flags = path.map((p) => shared.has(cellOf(p[0], p[1])))
  const out: { coords: [number, number][]; shared: boolean }[] = []
  let from = 0
  for (let i = 1; i <= flags.length; i++) {
    if (i < flags.length && flags[i] === flags[from]) continue
    // Точка перелома входит и в этот кусок, и в следующий — линия без разрыва.
    const coords = path.slice(from, Math.min(i + 1, path.length))
    if (coords.length > 1) out.push({ coords, shared: flags[from]! })
    from = i
  }
  return out.length ? out : [{ coords: path, shared: false }]
}
