/**
 * Ближайший населённый пункт к точке — офлайн, по справочнику Census.
 *
 * Зачем свой, если строку места присылает ELD. Вендор ищет по своему короткому
 * списку крупных городов, и в малонаселённых штатах ближайший у него оказывается
 * за сотню миль: трак стоял в Тонопе (Невада), а на экране было «98.0mi ENE from
 * Mammoth lakes, CA» — и город не тот, и штат не тот. Диспетчер по этой строке
 * называет брокеру место и считает, успевает ли водитель.
 *
 * Справочник — 32 329 пунктов Census Gazetteer, включая CDP: та же Тонопа с её
 * двумя тысячами жителей там есть, поэтому ответ становится «0.6mi N from
 * Tonopah, NV» вместо сотни миль до чужого штата.
 *
 * Штат берётся НЕ у найденного города, а из границ по координатам (lib/us-state.ts):
 * у самой границы ближайший пункт легко оказывается на той стороне, и подписывать
 * трак его штатом значило бы повторить исходную ошибку в меньшем масштабе.
 *
 * Только сервер. Пометки 'server-only' здесь нет намеренно: этот пакет бросает
 * исключение в обычном Node, и с ним не запускались бы тесты. Держится это тем,
 * что строку места собирают серверные страницы, а клиентские компоненты получают
 * её готовой в пропсах.
 */

import { bearing, haversineMiles } from './geo.ts'
import { stateOf } from './us-state.ts'
import PLACES from './data/us-places.ts'

type Place = { name: string; state: string; lat: number; lng: number }

/** Ячейки по градусу: перебирать 32 тысячи пунктов на каждую точку следа накладно,
 * а в своей и соседних ячейках их десятки. Градус широты — 69 миль, так что кольцо
 * соседей с запасом накрывает любое разумное «ближайший». */
let grid: Map<string, Place[]> | null = null

const key = (lat: number, lng: number) => `${Math.floor(lat)}|${Math.floor(lng)}`

function build(): Map<string, Place[]> {
  const m = new Map<string, Place[]>()
  for (const line of PLACES.split('\n')) {
    const p = line.split('|')
    if (p.length !== 4) continue
    const lat = Number(p[2])
    const lng = Number(p[3])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const place: Place = { name: p[0]!, state: p[1]!, lat, lng }
    const k = key(lat, lng)
    const cell = m.get(k)
    if (cell) cell.push(place)
    else m.set(k, [place])
  }
  return m
}

/** 16 румбов — как в строке вендора, чтобы подпись читалась привычно. */
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** Насколько далеко ещё имеет смысл называть пункт ориентиром. Дальше — честнее
 * промолчать: «в 140 милях от такого-то» не место, а направление. */
const MAX_MI = 60

/**
 * «0.6mi N from Tonopah, NV» либо null, если рядом ничего нет (океан, Канада,
 * пустая клетка справочника).
 */
export function placeNear(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  grid ??= build()

  let best: Place | null = null
  let bestMi = Infinity
  // Расширяем кольцо, пока не нашли: в пустыне соседняя клетка бывает пустой.
  for (let r = 1; r <= 2 && !best; r++) {
    for (let dLat = -r; dLat <= r; dLat++) {
      for (let dLng = -r; dLng <= r; dLng++) {
        for (const p of grid.get(key(lat + dLat, lng + dLng)) ?? []) {
          const mi = haversineMiles({ lat, lng }, p)
          if (mi < bestMi) {
            bestMi = mi
            best = p
          }
        }
      }
    }
  }
  if (!best || bestMi > MAX_MI) return null

  const state = stateOf(lat, lng) ?? best.state
  // В черте самого пункта расстояние и румб — шум: трак просто в этом городе.
  if (bestMi < 1) return `${best.name}, ${state}`
  const dir = COMPASS[Math.round(bearing(best, { lat, lng }) / 22.5) % 16]
  return `${bestMi.toFixed(1)}mi ${dir} from ${best.name}, ${state}`
}
