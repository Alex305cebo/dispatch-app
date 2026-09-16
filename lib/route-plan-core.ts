// «Куда отправить трак» — Route Planner сайта dispatch4you (route-planner/score.js),
// перенесённый в TMS. Отвечает не на «какой груз дороже за милю», а на «куда отправить
// трак, чтобы за неделю вышло больше»: груз оценивается вместе с тем, где он оставит трак.
// $3.20/mi в штат, где трак потом стоит двое суток, проигрывает $2.60/mi туда, где
// следующий груз находится сразу.
//
// Цикл = этот груз + простой в штате доставки + половина следующего плеча оттуда.
// Простой — от того, сколько грузов приходится на трак в штате доставки (DAT, против
// медианы серии, как горячесть в «Кому искать груз»), ставка следующего плеча — ставка
// DAT по региону доставки. Расходы — не «$1.05 прочих за милю», как на сайте, а
// настоящие расходы трака (calcLoad): его MPG и цена топлива, зарплата водителя,
// платёж, страховка, ELD, факторинг и диспетч.
//
// Без сети и базы — всё проверяется тестом (route-plan-core.test.ts).

import { calcLoad, type Breakdown, type TruckSettings } from './profit.ts'
import { US_STATES } from './us-states.ts'
import { ltHeat, ltMedian, ltOf, regionOf, type DatHeat, type DatSnapshot } from './dat-market-core.ts'

/** Вес следующего плеча: его ставка и простой — оценка по рынку, а не рейт-кон. */
export const NEXT_WEIGHT = 0.5
/** Типовое следующее плечо из штата доставки, мили. */
export const NEXT_LEG_MILES = 600
/** Погрузка и выгрузка, дни. */
export const DWELL_DAYS = 0.5
/** Короче этого — не направление, а перестановка внутри соседних штатов. */
export const MIN_LANE_MILES = 150

export type PlanOptions = {
  settings: TruckSettings
  /** Сколько миль трак в среднем проходит за сутки — с остановками и отдыхом. */
  milesPerDay: number
  /** Порожний до погрузки, мили. */
  deadhead: number
  /** Стоп-лист водителя: в эти штаты направления не предлагаются (профиль в паспорте трака). */
  avoid?: string[]
  /** Домашний штат водителя: направление к дому помечается; с preferHome — встаёт первым. */
  homeState?: string | null
  /** Водителю скоро домой (отпуск в ближайшие дни) — домашнее направление наверх. */
  preferHome?: boolean
}

/** Откуда считаем: штат и, если известна, точная точка трака (GPS). */
export type PlanOrigin = { state: string; ll?: readonly [number, number] | null }

export type Lane = {
  state: string
  name: string
  miles: number
  deadhead: number
  /** Ставка этого груза: у направления — мили × ставка DAT региона погрузки. */
  rate: number
  rpm: number
  /** Грузов на трак в штате доставки и горячесть от медианы серии. */
  ratio: number | null
  heat: DatHeat | null
  median: number
  /** Ожидаемый простой в штате доставки, дни, и во что он обойдётся (постоянные расходы). */
  wait: number
  idleCost: number
  /** В пути с погрузкой и выгрузкой, дни. */
  driveDays: number
  /** Ставка DAT по региону доставки — чем платит следующее плечо. */
  nextRpm: number | null
  nextDays: number
  /** Этот груз и следующее плечо в деньгах трака. */
  load: Breakdown
  next: Breakdown | null
  cycleDays: number
  /** Чистыми за цикл: груз + половина следующего плеча − простой. */
  net: number
  netPerDay: number
  /** Выручка в день за цикл — главная цифра диспетчера. */
  grossPerDay: number
  /** Направление в домашний штат водителя. */
  home: boolean
}

const POINT = new Map(US_STATES.map(([code, name, lat, lng]) => [code, { name, ll: [lat, lng] as const }]))

export const stateName = (code: string) => POINT.get(code)?.name ?? code

/**
 * Мили по дорогам между двумя точками.
 * ponytail: по прямой × 1.17 — ошибка 3–8%, как на сайте. Маршрутизатор (lib/geo-routing)
 * подключать, когда полсотни миль в ту или другую сторону начнут менять выбор направления.
 */
export function roadMiles(a: readonly [number, number], b: readonly [number, number]): number {
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLng = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 3958.8 * Math.asin(Math.sqrt(h)) * 1.17
}

