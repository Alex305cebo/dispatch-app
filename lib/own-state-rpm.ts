import type { LoadRecord } from './map.ts'
import { stateOfCity } from './toll-spend.ts'

/** Ставка за милю по нашим грузам из штата: $ за гружёную милю и сколько грузов. */
export type OwnStateRpm = Record<string, { rpm: number; n: number }>

/**
 * Средняя ставка за милю наших грузов с пикапом в штате — по рейт-конам за последний год,
 * без оценок: ставок по штатам у открытого DAT нет (только по 5 регионам, остальное — в
 * платном RateView), а выдуманную цифру диспетчеру показывать нельзя. Считается как весь
 * гросс на все гружёные мили, а не среднее средних (как в lib/lanes.ts). Отменённые и
 * котировки — не грузы.
 */
export function ownStateRpm(loads: LoadRecord[], now = Date.now()): OwnStateRpm {
  const since = now - 365 * 86400_000
  const acc = new Map<string, { rate: number; miles: number; n: number }>()
  for (const l of loads) {
    if (l.status === 'quoted' || l.status === 'cancelled') continue
    if (!(l.rate > 0) || !(l.loadedMiles > 0)) continue
    const day = Date.parse(l.pickupDate ?? '')
    if (Number.isNaN(day) || day < since) continue
    const st = stateOfCity(l.origin)
    if (!st) continue
    const a = acc.get(st) ?? { rate: 0, miles: 0, n: 0 }
    a.rate += l.rate
    a.miles += l.loadedMiles
    a.n += 1
    acc.set(st, a)
  }
  const out: OwnStateRpm = {}
  for (const [st, a] of acc) out[st] = { rpm: Math.round((a.rate / a.miles) * 100) / 100, n: a.n }
  return out
}
