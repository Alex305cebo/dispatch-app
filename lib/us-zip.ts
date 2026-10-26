/**
 * Почтовый индекс места трака — офлайн, по центрам индексов (lib/data/us-zips.ts).
 *
 * Брокер спрашивает «где трак» и ждёт ответ вида «Manteno, IL 60950»: по индексу
 * он сам считает мили до склада. ELD индекса не присылает, внешние геокодеры на
 * каждый показ карточки — лишние запросы и лимиты, поэтому ближайший центр индекса.
 *
 * Только сервер — как и lib/us-place.ts: файл данных почти мегабайт.
 */

import { haversineMiles } from './geo.ts'
import { stateOf } from './us-state.ts'
import { zipState } from './zip-state.ts'
import { placeCity } from './place.ts'
import ZIPS from './data/us-zips.ts'

type Zip = { zip: string; lat: number; lng: number }

let grid: Map<string, Zip[]> | null = null
const key = (lat: number, lng: number) => `${Math.floor(lat * 2)}|${Math.floor(lng * 2)}`

function build(): Map<string, Zip[]> {
  const m = new Map<string, Zip[]>()
  for (const line of ZIPS.split('\n')) {
    const p = line.split('|')
    if (p.length !== 3) continue
    const lat = Number(p[1])
    const lng = Number(p[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const z: Zip = { zip: p[0]!, lat, lng }
    const k = key(lat, lng)
    const cell = m.get(k)
    if (cell) cell.push(z)
    else m.set(k, [z])
  }
  return m
}

/** Дальше этого индекс — уже не про место трака, а про соседний район. */
const MAX_MI = 25

/** Ближайший индекс к точке, того же штата, что и сама точка. null — рядом нет. */
export function zipNear(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  grid ??= build()
  // Индекс за границей штата брокеру не годится: у самой границы ближайший центр
  // легко оказывается на той стороне.
  const st = stateOf(lat, lng)
  let best: Zip | null = null
  let bestMi = Infinity
  // Клетка — полградуса (~35 миль): кольца из соседей хватает на MAX_MI.
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      for (const z of grid.get(key(lat + dLat / 2, lng + dLng / 2)) ?? []) {
        if (st && zipState(z.zip) !== st) continue
        const mi = haversineMiles({ lat, lng }, z)
        if (mi < bestMi) {
          bestMi = mi
          best = z
        }
      }
    }
  }
  return best && bestMi <= MAX_MI ? best.zip : null
}

/**
 * «Manteno, IL 60950» — место трака для брокера: город, штат и индекс одной строкой.
 * Приставка «NV · » (штат поправлен, lib/place.ts) не нужна — штат и так в конце.
 */
export function placeZip(
  location: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  const city = placeCity(location)?.replace(/^[A-Z]{2}\s·\s/, '') ?? null
  if (!city) return null
  const zip = zipNear(lat, lng)
  return zip ? `${city} ${zip}` : city
}
