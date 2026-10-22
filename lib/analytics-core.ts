// «Аналитика» (10/22/26): цифры для четырёх карточек раздела — выручка за 30 дней,
// пикапы и доставки по дням недели, выручка по штатам пикапа, сезонность по месяцам.
// Чистые функции без базы: страница отдаёт сюда уже пришедшие грузы и сегодняшний
// день по ET, а клиентский компонент только рисует.
//
// Выручка — ставка груза (rate) по дате пикапа. Заявки (quoted) и отменённые не
// считаются: это не заработанные деньги. Груз без даты пикапа никуда не попадает.

import type { LoadRecord, TruckRecord } from './map.ts'
import { stateFromPlace } from './dat-market-core.ts'
import { shortName } from './fmt.ts'

/** Арифметика над днём yyyy-mm-dd без часовых поясов — одинаково на сервере и в браузере. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const counted = (l: LoadRecord) => l.status !== 'quoted' && l.status !== 'cancelled'

/** Сумма в окне [from, to] включительно и число грузов. */
function sumIn(loads: LoadRecord[], from: string, to: string) {
  let total = 0
  let count = 0
  for (const l of loads) {
    if (!l.pickupDate || l.pickupDate < from || l.pickupDate > to) continue
    total += l.rate || 0
    count++
  }
  return { total, count }
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

export type Analytics = {
  revenue: { total: number; delta: string; avg: number; series: { day: string; value: number }[] }
  week: { count: number; delta: string; pickups: number[][]; deliveries: number[][] }
  periods: { total: number; before: number; delta: string }[]
  states: { name: string; group: Region; values: number[] }[]
  brokers: { name: string; values: number[] }[]
  years: { year: string; months: number[]; total: number; count: number; monthAvg: number; totalDelta: string; avgDelta: string; trucks: { name: string; total: number }[] }[]
}

/** Окна для «7 дней / 30 дней / Год» — скользящие, до сегодня включительно. */
export const PERIOD_DAYS = [7, 30, 365] as const

export function buildAnalytics(all: LoadRecord[], trucks: TruckRecord[], today: string): Analytics {
  const loads = all.filter((l) => counted(l) && !!l.pickupDate)

  // A: 30 дней накопительно — линия растёт день за днём, а не скачет между нулями.
  const from30 = addDays(today, -29)
  const now30 = sumIn(loads, from30, today)
  const prev30 = sumIn(loads, addDays(today, -59), addDays(today, -30))
  const byDay = new Map<string, number>()
  for (const l of loads) byDay.set(l.pickupDate!, (byDay.get(l.pickupDate!) ?? 0) + (l.rate || 0))
  let run = 0
  const series = Array.from({ length: 30 }, (_, i) => {
    const day = addDays(from30, i)
    run += byDay.get(day) ?? 0
    return { day, value: run }
  })

  // B: пикапы вверх, доставки вниз по дням недели (пн–вс): последние 4 недели и две
  // прежние четырёхнедельки бледнее.
  const weekday = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7
  const windows = [0, 1, 2].map((k) => [addDays(today, -28 * (k + 1) + 1), addDays(today, -28 * k)] as const)
  const perDay = (field: 'pickupDate' | 'deliveryDate') =>
    windows.map(([a, b]) => {
      const out = [0, 0, 0, 0, 0, 0, 0]
      for (const l of loads) {
        const d = l[field]
        if (d && d >= a && d <= b) out[weekday(d)]!++
      }
      return out
    })
  const pickups = perDay('pickupDate')
  const nowCount = pickups[0]!.reduce((a, b) => a + b, 0)
  const prevCount = pickups[1]!.reduce((a, b) => a + b, 0)

  // C: окна 7/30/365 дней и такое же окно перед ними.
  const periods = PERIOD_DAYS.map((n) => {
    const now = sumIn(loads, addDays(today, -(n - 1)), today).total
    const before = sumIn(loads, addDays(today, -(2 * n - 1)), addDays(today, -n)).total
    return { total: now, before, delta: deltaPct(now, before) }
  })
  const inPeriods = (key: (l: LoadRecord) => string | null) => {
    const map = new Map<string, number[]>()
    for (const l of loads) {
      const k = key(l)
      if (!k) continue
      const v = map.get(k) ?? [0, 0, 0]
      PERIOD_DAYS.forEach((n, i) => {
        if (l.pickupDate! >= addDays(today, -(n - 1)) && l.pickupDate! <= today) v[i]! += l.rate || 0
      })
      map.set(k, v)
    }
    return [...map].filter(([, v]) => v.some((x) => x > 0)).sort((a, b) => b[1][2]! - a[1][2]!)
  }
  // Штатов бывает под сорок — мелочь сверх 14 идёт одной плиткой «прочие».
  const stateRows = inPeriods((l) => stateFromPlace(l.origin) ?? 'other')
  const states = stateRows.slice(0, 14).map(([name, values]) => ({ name, group: regionOfState(name), values }))
  if (stateRows.length > 14) {
    const rest = [0, 0, 0]
    for (const [, v] of stateRows.slice(14)) v.forEach((x, i) => (rest[i]! += x))
    states.push({ name: 'other', group: 'other', values: rest })
  }
  const brokers = inPeriods((l) => l.brokerName?.trim() || null)
    .slice(0, 3)
    .map(([name, values]) => ({ name, values }))

  // D: годы, где есть грузы, свежие первыми (не больше трёх).
  const truckName = new Map(trucks.map((t) => [t.id, [t.number ? `#${t.number}` : t.name, shortName(t.driverName)].filter(Boolean).join(' · ')]))
  const yearList = [...new Set(loads.map((l) => l.pickupDate!.slice(0, 4)))].sort().reverse().slice(0, 3)
  const yearStats = (year: string) => {
    const months = Array(12).fill(0) as number[]
    const perTruck = new Map<string, number>()
    let count = 0
    for (const l of loads) {
      if (l.pickupDate!.slice(0, 4) !== year || l.pickupDate! > today) continue
      months[Number(l.pickupDate!.slice(5, 7)) - 1]! += l.rate || 0
      count++
      const name = (l.truckId != null && truckName.get(l.truckId)) || null
      if (name) perTruck.set(name, (perTruck.get(name) ?? 0) + (l.rate || 0))
    }
    const total = months.reduce((a, b) => a + b, 0)
    // Среднее — по месяцам, в которых работали: пустой январь до первого груза не тянет вниз.
    const active = months.filter((m) => m > 0).length
    return { months, total, count, monthAvg: active ? total / active : 0, perTruck }
  }
  const years = yearList.map((year) => {
    const s = yearStats(year)
    const prev = yearStats(String(Number(year) - 1))
    return {
      year,
      months: s.months,
      total: s.total,
      count: s.count,
      monthAvg: s.monthAvg,
      totalDelta: deltaPct(s.total, prev.total),
      avgDelta: deltaPct(s.monthAvg, prev.monthAvg),
      trucks: [...s.perTruck].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, total]) => ({ name, total })),
    }
  })

  return {
    revenue: { total: now30.total, delta: deltaPct(now30.total, prev30.total), avg: now30.count ? now30.total / now30.count : 0, series },
    week: { count: nowCount, delta: deltaPct(nowCount, prevCount), pickups, deliveries: perDay('deliveryDate') },
    periods,
    states,
    brokers,
    years,
  }
}
