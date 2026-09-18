// Сколько от цены грузоотправителя доходит до трака — и во сколько диспетчеру торговаться.
//
// Ставка Warp (lib/rpm-bench-core.ts, источник warpLane) — это цена, которую платит
// ГРУЗООТПРАВИТЕЛЬ: в ней сидит маржа брокера. Диспетчеру нужна другая цифра — за сколько
// брокер отдаст груз траку.
//
// Долю считаем не на глазок, а по своим доставленным грузам: ставка рейт-кона против цены
// Warp по тому же маршруту, медиана. На 17.09.2026 вышло 0.83 (18 сравнений) — брокер
// оставлял себе 17%. Верхняя граница вилки — 0.90: ниже 10% валовой маржи сетевые брокеры
// почти не работают (RXO 10.7% во II кв. 2026, брокерский сегмент J.B. Hunt 12.5%).
//
// Наши рейт-коны тут не рынок, а только измерение маржи: рыночная цифра — чужая (Warp),
// и подпись «цена грузоотправителя · цель торга» это показывает.

import { normName } from './broker-match.ts'

/** Доля трака: медиана «наша ставка / цена грузоотправителя» и сколько грузов её дали;
 * byBroker — то же по брокерам, у которых сравнений хватает (ключ — brokerCutKey). */
export type BrokerCut = { share: number; n: number; byBroker?: Record<string, { share: number; n: number }> }

/** Сокращения с доски и из рейт-конов — одна компания. Ключ и значение — уже normName. */
const ALIAS: Record<string, string> = { tql: 'total quality logistics', chr: 'ch robinson', 'c h robinson': 'ch robinson' }

/** Один брокер под разными записями — один ключ: «TQL» и «Total Quality Logistics, LLC». */
export function brokerCutKey(name: string | null | undefined): string | null {
  const k = normName(name)
  return k ? (ALIAS[k] ?? k) : null
}

/** Выше этой доли брокер не отдаёт: 10% валовой маржи — нижний край рынка. */
export const MAX_SHARE = 0.9
/** Меньше трёх сравнений — это не медиана, а случайность: берём типовые 0.83. */
export const DEFAULT_SHARE = 0.83
const MIN_ROWS = 3

/** Медиана долей по парам «что получили мы / что платит грузоотправитель». */
export function brokerCut(pairs: { ours: number; shipper: number }[]): BrokerCut {
  const shares = pairs
    .filter((p) => p.ours > 0 && p.shipper > 0)
    .map((p) => p.ours / p.shipper)
    // Пары с долей больше 1.5 или меньше 0.4 — не маржа, а разные грузы под одним
    // направлением (перегабарит, срочный подрыв): в медиану их не пускаем.
    .filter((s) => s >= 0.4 && s <= 1.5)
    .sort((a, b) => a - b)
  if (shares.length < MIN_ROWS) return { share: DEFAULT_SHARE, n: shares.length }
  const mid = Math.floor(shares.length / 2)
  const median = shares.length % 2 ? shares[mid]! : (shares[mid - 1]! + shares[mid]!) / 2
  return { share: Math.round(median * 100) / 100, n: shares.length }
}

/** Общая доля и доли по брокерам — у тех, где сравнений не меньше трёх. */
export function brokerCuts(pairs: { ours: number; shipper: number; broker?: string | null }[]): BrokerCut {
  const all = brokerCut(pairs)
  const groups = new Map<string, typeof pairs>()
  for (const p of pairs) {
    const k = brokerCutKey(p.broker)
    if (k) groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const byBroker: Record<string, { share: number; n: number }> = {}
  for (const [k, list] of groups) {
    const c = brokerCut(list)
    if (c.n >= MIN_ROWS) byBroker[k] = c
  }
  return Object.keys(byBroker).length ? { ...all, byBroker } : all
}

/** Доля для этого брокера, если по нему сравнений хватает, иначе общая; broker — ключ или null. */
export function cutFor(cut: BrokerCut, broker?: string | null): { share: number; n: number; broker: string | null } {
  const k = brokerCutKey(broker)
  const own = k ? cut.byBroker?.[k] : undefined
  return own ? { ...own, broker: k } : { share: cut.share, n: cut.n, broker: null }
}

/** Во сколько торговаться: от «сколько обычно достаётся» до «сколько брокер отдаст с трудом».
 * С брокером — по его доле, если она есть; broker в ответе — чья доля взята (null — общая). */
export function targetBand(
  shipperRate: number,
  cut: BrokerCut,
  broker?: string | null,
): { low: number; high: number; n: number; broker: string | null } | null {
  if (!(shipperRate > 0)) return null
  const c = cutFor(cut, broker)
  const low = shipperRate * Math.min(c.share, MAX_SHARE)
  const high = shipperRate * Math.max(c.share, MAX_SHARE)
  return { low, high, n: c.n, broker: c.broker }
}

/** Ставка брокера против цели: ниже вилки, в вилке или выше неё. */
export function vsTarget(rate: number, band: { low: number; high: number }): 'below' | 'inside' | 'above' {
  if (rate < band.low) return 'below'
  return rate > band.high ? 'above' : 'inside'
}
