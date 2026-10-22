// «Аналитика» (10/22/26): цифры для всех карточек раздела. Чистые функции без базы.
//
// Сервер один раз превращает грузы в короткие строки (toALoad: штаты, брокер, трак уже
// прочитаны), а считает всё уже браузер — buildAnalytics зовётся заново на каждое
// нажатие: период, трак, брокер, что показывать (владелец: «графики должны меняться
// по нажатию кнопок»). За каждой точкой лежит список id грузов — по нажатию раздел
// открывает именно эти грузы.
//
// Выручка — ставка груза (rate) по дате пикапа. Заявки (quoted) и отменённые не
// считаются: это не заработанные деньги. Будущие пикапы в выручку не идут.

import type { LoadRecord, LoadStatus, TruckRecord } from './map.ts'
import { stateFromPlace } from './dat-market-core.ts'
import { US_STATES } from './us-states.ts'
import { brokerKeyOf, prettyCompany } from './broker-key.ts'
import { shortName } from './fmt.ts'

/** Арифметика над днём yyyy-mm-dd без часовых поясов — одинаково на сервере и в браузере. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** «+12%» / «-4%»; пусто, когда сравнивать не с чем (прошлый период пустой). */
export function deltaPct(now: number, before: number): string {
  if (!before) return ''
  const p = Math.round(((now - before) / before) * 100)
  return `${p > 0 ? '+' : ''}${p}%`
}

/** Пять регионов страны — свои, для цвета плиток (не регионы ставок DAT). */
export const REGIONS = ['west', 'midwest', 'south', 'southeast', 'northeast'] as const
export type Region = (typeof REGIONS)[number] | 'other'
const REGION_OF: Record<string, Region> = {}
const put = (r: Region, states: string) => states.split(' ').forEach((s) => (REGION_OF[s] = r))
put('west', 'WA OR CA NV ID MT WY UT CO AZ NM AK HI')
put('midwest', 'ND SD NE KS MN IA MO WI IL IN MI OH')
put('south', 'TX OK AR LA')
put('southeast', 'MS AL GA FL TN KY SC NC VA WV')
put('northeast', 'PA NY NJ DE MD DC CT RI MA VT NH ME')
export const regionOfState = (state: string | null): Region => (state && REGION_OF[state]) || 'other'

const CODES = new Set([...US_STATES.map(([c]) => c), 'DC'])
const BY_NAME = US_STATES.map(([c, name]) => [c, new RegExp(`\\b${name}\\b`, 'i')] as const)

/** Штат из любого из мест по очереди: «Dallas, TX», «Las Vegas NV 89101», «Memphis,
 * Tennessee». Код проверяется по списку штатов — «US» из «…, TX, US» штатом не станет. */
export function stateOf(...places: (string | null | undefined)[]): string | null {
  for (const p of places) {
    if (!p) continue
    const code = stateFromPlace(p)
    if (code && CODES.has(code)) return code
    for (const m of p.toUpperCase().matchAll(/\b([A-Z]{2})\b/g)) if (CODES.has(m[1]!) && m[1] !== 'IN' && m[1] !== 'OR' && m[1] !== 'ME') return m[1]!
    const named = BY_NAME.find(([, re]) => re.test(p))
    if (named) return named[0]
  }
  return null
}

/** Груз в том виде, в каком он едет в браузер: всё, что нужно и для расчёта, и для списка. */
export type ALoad = {
  id: number
  status: LoadStatus
  rate: number
  loaded: number
  dh: number
  day: string | null
  del: string | null
  from: string | null
  to: string | null
  os: string | null
  ds: string | null
  broker: string | null
  bkey: string | null
  truckId: number | null
  truck: string | null
  invoiced: boolean
  paidDay: string | null
}

export type ATruck = { id: number; name: string }

export const truckLabel = (t: Pick<TruckRecord, 'name' | 'number' | 'driverName'>) =>
  [t.number ? `#${t.number}` : t.name, shortName(t.driverName)].filter(Boolean).join(' · ')