/**
 * Ожидаемый простой в штате доставки. На медиане серии — день; вдвое горячее — на полдня
 * меньше, вдвое холоднее — на полдня больше; не меньше 0.3 и не больше 3 дней. От медианы,
 * а не от цифры: у Van обычно 3–18 грузов на трак, у Flatbed 5–150.
 */
export function waitDays(ratio: number, median: number): number {
  if (!(median > 0)) return 1
  return Math.min(3, Math.max(0.3, 1 - 0.75 * Math.log(Math.max(ratio, 0.01) / median)))
}

/**
 * Один вариант: груз из штата `origin` в штат `dest`. Без `board` — типовой груз по рынку
 * (мили между штатами × ставка DAT региона погрузки); с `board` — конкретный груз с доски
 * со своими милями и ставкой. null — считать не из чего: нет точки штата, нет ставки DAT
 * региона погрузки или у трака поломаны настройки (calcLoad отказывается считать).
 */
export function scoreLane(
  snap: DatSnapshot,
  origin: PlanOrigin,
  dest: string,
  opts: PlanOptions,
  board?: { miles: number; rate: number; deadhead?: number },
): Lane | null {
  const to = POINT.get(dest)
  if (!to || !(opts.milesPerDay > 0)) return null
  const deadhead = Math.max(0, board?.deadhead ?? opts.deadhead)
  let miles: number
  let rate: number
  if (board) {
    miles = board.miles
    rate = board.rate
  } else {
    const from = POINT.get(origin.state)
    const originRpm = regionOf(snap, origin.state)?.rpm
    if (!from || !originRpm) return null
    miles = Math.round(roadMiles(origin.ll ?? from.ll, to.ll))
    rate = Math.round(miles * originRpm)
  }
  if (!(miles > 0) || !(rate >= 0)) return null

  const lt = ltOf(snap, dest)
  const median = ltMedian(snap)
  const wait = lt ? waitDays(lt.ratio, median) : 1
  const driveDays = (miles + deadhead) / opts.milesPerDay + DWELL_DAYS
  const nextRpm = regionOf(snap, dest)?.rpm ?? null
  const nextDays = NEXT_LEG_MILES / opts.milesPerDay
  let load: Breakdown
  let next: Breakdown | null
  try {
    load = calcLoad({ rate, loadedMiles: miles, deadheadMiles: deadhead, transitDays: driveDays }, opts.settings)
    next = nextRpm
      ? calcLoad({ rate: NEXT_LEG_MILES * nextRpm, loadedMiles: NEXT_LEG_MILES, deadheadMiles: 0, transitDays: nextDays }, opts.settings)
      : null
  } catch {
    return null
  }
  // Платёж, страховка и ELD идут и пока трак стоит — calcLoad берёт их только за дни в пути.
  const s = opts.settings
  const idleCost = wait * (s.truckPaymentPerDay + s.insurancePerDay + s.eldPermitsPerDay)
  const cycleDays = driveDays + wait + NEXT_WEIGHT * nextDays
  const net = load.net + NEXT_WEIGHT * (next?.net ?? 0) - idleCost
  return {
    state: dest,
    name: to.name,
    miles,
    deadhead,
    rate,
    rpm: rate / miles,
    ratio: lt?.ratio ?? null,
    heat: lt ? ltHeat(snap, lt.ratio) : null,
    median,
    wait,
    idleCost,
    driveDays,
    nextRpm,
    nextDays,
    load,
    next,
    cycleDays,
    net,
    netPerDay: net / cycleDays,
    grossPerDay: (rate + NEXT_WEIGHT * (next?.gross ?? 0)) / cycleDays,
    home: dest === opts.homeState,
  }
}

/** Настоящая средняя ставка по штату доставки, $/mi (lib/rpm-bench-core.ts benchmarkRpm),
 * null — данных нет. Считать или оценивать её нельзя (правило пользователя 16.09.2026). */
export type RpmOf = (state: string) => number | null

/** Все направления из штата: без самого штата, ближе MIN_LANE_MILES и без региона DAT
 * (Аляска, Гавайи). Сверху — со ставкой по штату, дороже выше; без ставки — ниже, по
 * выручке в день за цикл. */
