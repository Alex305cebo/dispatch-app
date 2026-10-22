// «Аналитика» (10/22/26): цифры для всех карточек раздела. Чистые функции без базы:
// страница отдаёт сюда уже пришедшие грузы и сегодняшний день по ET, а клиент только
// рисует. За каждой точкой графика лежит список id грузов — по нажатию раздел
// открывает именно эти грузы (владелец 10/22/26: «всё должно нажиматься»).
//
// Выручка — ставка груза (rate) по дате пикапа. Заявки (quoted) и отменённые не
// считаются: это не заработанные деньги. Груз без даты пикапа в графики не попадает.

import type { LoadRecord, TruckRecord } from './map.ts'
import { stateFromPlace } from './dat-market-core.ts'
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

/** Груз в том виде, в каком он едет в браузер: строка списка по нажатию на график. */
export type ARow = {
  id: number
  day: string | null
  del: string | null
  from: string | null
  to: string | null
  broker: string | null
  rate: number
  miles: number
  truck: string | null
  status: LoadRecord['status']
}

/** Этап денег по грузу: где он сейчас между бронью и оплатой. */
export type Stage = 'booked' | 'in_transit' | 'delivered' | 'invoiced' | 'paid'
export const STAGES: Stage[] = ['booked', 'in_transit', 'delivered', 'invoiced', 'paid']
export function stageOf(l: Pick<LoadRecord, 'status' | 'invoicedAt' | 'paidAt'>): Stage {
  if (l.paidAt || l.status === 'paid') return 'paid'
  if (l.invoicedAt) return 'invoiced'
  if (l.status === 'delivered') return 'delivered'
  if (l.status === 'in_transit') return 'in_transit'
  return 'booked'
}

type Sum = { total: number; ids: number[] }
type Kpi = { now: number; before: number; delta: string; weeks: number[] }

export type Analytics = {
  rows: ARow[]
  kpi: { revenue: Kpi; loads: Kpi; miles: Kpi; rpm: Kpi; deadhead: Kpi; avg: Kpi; ids30: number[] }
  revenue: { total: number; delta: string; series: { day: string; value: number; ids: number[] }[] }
  week: { count: number; delta: string; pickups: number[][]; deliveries: number[][]; ids: number[][] }
  periods: { total: number; before: number; delta: string; ids: number[] }[]
  states: { name: string; group: Region; values: number[]; ids: number[][] }[]
  brokers: { name: string; key: string | null; values: number[]; ids: number[][]; loads: number; rpm: number }[]
  trucks: { id: number; name: string; total: number; loads: number; miles: number; rpm: number; ids: number[] }[]
  lanes: { from: string; to: string; count: number; total: number; rpm: number; ids: number[] }[]
  rpmWeeks: { from: string; rpm: number; miles: number; ids: number[] }[]
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

/** Окна для «7 дней / 30 дней / Год» — скользящие, до сегодня включительно. */
export const PERIOD_DAYS = [7, 30, 365] as const
/** Сколько недель в мини-графиках цифр и в линии $/mi. */
export const WEEKS = 12

const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0)
const milesOf = (l: LoadRecord) => (l.loadedMiles || 0) + (l.deadheadMiles || 0)
const rpmOf = (rate: number, miles: number) => (miles > 0 ? rate / miles : 0)
const originState = (l: LoadRecord) => stateFromPlace(l.origin) ?? stateFromPlace(l.pickupAddress)
const destState = (l: LoadRecord) => stateFromPlace(l.destination) ?? stateFromPlace(l.deliveryAddress)

