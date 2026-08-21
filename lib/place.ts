/**
 * Строка места трака: где он на самом деле, а не где ближайший город вендора.
 *
 * ELD присылает описание вида «98.0mi ENE from Mammoth lakes, CA»: ближайший
 * известный ЕМУ город и штат ЭТОГО города. Под Тонопой ближайшим оказался город
 * за 98 миль и за границей штата — на экране «CA», а трак стоит в Неваде. По
 * штату диспетчер называет брокеру пикап, считает пермиты и топливный налог, так
 * что цена такой ошибки — не косметическая.
 *
 * Что делаем: собираем строку сами по координатам — ближайший пункт из справочника
 * Census и штат из границ (lib/us-place.ts). Там, где вендор видел город за 98 миль,
 * у нас «1.1mi SSW from Tonopah, NV»: тот самый посёлок, который водитель видит из
 * окна.
 *
 * Строка вендора остаётся запасным вариантом — на случай, когда ближе шестидесяти
 * миль нет ни одного пункта (океан, Канада). Тогда хотя бы правим штат: если он не
 * совпал с фактическим, ставим фактический впереди.
 */

import { stateOf } from './us-state.ts'
import { placeNear } from './us-place.ts'

/** Хвост «, CA» — штат, который вендор приписал СВОЕМУ городу, а не траку. */
const TAIL_STATE = /,\s*([A-Za-z]{2})\s*$/

/** Место трака словами: свой ближайший пункт, а если его нет — строка вендора. */
export function fixPlace(
  raw: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  // Свой ответ лучше вендорского всегда, когда он есть: ближе пункт, вернее штат.
  return placeNear(lat, lng) ?? fixState(raw, lat, lng)
}

/** Запасной путь: пункта рядом нет, работаем с тем, что прислал вендор. Фактический
 * штат ставим впереди, если он разошёлся с тем, что в строке; сам город не трогаем —
 * он остаётся ориентиром. */
export function fixState(
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