export function rankLanes(snap: DatSnapshot, origin: PlanOrigin, opts: PlanOptions, rpmOf: RpmOf = () => null): Lane[] {
  const out: Lane[] = []
  for (const [code] of US_STATES) {
    if (code === origin.state || !regionOf(snap, code) || opts.avoid?.includes(code)) continue
    const lane = scoreLane(snap, origin, code, opts)
    if (lane && lane.miles >= MIN_LANE_MILES) out.push(lane)
  }
  // Нет ставки — 0: ставки положительные, такие уходят под все направления со ставкой.
  // ponytail: один груз в штат весит как сотня — порог по числу грузов, если выбросы полезут наверх.
  const rpm = (l: Lane) => rpmOf(l.state) ?? 0
  out.sort((a, b) => rpm(b) - rpm(a) || b.grossPerDay - a.grossPerDay)
  // Скоро домой — домашнее направление первым, даже если по деньгам оно не лучшее:
  // водитель всё равно туда поедет, вопрос только — с грузом или порожним.
  if (opts.preferHome) out.sort((a, b) => Number(b.home) - Number(a.home))
  return out
}

/**
 * «Лучше всего» и «хуже всего».
 *
 * Есть настоящие ставки по штатам — по ним: лучший — самая высокая, худший — самая низкая
 * (когда штатов со ставкой хотя бы два).
 *
 * Без ставок лучший — по выручке в день за цикл среди дальних (длиннее дневного пробега).
 *
 * Худший без ставок — НЕ последний по выручке в день: эта цифра топит любой рейс короче (погрузка,
 * выгрузка и простой — фиксированная добавка к каждому), и «худшим штатом» выходил сосед
 * (из SC — North Carolina, из TN — снова она). Худший для диспетчера — штат, где трак
 * застрянет: дольше всего ждать следующий груз (самый холодный рынок), при равенстве —
 * слабее ставка на выезд. От длины рейса это не зависит.
 */
export function bestWorst(lanes: Lane[], milesPerDay: number, rpmOf: RpmOf = () => null): { best: Lane | null; worst: Lane | null } {
  const rpm = (l: Lane) => rpmOf(l.state) ?? 0
  const rated = lanes.filter((l) => rpm(l) > 0).sort((a, b) => rpm(b) - rpm(a))
  const long = lanes.filter((l) => l.miles + l.deadhead > milesPerDay)
  const best = rated[0] ?? (long.length ? long : lanes)[0] ?? null
  if (rated.length > 1) return { best, worst: rated[rated.length - 1]! }
  const rest = lanes.filter((l) => l !== best)
  const worst = rest.length
    ? rest.reduce((w, l) => (l.wait > w.wait || (l.wait === w.wait && (l.nextRpm ?? 0) < (w.nextRpm ?? 0)) ? l : w))
    : null
  return { best, worst }
}

/** Выручка в день против цели: в цели, рядом (от 85%) или ниже. */
export function dayTone(grossPerDay: number, target: number): 'hit' | 'near' | 'miss' {
  return grossPerDay >= target ? 'hit' : grossPerDay >= target * 0.85 ? 'near' : 'miss'
}

/** Груз с доски: штат доставки, мили, ставка (null — «?», на доске её нет) и, если была,
 * подпись после чисел — откуда, куда, брокер. */
export type BoardLoad = { state: string; miles: number; rate: number | null; deadhead?: number; label?: string }

/**
 * Грузы с доски строками «ШТАТ МИЛИ СТАВКА [ПОРОЖНИЙ] [· ПОДПИСЬ]»: «TX 980 2450 60»,
 * «ga 640 $1,700», «NV 139 ? 102 · W Sacramento, CA → Sparks, NV · TQL». Штат — доставки;
 * «?» вместо ставки — на доске её нет; всё после чисел — подпись (так строки пишет разбор
 * скриншота, lib/board-shot.ts). Нечитаемые строки пропускаются молча: это поле для заметок.
 */
export function parseBoardLoads(text: string): BoardLoad[] {
  const num = (v: string | undefined) => Number((v ?? '').replace(/[$,]/g, ''))
  const out: BoardLoad[] = []
  for (const line of text.split('\n')) {
    const [code, milesRaw, rateRaw, ...rest] = line.trim().split(/\s+/)
    const state = (code ?? '').toUpperCase()
    const miles = num(milesRaw)
    const rate = rateRaw === '?' ? null : num(rateRaw)
    if (!POINT.has(state) || !(miles > 0) || (rate !== null && !(rate > 0))) continue
    const load: BoardLoad = { state, miles, rate }
    const deadhead = num(rest[0])
    if (rest.length && deadhead >= 0) {
      load.deadhead = deadhead
      rest.shift()
    }
    const label = rest.join(' ').replace(/^·\s*/, '')
    if (label) load.label = label
    out.push(load)
  }
  return out
}
