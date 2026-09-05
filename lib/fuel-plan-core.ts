// Чистая часть плана заправок — без базы, чтобы тестировалось голым node.
import { stateOf } from './us-state.ts'

/** У дизеля EIA ведёт свою серию только по Калифорнии; остальные штаты — регион PADD
 * (проверено живым запросом 2026-09-05: TX/FL/OH/NY отдельных серий по дизелю нет). */
const STATE_SERIES: Record<string, string> = { CA: 'SCA' }
const REGION_OF: Record<string, string> = {
  CT: 'R1X', ME: 'R1X', NH: 'R1X', RI: 'R1X', VT: 'R1X', MA: 'R1X',
  DE: 'R1Y', DC: 'R1Y', MD: 'R1Y', NJ: 'R1Y', NY: 'R1Y', PA: 'R1Y',
  FL: 'R1Z', GA: 'R1Z', NC: 'R1Z', SC: 'R1Z', VA: 'R1Z', WV: 'R1Z',
  IL: 'R20', IN: 'R20', IA: 'R20', KS: 'R20', KY: 'R20', MI: 'R20', MN: 'R20', MO: 'R20', NE: 'R20', ND: 'R20', OH: 'R20', OK: 'R20', SD: 'R20', TN: 'R20', WI: 'R20',
  AL: 'R30', AR: 'R30', LA: 'R30', MS: 'R30', NM: 'R30', TX: 'R30',
  CO: 'R40', ID: 'R40', MT: 'R40', UT: 'R40', WY: 'R40',
  AK: 'R5XCA', AZ: 'R5XCA', HI: 'R5XCA', NV: 'R5XCA', OR: 'R5XCA', WA: 'R5XCA',
}
export const REGION_NAME: Record<string, string> = {
  R1X: 'New England', R1Y: 'Central Atlantic', R1Z: 'Lower Atlantic', R20: 'Midwest', R30: 'Gulf Coast', R40: 'Rocky Mountain', R5XCA: 'West Coast',
}

export function seriesFor(state: string): string | null {
  return STATE_SERIES[state] ?? REGION_OF[state] ?? null
}

export type FuelStop = { state: string; series: string; region: string | null; price: number }
export type FuelPlan = {
  asOf: string
  stops: FuelStop[]
  cheapest: FuelStop
  priciest: FuelStop
  /** Разница на полном баке между самым дорогим и самым дешёвым штатом пути. */
  tankSavings: number
}

/** Штаты вдоль полилинии, по порядку, без повторов подряд. */
export function statesAlong(coords: [number, number][]): string[] {
  const out: string[] = []
  const step = Math.max(1, Math.floor(coords.length / 120))
  for (let i = 0; i < coords.length; i += step) {
    const [lat, lng] = coords[i]!
    const s = stateOf(lat, lng)
    if (s && out[out.length - 1] !== s) out.push(s)
  }
  const last = coords[coords.length - 1]
  if (last) {
    const s = stateOf(last[0], last[1])
    if (s && out[out.length - 1] !== s) out.push(s)
  }
  return out
}

