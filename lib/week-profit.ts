// Прибыль недели для «Сегодня» — доход, расходы и что осталось, как «Revenue · Expenses ·
// Profit» у SmartHop (владелец, 13/10/26: «сделай даже больше, изучи»). Та же экономика,
// что у карточки груза (lib/profit.ts calcLoad), только сложенная по неделе и по тракам.
// Чистая функция без базы — см. week-profit.test.ts.

import { calcLoad, type Breakdown, type Load, type TruckSettings } from './profit.ts'

export type CostGroup = 'fuel' | 'driver' | 'truck' | 'fees'
export const COST_GROUPS: CostGroup[] = ['fuel', 'driver', 'truck', 'fees']

/** Девять статей карточки груза — в четыре полосы. Топливо и водитель — сами по себе:
 *  это две самые крупные. Всё, что про сам трак (платёж, страховка, ELD и разрешения,
 *  ремонт), — одной; толлы и проценты с гросса (факторинг, диспетчер) — другой. */
export function groupCosts(b: Breakdown): Record<CostGroup, number> {
  return {
    fuel: b.fuel,
    driver: b.driver,
    truck: b.truckPayment + b.insurance + b.eldPermits + b.maintenance,
    fees: b.tolls + b.factoring + b.dispatch,
  }
}

export type TruckProfit = { truckId: number; gross: number; cost: number; net: number; loads: number }

export type WeekProfit = {
  gross: number
  cost: number
  net: number
  costs: Record<CostGroup, number>
  /** Траки с грузами недели, самый прибыльный первым. */
  byTruck: TruckProfit[]
  /** Грузы, которые не посчитать: без трака или с картой трака, по которой счёт
   *  невозможен (MPG 0, нет миль). В суммы они не входят — чужой трак грузу без своего
   *  не подставляется, как и на «Грузах». */
  unpriced: number
}

export function weekProfit(loads: (Load & { truckId: number | null })[], trucks: (TruckSettings & { id: number })[]): WeekProfit {
  const byId = new Map(trucks.map((tr) => [tr.id, tr]))
  const costs: Record<CostGroup, number> = { fuel: 0, driver: 0, truck: 0, fees: 0 }
  const per = new Map<number, TruckProfit>()
  let gross = 0
  let cost = 0
  let unpriced = 0
  for (const load of loads) {
    const truck = load.truckId == null ? undefined : byId.get(load.truckId)
    let b: Breakdown | null = null
    if (truck) {
      try {
        b = calcLoad(load, truck)
      } catch {
        // calcLoad бросает на невозможной карте трака (MPG 0, доли с гросса ≥ 100%) —
        // такой груз просто не в счёте, страница из-за него не падает.
        b = null
      }
    }
    if (!truck || !b) {
      unpriced++
      continue
    }
    gross += b.gross
    cost += b.totalCost
    const g = groupCosts(b)
    for (const k of COST_GROUPS) costs[k] += g[k]
    const row = per.get(truck.id) ?? { truckId: truck.id, gross: 0, cost: 0, net: 0, loads: 0 }
    row.gross += b.gross
    row.cost += b.totalCost
    row.net += b.net
    row.loads++
    per.set(truck.id, row)
  }
  return { gross, cost, net: gross - cost, costs, byTruck: [...per.values()].sort((a, b) => b.net - a.net), unpriced }
}