/** Сервер: груз → короткая строка. Заявки и отменённые сюда не попадают. */
export function toALoads(all: LoadRecord[], trucks: TruckRecord[], paidDayOf: (iso: string) => string): ALoad[] {
  const names = new Map(trucks.map((t) => [t.id, truckLabel(t)]))
  return all
    .filter((l) => l.status !== 'quoted' && l.status !== 'cancelled')
    .map((l) => {
      const pu = l.stops?.find((s) => s.role === 'pickup')
      const dl = l.stops ? [...l.stops].reverse().find((s) => s.role === 'delivery') : undefined
      return {
        id: l.id,
        status: l.status,
        rate: l.rate || 0,
        loaded: l.loadedMiles || 0,
        dh: l.deadheadMiles || 0,
        day: l.pickupDate,
        del: l.deliveryDate,
        from: l.origin,
        to: l.destination,
        os: stateOf(l.origin, l.pickupAddress, pu?.city, pu?.address),
        ds: stateOf(l.destination, l.deliveryAddress, dl?.city, dl?.address),
        broker: prettyCompany(l.brokerName?.trim() || null),
        bkey: brokerKeyOf({ mc: l.brokerMc, email: l.brokerEmail, name: l.brokerName }),
        truckId: l.truckId,
        truck: l.truckId != null ? (names.get(l.truckId) ?? null) : null,
        invoiced: !!l.invoicedAt,
        paidDay: l.paidAt ? paidDayOf(l.paidAt) : null,
      }
    })
}

/** Этап денег по грузу: где он сейчас между бронью и оплатой. */
export type Stage = 'booked' | 'in_transit' | 'delivered' | 'invoiced' | 'paid'
export const STAGES: Stage[] = ['booked', 'in_transit', 'delivered', 'invoiced', 'paid']
export function stageOf(l: Pick<ALoad, 'status' | 'invoiced' | 'paidDay'>): Stage {
  if (l.paidDay || l.status === 'paid') return 'paid'
  if (l.invoiced) return 'invoiced'
  if (l.status === 'delivered') return 'delivered'
  if (l.status === 'in_transit') return 'in_transit'
  return 'booked'
}

/** Что показывает главный график — те же шесть цифр-ключей, что кнопками сверху. */
export const METRICS = ['revenue', 'loads', 'miles', 'rpm', 'avg', 'deadhead'] as const
export type Metric = (typeof METRICS)[number]
/** Сумма отрезка → значение цифры: так же и для накопительного графика (суммы с начала). */
export type Totals = { revenue: number; loads: number; miles: number; dh: number }
export function metricValue(m: Metric, x: Totals): number {
  if (m === 'rpm') return rpmOf(x.revenue, x.miles)
  if (m === 'avg') return x.loads ? x.revenue / x.loads : 0
  if (m === 'deadhead') return x.miles > 0 ? (x.dh / x.miles) * 100 : 0
  return x[m]
}
/** Корзины $/mi для «Грузы по ставке»: нижняя граница каждой. */
export const RPM_BINS = [0, 1.5, 2, 2.5, 3, 3.5] as const
/** Периоды кнопками сверху раздела. */
export const PERIODS = [7, 30, 90, 365] as const

type Sum = { total: number; ids: number[] }
type Kpi = { now: number; before: number; delta: string; spark: number[] }
type Bucket = Totals & { from: string; to: string; ids: number[] }

export type Analytics = {
  days: number
  kpi: { revenue: Kpi; loads: Kpi; miles: Kpi; rpm: Kpi; deadhead: Kpi; avg: Kpi; ids: number[] }
  /** Главный график: по дням до 90 дней, по неделям за год. */
  series: Bucket[]
  week: { count: number; delta: string; pickups: number[][]; deliveries: number[][]; ids: number[][] }
  /** Плитки штатов — по тем же кнопкам периода, что и вся страница. */
  periods: { total: number; before: number; delta: string; ids: number[] }[]
  states: { name: string; group: Region; values: number[]; ids: number[][] }[]
  brokers: { name: string; key: string | null; total: number; ids: number[]; loads: number; rpm: number }[]
  trucks: { id: number; name: string; total: number; loads: number; miles: number; rpm: number; ids: number[] }[]
  lanes: { from: string; to: string; count: number; total: number; rpm: number; ids: number[] }[]
  /** Сколько грузов за период по корзинам $/mi (RPM_BINS); грузы без миль сюда не идут. */
  rpmDist: { count: number; total: number; ids: number[] }[]
  stages: Record<Stage, Sum>
  years: {
    year: string
    months: number[]
    monthIds: number[][]
    total: number
    count: number
    monthAvg: number
    totalDelta: string
    avgDelta: string
    trucks: { id: number; name: string; total: number; ids: number[] }[]
  }[]
}

const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0)
const milesOf = (l: ALoad) => l.loaded + l.dh
const rpmOf = (rate: number, miles: number) => (miles > 0 ? rate / miles : 0)
const revenueOf = (xs: ALoad[]) => sumBy(xs, (l) => l.rate)
const milesSum = (xs: ALoad[]) => sumBy(xs, milesOf)
const ids = (xs: ALoad[]) => xs.map((l) => l.id)

