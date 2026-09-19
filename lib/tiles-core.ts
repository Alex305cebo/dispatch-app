// Раскладка плиток: какой порядок и какого размера плитки на каждом разделе.
//
// Порядок ОБЩИЙ для всей компании, а не личный у каждого диспетчера — так решил
// владелец: «порядок для всех сразу». Поэтому раскладка живёт в таблице settings
// (она одна на компанию), а не в localStorage браузера, как было в образце на /ui.
// Практическое следствие: один человек переставил — увидели все, включая того, кто
// сейчас смотрит с телефона. Поэтому же перестановка спрятана в отдельный режим,
// который надо включить кнопкой: случайный сдвиг пальцем менял бы экран всей смене.

/** Размеры, как их называет владелец: маленькая / широкая / большая.
 *  Сетка — 2 колонки на телефоне и 4 на большом экране, поэтому:
 *    s — одна колонка (на телефоне половина ширины),
 *    w — две (на телефоне вся ширина),
 *    l — вся строка.
 *  На телефоне w и l выглядят одинаково — там всего две колонки, и это не ошибка. */
export type TileSize = 's' | 'w' | 'l'

export const TILE_SIZES: TileSize[] = ['s', 'w', 'l']

export type TilePlacement = { id: string; size: TileSize }

/** Разделы, у которых есть своя раскладка. Ключ идёт в settings как `tiles:<page>`,
 *  поэтому менять эти строки нельзя — сбросит раскладку у всех. */
export type TilePage =
  | 'overview'
  | 'loads'
  | 'trucks'
  | 'docs'
  | 'brokers'
  | 'tolls'
  | 'telegram'
  | 'invoices'

/** Список разделов и адрес каждого. Один источник, чтобы серверное действие могло
 *  проверить пришедшее с клиента имя раздела и обновить нужную страницу. */
export const TILE_PATHS: Record<TilePage, string> = {
  overview: '/',
  loads: '/loads',
  trucks: '/trucks',
  docs: '/docs',
  brokers: '/brokers',
  tolls: '/tolls',
  telegram: '/telegram',
  invoices: '/invoices',
}

export const TILE_PAGES = Object.keys(TILE_PATHS) as TilePage[]

export function tileKey(page: TilePage): string {
  return `tiles:${page}`
}

function isSize(v: unknown): v is TileSize {
  return v === 's' || v === 'w' || v === 'l'
}

/** Разбор сохранённого значения. Ошибки здесь не бросаем и не логируем: раскладка —
 *  украшение, и битая строка в settings не повод уронить весь раздел. */
export function parseLayout(raw: string | null): TilePlacement[] {
  if (!raw) return []
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const out: TilePlacement[] = []
    const seen = new Set<string>()
    for (const item of v) {
      if (!item || typeof item !== 'object') continue
      const { id, size } = item as { id?: unknown; size?: unknown }
      if (typeof id !== 'string' || !id || seen.has(id)) continue
      seen.add(id)
      out.push({ id, size: isSize(size) ? size : 's' })
    }
    return out
  } catch {
    return []
  }
}

export function serializeLayout(layout: TilePlacement[]): string {
  return JSON.stringify(layout.map((p) => ({ id: p.id, size: p.size })))
}

/**
 * Сохранённая раскладка, приведённая к тому, что страница реально отдала.
 *
 * Две вещи, которые ломались бы без этого: плитку убрали из кода, а её ключ остался
 * в базе навсегда; и наоборот — появилась новая плитка, которой на момент сохранения
 * не было. Незнакомые ключи выбрасываем, новые ставим В КОНЕЦ со своим размером по
 * умолчанию, чтобы добавленная плитка не пролезала в середину чужой раскладки.
 */
export function applyLayout(
  saved: TilePlacement[],
  defaults: TilePlacement[],
): TilePlacement[] {
  const known = new Map(defaults.map((d) => [d.id, d]))
  const out: TilePlacement[] = []
  for (const p of saved) {
    if (!known.has(p.id)) continue
    out.push(p)
    known.delete(p.id)
  }
  for (const d of defaults) if (known.has(d.id)) out.push(d)
  return out
}
