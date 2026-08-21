/**
 * Строка места трака: где он на самом деле, а не где ближайший город вендора.
 *
 * ELD присылает описание вида «98.0mi ENE from Mammoth lakes, CA»: ближайший
 * известный ЕМУ город и штат ЭТОГО города. Под Тонопой ближайшим оказался город
 * за 98 миль и за границей штата — на экране «CA», а трак стоит в Неваде. По
 * штату диспетчер называет брокеру пикап, считает пермиты и топливный налог, так
 * что цена такой ошибки — не косметическая.
 *
 * Что делаем: штат берём из координат (lib/us-state.ts, офлайн) и ставим впереди,
 * если он не совпал с тем, что в строке. Сам город не выбрасываем — он остаётся
 * ориентиром, и видно, что до него 98 миль. Совпал — строка не трогается вовсе,
 * а это обычный случай.
 */

import { stateOf } from './us-state.ts'

/** Хвост «, CA» — штат, который вендор приписал СВОЕМУ городу, а не траку. */
const TAIL_STATE = /,\s*([A-Za-z]{2})\s*$/

/** Строка места с фактическим штатом впереди, если вендор ошибся штатом. */
export function fixPlace(
  raw: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  const s = raw?.trim()
  if (!s) return null
  const actual = stateOf(lat, lng)
  // Вне США либо без координат — поправить нечем, и выдумывать нечего.
  if (!actual) return s
  const named = TAIL_STATE.exec(s)?.[1]?.toUpperCase()
  if (!named || named === actual) return s
  return `${actual} · ${s}`
}

/** Короткая форма для таблиц: «12.0mi N from Ashland, VA» → «Ashland, VA».
 * Приставку с фактическим штатом сохраняет — ради неё всё и затевалось. */
export function placeCity(place: string | null | undefined): string | null {
  const s = place?.trim()
  if (!s) return null
  const m = /^([A-Z]{2}\s·\s)?(.*)$/s.exec(s)!
  const prefix = m[1] ?? ''
  const rest = m[2]!
  const city = /from\s+(.+)$/i.exec(rest)?.[1] ?? rest
  return `${prefix}${city}`
}