export function buildAnalytics(rows: ALoad[], trucks: ATruck[], today: string, days: number = 30): Analytics {
  const loads = rows.filter((l) => !!l.day && l.day <= today)
  const inWin = (from: string, to: string) => loads.filter((l) => l.day! >= from && l.day! <= to)
  const fromNow = addDays(today, -(days - 1))
  const now = inWin(fromNow, today)
  const prev = inWin(addDays(today, -(2 * days - 1)), addDays(today, -days))

  const bucketOf = (xs: ALoad[], from: string, to: string): Bucket => ({
    from,
    to,
    ids: ids(xs),
    revenue: revenueOf(xs),
    loads: xs.length,
    miles: milesSum(xs),
    dh: sumBy(xs, (l) => l.dh),
  })

  // Цифры-ключи: период против такого же перед ним; полоски — 12 отрезков до сегодня.
  const step = Math.max(7, Math.ceil(days / 12))
  const sparkWins = Array.from({ length: 12 }, (_, k) => {
    const to = addDays(today, -step * (11 - k))
    return inWin(addDays(to, -(step - 1)), to)
  })
  const metric = (f: (xs: ALoad[]) => number): Kpi => {
    const n = f(now)
    const b = f(prev)
    return { now: n, before: b, delta: deltaPct(n, b), spark: sparkWins.map(f) }
  }
  const kpi = {
    revenue: metric(revenueOf),
    loads: metric((xs) => xs.length),
    miles: metric(milesSum),
    rpm: metric((xs) => rpmOf(revenueOf(xs), milesSum(xs))),
    deadhead: metric((xs) => {
      const m = milesSum(xs)
      return m > 0 ? (sumBy(xs, (l) => l.dh) / m) * 100 : 0
    }),
    avg: metric((xs) => (xs.length ? revenueOf(xs) / xs.length : 0)),
    ids: ids(now),
  }

  // Главный график: до 90 дней — день за днём, год — неделями.
  const size = days > 90 ? 7 : 1
  const n = Math.ceil(days / size)
  const series = Array.from({ length: n }, (_, i) => {
    const to = addDays(today, -size * (n - 1 - i))
    const from = addDays(to, -(size - 1))
    return bucketOf(inWin(from, to), from, to)
  })

  // Пикапы вверх, доставки вниз по дням недели (пн–вс): период и два таких же до него.
  // Короче четырёх недель окно не бывает — за 7 дней на каждый день по одному грузу.
  const span = Math.max(28, days)
  const weekday = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7
  const windows = [0, 1, 2].map((k) => [addDays(today, -span * (k + 1) + 1), addDays(today, -span * k)] as const)
  const perDay = (field: 'day' | 'del') =>
    windows.map(([a, b]) => {
      const out = [0, 0, 0, 0, 0, 0, 0]
      for (const l of rows) {
        const d = l[field]
        if (d && d >= a && d <= b) out[weekday(d)]!++
      }
      return out
    })
  const pickups = perDay('day')
  const weekIds = Array.from({ length: 7 }, (_, i) => ids(inWin(windows[0]![0], windows[0]![1]).filter((l) => weekday(l.day!) === i)))

  // Плитки штатов по тем же периодам, что и кнопки сверху.
  const periodLoads = PERIODS.map((p) => inWin(addDays(today, -(p - 1)), today))
  const periods = PERIODS.map((p, i) => {
    const total = revenueOf(periodLoads[i]!)
    const before = revenueOf(inWin(addDays(today, -(2 * p - 1)), addDays(today, -p)))
    return { total, before, delta: deltaPct(total, before), ids: ids(periodLoads[i]!) }
  })
  const stateMap = new Map<string, ALoad[][]>()
  periodLoads.forEach((xs, i) => {
    for (const l of xs) {
      const k = l.os ?? '?'
      const v = stateMap.get(k) ?? PERIODS.map(() => [] as ALoad[])
      v[i]!.push(l)
      stateMap.set(k, v)
    }
  })
  const pi = Math.max(0, PERIODS.findIndex((p) => p === days))
  const stateRows = [...stateMap].sort((a, b) => revenueOf(b[1][pi]!) - revenueOf(a[1][pi]!) || revenueOf(b[1][3]!) - revenueOf(a[1][3]!))
  // Первые 15 штатов — своими плитками, остальное и груз без штата — одной «прочие».
  const named = stateRows.filter(([k]) => k !== '?')
  const restRows = [...named.slice(15), ...stateRows.filter(([k]) => k === '?')]
  const states = named.slice(0, 15).map(([name, v]) => ({ name, group: regionOfState(name), values: v.map(revenueOf), ids: v.map(ids) }))
  if (restRows.length) {
    const merged = PERIODS.map((_, i) => restRows.flatMap(([, v]) => v[i]!))
    states.push({ name: 'other', group: 'other', values: merged.map(revenueOf), ids: merged.map(ids) })
  }

  const groupNow = (key: (l: ALoad) => string | null) => {
    const map = new Map<string, ALoad[]>()
    for (const l of now) {
      const k = key(l)
      if (k) map.set(k, [...(map.get(k) ?? []), l])
    }
    return [...map]
  }

  const brokers = groupNow((l) => l.bkey)
    .map(([key, xs]) => ({ name: xs.find((l) => l.broker)?.broker ?? key, key, total: revenueOf(xs), ids: ids(xs), loads: xs.length, rpm: rpmOf(revenueOf(xs), milesSum(xs)) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  // Траки — все, даже без грузов за период: пустой трак тоже ответ.
  const truckRows = trucks
    .map((t) => {
      const xs = now.filter((l) => l.truckId === t.id)
      const total = revenueOf(xs)
      return { id: t.id, name: t.name, total, loads: xs.length, miles: milesSum(xs), rpm: rpmOf(total, milesSum(xs)), ids: ids(xs) }
    })
    .sort((a, b) => b.total - a.total)

  const lanes = groupNow((l) => (l.os && l.ds ? `${l.os}>${l.ds}` : null))
    .map(([k, xs]) => {
      const [from, to] = k.split('>') as [string, string]
      const total = revenueOf(xs)
      return { from, to, count: xs.length, total, rpm: rpmOf(total, milesSum(xs)), ids: ids(xs) }
    })
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 10)

  const rpmDist = RPM_BINS.map(() => ({ count: 0, total: 0, ids: [] as number[] }))
  for (const l of now) {
    const m = milesOf(l)
    if (m <= 0) continue
    const r = l.rate / m
    let k = 0
    while (k + 1 < RPM_BINS.length && r >= RPM_BINS[k + 1]!) k++
    const b = rpmDist[k]!
    b.count++
    b.total += l.rate
    b.ids.push(l.id)
  }

  // Деньги по этапам: всё неоплаченное — за всё время; оплаченное — за период по дню оплаты.
  const stages = Object.fromEntries(STAGES.map((s) => [s, { total: 0, ids: [] as number[] }])) as Record<Stage, Sum>
  for (const l of rows) {
    const s = stageOf(l)
    if (s === 'paid' && !(l.paidDay && l.paidDay >= fromNow)) continue
    stages[s].total += l.rate
    stages[s].ids.push(l.id)
  }

  // Сезонность: годы, где есть грузы, свежие первыми (не больше трёх).
  const yearList = [...new Set(loads.map((l) => l.day!.slice(0, 4)))].sort().reverse().slice(0, 3)
  const yearStats = (year: string) => {
    const monthLoads = Array.from({ length: 12 }, () => [] as ALoad[])
    for (const l of loads) if (l.day!.slice(0, 4) === year) monthLoads[Number(l.day!.slice(5, 7)) - 1]!.push(l)
    const months = monthLoads.map(revenueOf)
    const total = sumBy(months, (m) => m)
    // Среднее — по месяцам, в которых работали: пустой январь до первого груза не тянет вниз.
    const active = months.filter((m) => m > 0).length
    return { monthLoads, months, total, count: sumBy(monthLoads, (m) => m.length), monthAvg: active ? total / active : 0 }
  }
  const years = yearList.map((year) => {
    const s = yearStats(year)
    const p = yearStats(String(Number(year) - 1))
    const yearLoads = s.monthLoads.flat()
    const perTruck = trucks
      .map((t) => {
        const xs = yearLoads.filter((l) => l.truckId === t.id)
        return { id: t.id, name: t.name, total: revenueOf(xs), ids: ids(xs) }
      })
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
    return {
      year,
      months: s.months,
      monthIds: s.monthLoads.map(ids),
      total: s.total,
      count: s.count,
      monthAvg: s.monthAvg,
      totalDelta: deltaPct(s.total, p.total),
      avgDelta: deltaPct(s.monthAvg, p.monthAvg),
      trucks: perTruck,
    }
  })

  const wk = (k: number) => pickups[k]!.reduce((a, b) => a + b, 0)
  return {
    days,
    kpi,
    series,
    week: { count: wk(0), delta: deltaPct(wk(0), wk(1)), pickups, deliveries: perDay('del'), ids: weekIds },
    periods,
    states,
    brokers,
    trucks: truckRows,
    lanes,
    rpmDist,
    stages,
    years,
  }
}
