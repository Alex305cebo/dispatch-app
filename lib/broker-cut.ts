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

/** Доля трака: медиана «наша ставка / цена грузоотправителя» и сколько грузов её дали. */
export type BrokerCut = { share: number; n: number }

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

/** Во сколько торговаться: от «сколько обычно достаётся» до «сколько брокер отдаст с трудом». */
export function targetBand(shipperRate: number, cut: BrokerCut): { low: number; high: number } | null {
  if (!(shipperRate > 0)) return null
  const low = shipperRate * Math.min(cut.share, MAX_SHARE)
  const high = shipperRate * Math.max(cut.share, MAX_SHARE)
  return { low, high }
}

/** Ставка брокера против цели: ниже вилки, в вилке или выше неё. */
export function vsTarget(rate: number, band: { low: number; high: number }): 'below' | 'inside' | 'above' {
  if (rate < band.low) return 'below'
  return rate > band.high ? 'above' : 'inside'
}
