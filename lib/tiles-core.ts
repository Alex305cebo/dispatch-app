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
  | 'docs-fleet'
  | 'brokers'
  | 'tolls'
  | 'telegram'
  | 'invoices'
  | 'load-detail'
  | 'truck-detail'

/** Список разделов и адрес каждого. Один источник, чтобы серверное действие могло
 *  проверить пришедшее с клиента имя раздела и обновить нужную страницу. */
export const TILE_PATHS: Record<TilePage, string> = {
  overview: '/',
  loads: '/loads',
  trucks: '/trucks',
  docs: '/docs',
  'docs-fleet': '/docs',
  brokers: '/brokers',
  tolls: '/tolls',
  telegram: '/telegram',
  invoices: '/invoices',
  'load-detail': '/loads/[id]',
  'truck-detail': '/trucks/[id]',
}

export const TILE_PAGES = Object.keys(TILE_PATHS) as TilePage[]

export function tileKey(page: TilePage): string {
  return `tiles:${page}`
}

/** Ключ выключателя перестановки в settings.
 *
 *  Сама возможность двигать плитки ВЫКЛЮЧЕНА, пока администратор не включит её в
 *  настройках — так решил владелец. Пока выключена, кнопки «Переставить» в разделах
 *  нет вовсе: порядок для всей компании общий, и случайный сдвиг у одного человека
 *  менял бы экран всей смене. Отсутствие ключа в базе — выключено, то есть новая
 *  установка получает заблокированную перестановку без всякой настройки. */
export const TILES_ENABLED_KEY = 'tiles:enabled'

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

/** Раскладка раздела «Траки» по умолчанию.
 *
 *  Крупные блоки разобраны на части: деньги парка, число траков, недоступные и
 *  четыре счётчика под картой — отдельные маленькие плитки, а не одна карточка во
 *  всю строку. Так их есть что двигать и чем менять местами; одна плитка на пол-экрана
 *  этого не даёт.
 *
 *  Живёт ЗДЕСЬ, а не рядом с самим компонентом: fleet-panel.tsx помечен 'use client',
 *  и обычное значение, вывезенное из клиентского модуля, на сервере превращается в
 *  ссылку на клиентский компонент, а не в массив. Страница падала ровно на этом —
 *  «defaults.map is not a function».
 */
export const TRUCKS_TILES: TilePlacement[] = [
  { id: 'week-gross', size: 's' },
  { id: 'fleet-size', size: 's' },
  { id: 'unavailable', size: 's' },
  { id: 'status', size: 's' },
  { id: 'counter-1', size: 's' },
  { id: 'counter-2', size: 's' },
  { id: 'counter-3', size: 's' },
  { id: 'counter-4', size: 's' },
  { id: 'map', size: 'l' },
  { id: 'picker', size: 'w' },
  { id: 'heatmap', size: 'l' },
  { id: 'drivers', size: 'l' },
  { id: 'list', size: 'l' },
  { id: 'eld', size: 'w' },
]

/** Раскладки остальных разделов по умолчанию — тот порядок, в котором блоки стояли до
 *  плиток. Все здесь по той же причине, что и TRUCKS_TILES: страницы-серверы не могут
 *  забрать обычное значение из модуля с 'use client'. */
export const BROKERS_TILES: TilePlacement[] = [
  { id: 'plan', size: 'l' },
  { id: 'directory', size: 'l' },
  // Проверка по MC/DOT и «Крупнейшие брокеры» — вернулись 19.09.2026, рядом в один ряд.
  { id: 'check', size: 'w' },
  { id: 'top', size: 'w' },
]

export const TOLLS_TILES: TilePlacement[] = [
  { id: 'missing', size: 'l' },
  { id: 'calc', size: 'l' },
  { id: 'money', size: 'l' },
  { id: 'guide', size: 'l' },
]

/** У «Документов» раскладка СВОЯ НА КАЖДУЮ ВКЛАДКУ: на «Грузах» и на «Траках и
 *  водителях» лежат разные блоки, и общий порядок для них означал бы, что плитка
 *  одной вкладки толкает плитку другой. Денежные отчёты и корзина — по одному блоку,
 *  двигать там нечего, поэтому сетки у них нет. */
export const DOCS_TILES: TilePlacement[] = [
  { id: 'recognize', size: 'w' },
  { id: 'loads', size: 'l' },
]

export const DOCS_FLEET_TILES: TilePlacement[] = [
  { id: 'upload', size: 'w' },
  { id: 'library', size: 'l' },
]

export const LOADS_TILES: TilePlacement[] = [
  { id: 'views', size: 'l' },
  { id: 'lanes', size: 'l' },
]

export const TELEGRAM_TILES: TilePlacement[] = [
  { id: 'chat', size: 'l' },
  { id: 'settings', size: 'l' },
]

/** Карточка груза. Здесь раскладка по умолчанию длиннее, чем то, что видно на
 *  экране: половина блоков условная — предупреждение о медленном брокере есть не у
 *  каждого брокера, «Обратный груз» — не у каждого направления, хронология водителя
 *  пропадает у отменённого груза. Перечислены ВСЕ возможные плитки, и это важно:
 *  applyLayout сверяется именно с этим списком, поэтому плитка, которой сегодня на
 *  экране нет, не теряет своё место в сохранённом порядке, а сетка её просто
 *  пропускает. Иначе у каждого следующего груза чужие блоки уезжали бы в конец.
 *
 *  Раскладка ОДНА на все грузы: карточка у них одинаковая, и переставлять её заново
 *  на каждом грузе — не то, о чём просили. */
export const LOAD_DETAIL_TILES: TilePlacement[] = [
  { id: 'hero', size: 'l' },
  { id: 'notes', size: 'l' },
  { id: 'map', size: 'l' },
  { id: 'driver', size: 'l' },
  { id: 'queued', size: 'l' },
  { id: 'miles-estimated', size: 'l' },
  { id: 'slow-payer', size: 'l' },
  { id: 'driver-info', size: 'l' },
  { id: 'facility-hints', size: 'l' },
  { id: 'details', size: 'l' },
  { id: 'backhaul', size: 'l' },
  { id: 'docs', size: 'l' },
  { id: 'invoice', size: 'l' },
  { id: 'truck-costs', size: 'l' },
]

/** Карточка трака — по той же причине со всеми условными плитками в списке. */
export const TRUCK_DETAIL_TILES: TilePlacement[] = [
  { id: 'hero', size: 'l' },
  { id: 'todos', size: 'l' },
  { id: 'map', size: 'l' },
  { id: 'ratecon', size: 'l' },
  { id: 'driver', size: 'l' },
  { id: 'trips', size: 'l' },
  { id: 'loads', size: 'w' },
  { id: 'docs', size: 'w' },
  { id: 'driver-card', size: 'l' },
  { id: 'care', size: 'l' },
  { id: 'economics', size: 'l' },
]