export function buildAnalytics(all: LoadRecord[], trucks: TruckRecord[], today: string): Analytics {
  const counted = all.filter((l) => l.status !== 'quoted' && l.status !== 'cancelled')
  // Будущие пикапы в выручку не идут: денег за них ещё нет.
  const loads = counted.filter((l) => !!l.pickupDate && l.pickupDate <= today)
  const inWin = (from: string, to: string) => loads.filter((l) => l.pickupDate! >= from && l.pickupDate! <= to)
  const ids = (xs: LoadRecord[]) => xs.map((l) => l.id)
  const truckName = new Map(trucks.map((t) => [t.id, [t.number ? `#${t.number}` : t.name, shortName(t.driverName)].filter(Boolean).join(' · ')]))

  // Цифры-ключи: 30 дней против 30 дней перед ними, и мини-график по неделям.
  const now30 = inWin(addDays(today, -29), today)
  const prev30 = inWin(addDays(today, -59), addDays(today, -30))
  const weekWins = Array.from({ length: WEEKS }, (_, k) => {
    const to = addDays(today, -7 * (WEEKS - 1 - k))
    return { from: addDays(to, -6), to, loads: inWin(addDays(to, -6), to) }
  })
  const metric = (f: (xs: LoadRecord[]) => number): Kpi => {
    const now = f(now30)
    const before = f(prev30)
    return { now, before, delta: deltaPct(now, before), weeks: weekWins.map((w) => f(w.loads)) }
  }
  const revenueOf = (xs: LoadRecord[]) => sumBy(xs, (l) => l.rate || 0)
  const milesSum = (xs: LoadRecord[]) => sumBy(xs, milesOf)
  const kpi = {
    revenue: metric(revenueOf),
    loads: metric((xs) => xs.length),
    miles: metric(milesSum),
    rpm: metric((xs) => rpmOf(revenueOf(xs), milesSum(xs))),
    deadhead: metric((xs) => {
      const m = milesSum(xs)
      return m > 0 ? (sumBy(xs, (l) => l.deadheadMiles || 0) / m) * 100 : 0
    }),
    avg: metric((xs) => (xs.length ? revenueOf(xs) / xs.length : 0)),
    ids30: ids(now30),
  }

  // A: 30 дней накопительно — линия растёт день за днём, а не скачет между нулями.
  const from30 = addDays(today, -29)
  let run = 0
  const series = Array.from({ length: 30 }, (_, i) => {
    const day = addDays(from30, i)
    const that = loads.filter((l) => l.pickupDate === day)
    run += revenueOf(that)
    return { day, value: run, ids: ids(that) }
  })

  // B: пикапы вверх, доставки вниз по дням недели (пн–вс): последние 4 недели и две
  // прежние четырёхнедельки бледнее.
  const weekday = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7
  const windows = [0, 1, 2].map((k) => [addDays(today, -28 * (k + 1) + 1), addDays(today, -28 * k)] as const)
  const perDay = (field: 'pickupDate' | 'deliveryDate') =>
    windows.map(([a, b]) => {
      const out = [0, 0, 0, 0, 0, 0, 0]
      for (const l of counted) {
        const d = l[field]
        if (d && d >= a && d <= b) out[weekday(d)]!++
      }
      return out
    })
  const pickups = perDay('pickupDate')
  const weekIds = Array.from({ length: 7 }, (_, i) =>
    ids(inWin(windows[0]![0], windows[0]![1]).filter((l) => weekday(l.pickupDate!) === i)),
  )

  // C: окна 7/30/365 дней и такое же окно перед ними.
  const periodLoads = PERIOD_DAYS.map((n) => inWin(addDays(today, -(n - 1)), today))
  const periods = PERIOD_DAYS.map((n, i) => {
    const now = revenueOf(periodLoads[i]!)
    const before = revenueOf(inWin(addDays(today, -(2 * n - 1)), addDays(today, -n)))
    return { total: now, before, delta: deltaPct(now, before), ids: ids(periodLoads[i]!) }
  })
  const groupBy = (key: (l: LoadRecord) => string | null) => {
    const map = new Map<string, LoadRecord[][]>()
    periodLoads.forEach((xs, i) => {
      for (const l of xs) {
        const k = key(l)
        if (!k) continue
        const v = map.get(k) ?? [[], [], []]
        v[i]!.push(l)
        map.set(k, v)
      }
    })
    return [...map].sort((a, b) => revenueOf(b[1][2]!) - revenueOf(a[1][2]!))
  }
  // Штатов бывает под сорок; первые 15 — своими плитками, остальное одной «прочие».
  // Груз, у которого штат не прочитать, тоже уходит в «прочие».
  const stateRows = groupBy((l) => originState(l) ?? '?')
  const named = stateRows.filter(([k]) => k !== '?')
  const restRows = [...named.slice(15), ...stateRows.filter(([k]) => k === '?')]
  const states = named.slice(0, 15).map(([name, v]) => ({ name, group: regionOfState(name), values: v.map(revenueOf), ids: v.map(ids) }))
  if (restRows.length) {
    const merged = [0, 1, 2].map((i) => restRows.flatMap(([, v]) => v[i]!))
    states.push({ name: 'other', group: 'other', values: merged.map(revenueOf), ids: merged.map(ids) })
  }

  // Брокеры — по ключу справочника (MC, домен почты, название): ссылка ведёт в карточку.
  const brokerName = new Map<string, string>()
  const brokers = groupBy((l) => {
    const k = brokerKeyOf({ mc: l.brokerMc, email: l.brokerEmail, name: l.brokerName })
    if (k && !brokerName.has(k)) brokerName.set(k, prettyCompany(l.brokerName?.trim() || null) ?? k)
    return k
  })
    .slice(0, 8)
    .map(([key, v]) => ({
      name: brokerName.get(key) ?? key,
      key,
      values: v.map(revenueOf),
      ids: v.map(ids),
      loads: v[2]!.length,
      rpm: rpmOf(revenueOf(v[2]!), milesSum(v[2]!)),
    }))

  // Траки за 30 дней — все, даже без грузов: пустой трак тоже ответ.
  const truckRows = trucks
    .map((t) => {
      const xs = now30.filter((l) => l.truckId === t.id)
      const total = revenueOf(xs)
      return { id: t.id, name: truckName.get(t.id) ?? t.name, total, loads: xs.length, miles: milesSum(xs), rpm: rpmOf(total, milesSum(xs)), ids: ids(xs) }
    })
    .sort((a, b) => b.total - a.total)

  // Маршруты за год: штат пикапа → штат доставки.
  const laneMap = new Map<string, LoadRecord[]>()
  for (const l of periodLoads[2]!) {
    const a = originState(l)
    const b = destState(l)
    if (!a || !b) continue
    laneMap.set(`${a}>${b}`, [...(laneMap.get(`${a}>${b}`) ?? []), l])
  }
  const lanes = [...laneMap]
    .map(([k, xs]) => {
      const [from, to] = k.split('>') as [string, string]
      const total = revenueOf(xs)
      return { from, to, count: xs.length, total, rpm: rpmOf(total, milesSum(xs)), ids: ids(xs) }
    })
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 10)

  const rpmWeeks = weekWins.map((w) => ({ from: w.from, rpm: rpmOf(revenueOf(w.loads), milesSum(w.loads)), miles: milesSum(w.loads), ids: ids(w.loads) }))

  // Деньги по этапам: всё, что ещё не оплачено, — за всё время; оплаченное — за 30 дней
  // по дню оплаты, иначе «Оплачено» росло бы бесконечно.
  const stages = Object.fromEntries(STAGES.map((s) => [s, { total: 0, ids: [] as number[] }])) as Record<Stage, Sum>
  for (const l of counted) {
    const s = stageOf(l)
    if (s === 'paid' && !(l.paidAt && l.paidAt.slice(0, 10) >= addDays(today, -29))) continue
    stages[s].total += l.rate || 0
    stages[s].ids.push(l.id)
  }

  // D: годы, где есть грузы, свежие первыми (не больше трёх).
  const yearList = [...new Set(loads.map((l) => l.pickupDate!.slice(0, 4)))].sort().reverse().slice(0, 3)
  const yearStats = (year: string) => {
    const monthLoads = Array.from({ length: 12 }, () => [] as LoadRecord[])
    for (const l of loads) if (l.pickupDate!.slice(0, 4) === year) monthLoads[Number(l.pickupDate!.slice(5, 7)) - 1]!.push(l)
    const months = monthLoads.map(revenueOf)
    const total = sumBy(months, (m) => m)
    // Среднее — по месяцам, в которых работали: пустой январь до первого груза не тянет вниз.
    const active = months.filter((m) => m > 0).length
    return { monthLoads, months, total, count: sumBy(monthLoads, (m) => m.length), monthAvg: active ? total / active : 0 }
  }
  const years = yearList.map((year) => {
    const s = yearStats(year)
    const prev = yearStats(String(Number(year) - 1))
    const yearLoads = s.monthLoads.flat()
    const perTruck = trucks
      .map((t) => {
        const xs = yearLoads.filter((l) => l.truckId === t.id)
        return { id: t.id, name: truckName.get(t.id) ?? t.name, total: revenueOf(xs), ids: ids(xs) }
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
      totalDelta: deltaPct(s.total, prev.total),
      avgDelta: deltaPct(s.monthAvg, prev.monthAvg),
      trucks: perTruck,
    }
  })

  const rows: ARow[] = counted.map((l) => ({
      id: l.id,
      day: l.pickupDate,
      del: l.deliveryDate,
      from: l.origin,
      to: l.destination,
      broker: prettyCompany(l.brokerName?.trim() || null),
      rate: l.rate || 0,
      miles: milesOf(l),
      truck: l.truckId != null ? (truckName.get(l.truckId) ?? null) : null,
      status: l.status,
  }))

  return {
    rows,
    kpi,
    revenue: { total: kpi.revenue.now, delta: kpi.revenue.delta, series },
    week: { count: pickups[0]!.reduce((a, b) => a + b, 0), delta: deltaPct(pickups[0]!.reduce((a, b) => a + b, 0), pickups[1]!.reduce((a, b) => a + b, 0)), pickups, deliveries: perDay('deliveryDate'), ids: weekIds },
    periods,
    states,
    brokers,
    trucks: truckRows,
    lanes,
    rpmWeeks,
    stages,
    years,
  }
}
