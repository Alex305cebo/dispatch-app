// Раскладка плиток: какой порядок и какого размера плитки на каждом разделе.
//
// Порядок ОБЩИЙ для всей компании, а не личный у каждого диспетчера — так решил
// владелец: «порядок для всех сразу». Поэтому раскладка живёт в таблице settings
// (она одна на компанию), а не в localStorage браузера, как было в образце на /ui.
// Практическое следствие: один человек переставил — увидели все, включая того, кто
// сейчас смотрит с телефона. Поэтому же перестановка спрятана в отдельный режим,
// который надо включить кнопкой: случайный сдвиг пальцем менял бы экран всей смене.

/** Размеры, как их называет владелец: мини / маленькая / широкая / большая.
 *  Сетка — 6 колонок на телефоне и 12 на большом экране, поэтому:
 *    xs — шестая часть строки (на телефоне треть; добавлена 23.09.2026),
 *    s  — четверть (на телефоне половина),
 *    w  — половина (на телефоне вся ширина),
 *    l  — вся строка.
 *  На телефоне w и l выглядят одинаково, и это не ошибка. Колонки мельче, чем были
 *  (2 и 4), только ради xs: s, w и l занимают ровно ту же ширину, что и раньше. */
export type TileSize = 'xs' | 's' | 'w' | 'l'

export const TILE_SIZES: TileSize[] = ['xs', 's', 'w', 'l']

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

/** Список разделов и адрес каждого. Один источник имён: по нему серверное действие
 *  проверяет пришедшее с клиента имя раздела, а адрес нужен ссылкам и тестам. */
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

/** Личная раскладка одного диспетчера. Её ставит администратор (решение владельца
 *  23.09.2026: «менять вёрстку для определённого диспетчера, не для всех сразу»).
 *  Нет её — диспетчер видит общую. */
export function userTileKey(page: TilePage, userId: number): string {
  return `tiles:${page}:user:${userId}`
}

/** Кука администратора «раскладку чью я сейчас правлю». Пока она стоит, он на всех
 *  разделах видит и двигает раскладку этого диспетчера, а не общую. */
export const TILES_FOR_COOKIE = 'tiles_for'

/** Ключ выключателя перестановки в settings.
 *
 *  Сама возможность двигать плитки ВЫКЛЮЧЕНА, пока администратор не включит её в
 *  настройках — так решил владелец. Пока выключена, кнопки «Переставить» в разделах
 *  нет вовсе: порядок для всей компании общий, и случайный сдвиг у одного человека
 *  менял бы экран всей смене. Отсутствие ключа в базе — выключено, то есть новая
 *  установка получает заблокированную перестановку без всякой настройки. */
export const TILES_ENABLED_KEY = 'tiles:enabled'

function isSize(v: unknown): v is TileSize {
  return v === 'xs' || v === 's' || v === 'w' || v === 'l'
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
  // Данные водителей: свой номер, компания и дальше по маленькой плитке на
  // каждого водителя — их подставляет trucksTiles, потому что зависят от парка.
  { id: 'drivers-me', size: 's' },
  { id: 'drivers-co', size: 's' },
  { id: 'list', size: 'l' },
  { id: 'eld', size: 'w' },
]

/** Ключ плитки водителя. Номер трака, а не место в списке: трак продали — его плитка
 *  исчезла, остальные остались на своих местах. */
export function driverTileId(truckId: number): string {
  return `driver-${truckId}`
}

/** Раскладка «Траков» по умолчанию для КОНКРЕТНОГО парка: к постоянным плиткам
 *  добавляются плитки водителей, сразу за «Мой номер» и «Компания».
 *
 *  Зачем функция, а не постоянный список: водителей столько, сколько траков, и ключи
 *  у их плиток зависят от базы. applyLayout сверяет сохранённый порядок именно с этим
 *  списком, поэтому плитка нового трака встаёт в конец, а не в середину чужой
 *  раскладки, а плитка проданного не висит в настройках вечно. */
export function trucksTiles(truckIds: number[]): TilePlacement[] {
  const out: TilePlacement[] = []
  for (const p of TRUCKS_TILES) {
    out.push(p)
    if (p.id === 'drivers-co') for (const id of truckIds) out.push({ id: driverTileId(id), size: 's' })
  }
  return out
}

/** Сохранённый порядок со старой единственной плиткой «Данные водителей» → новые
 *  плитки на её месте.
 *
 *  Без этого раздел, где кто-то уже переставлял плитки, встретил бы владельца
 *  водителями в самом низу страницы: старый ключ applyLayout выбросил бы как
 *  незнакомый, а новые приписал бы в конец. Записывать обратно в настройки нечего —
 *  как только плитку подвинут, сохранится уже новый порядок. */
export function migrateDriversTile(saved: TilePlacement[], truckIds: number[]): TilePlacement[] {
  if (!saved.some((p) => p.id === 'drivers')) return saved
  const out: TilePlacement[] = []
  for (const p of saved) {
    if (p.id !== 'drivers') {
      out.push(p)
      continue
    }
    out.push({ id: 'drivers-me', size: 's' }, { id: 'drivers-co', size: 's' })
    for (const id of truckIds) out.push({ id: driverTileId(id), size: 's' })
  }
  return out
}

/** Карточка трака: сохранённый порядок со старой плиткой «Водитель · CDL, медкарта,
 *  фото» → без неё, а шапка трака во всю строку.
 *
 *  Плитку убрали 22.09.2026: всё её уникальное переехало в шапку («hero»). У
 *  владельца они стояли рядом, по пол-строки каждая. Если просто выбросить ключ,
 *  шапка осталась бы в пол-строки, а рядом с ней встали бы маленькие плитки с одной
 *  цифрой, растянутые на её высоту. Шапка забирает строку, которую они занимали
 *  вдвоём. Сработает один раз: как только раскладку сохранят, старого ключа в ней уже
 *  не будет, и дальше размер шапки — выбор того, кто переставляет. */
export function migrateTruckDriverCard(saved: TilePlacement[]): TilePlacement[] {
  if (!saved.some((p) => p.id === 'driver-card')) return saved
  return saved
    .filter((p) => p.id !== 'driver-card')
    .map((p) => (p.id === 'hero' ? { id: 'hero', size: 'l' as const } : p))
}

/** Раскладки остальных разделов по умолчанию — тот порядок, в котором блоки стояли до
 *  плиток. Все здесь по той же причине, что и TRUCKS_TILES: страницы-серверы не могут
 *  забрать обычное значение из модуля с 'use client'. */
export const BROKERS_TILES: TilePlacement[] = [
  { id: 'brokers-count', size: 's' },
  { id: 'facilities-count', size: 's' },
  { id: 'attention-count', size: 's' },
  { id: 'plan', size: 'l' },
  { id: 'directory', size: 'l' },
  // Проверка по MC/DOT и «Крупнейшие брокеры» — вернулись 19.09.2026, рядом в один ряд.
  { id: 'check', size: 'w' },
  { id: 'top', size: 'w' },
]

/** «Толлы». Месячные числа разобраны на четыре маленькие плитки; они условные —
 *  пока ни у одного рейса толлы не посчитаны, считать нечего и плиток нет. */
export const TOLLS_TILES: TilePlacement[] = [
  { id: 'toll-total', size: 's' },
  { id: 'toll-per-mile', size: 's' },
  { id: 'toll-share', size: 's' },
  { id: 'toll-loads', size: 's' },
  { id: 'missing', size: 'l' },
  { id: 'calc', size: 'l' },
  { id: 'toll-top', size: 'w' },
  { id: 'guide', size: 'l' },
]

/** У «Документов» раскладка СВОЯ НА КАЖДУЮ ВКЛАДКУ: на «Грузах» и на «Траках и
 *  водителях» лежат разные блоки, и общий порядок для них означал бы, что плитка
 *  одной вкладки толкает плитку другой. Денежные отчёты и корзина — по одному блоку,
 *  двигать там нечего, поэтому сетки у них нет. */
export const DOCS_TILES: TilePlacement[] = [
  { id: 'recognize', size: 'w' },
  // Денежные числа есть только у того, кому открыты «Финансы»; без права их нет.
  { id: 'pay-to-submit', size: 's' },
  { id: 'pay-awaiting', size: 's' },
  { id: 'pay-funded', size: 's' },
  { id: 'pay-risk', size: 's' },
  { id: 'loads', size: 'l' },
]

export const DOCS_FLEET_TILES: TilePlacement[] = [
  { id: 'docs-count', size: 's' },
  { id: 'docs-trucks', size: 's' },
  { id: 'upload', size: 'w' },
  { id: 'library', size: 'l' },
]

/** «Грузы». Верх страницы был одним блоком: четыре числа недели внутри общей
 *  карточки, а под ними карта, календарь, очередь внимания и список — всё в одной
 *  плитке во всю строку, двигать нечего. Теперь каждое число живёт своей маленькой
 *  плиткой, к ним добавлены счётчики по состояниям, а крупными остались те блоки,
 *  которые читают целиком. Плитка `attention` условная: очереди внимания нет, когда
 *  ничего не горит. */
export const LOADS_TILES: TilePlacement[] = [
  { id: 'week-gross', size: 's' },
  { id: 'week-rpm', size: 's' },
  { id: 'utilization', size: 's' },
  { id: 'next-week', size: 's' },
  { id: 'total', size: 's' },
  { id: 'unassigned', size: 's' },
  { id: 'quoted', size: 's' },
  { id: 'booked', size: 's' },
  { id: 'in-transit', size: 's' },
  { id: 'delivered', size: 's' },
  { id: 'map', size: 'l' },
  { id: 'calendar', size: 'l' },
  { id: 'attention', size: 'l' },
  { id: 'list', size: 'l' },
  { id: 'chart', size: 'l' },
  { id: 'lanes', size: 'l' },
]

export const TELEGRAM_TILES: TilePlacement[] = [
  { id: 'chats', size: 's' },
  { id: 'unread', size: 's' },
  { id: 'linked', size: 's' },
  { id: 'all-chats', size: 's' },
  // Список чатов и открытая переписка — одна плитка: слева список, справа чат,
  // работают они только вместе.
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
  // Шапка разобрана: заголовок с брокером, предупреждения, адреса, полоса статуса,
  // бумаги и разбор ставки — каждое своей плиткой.
  { id: 'hero', size: 'w' },
  { id: 'warnings', size: 'w' },
  { id: 'stops', size: 'w' },
  // Во всю строку: полоса статуса раскладывает до пяти подписанных шагов, и в
  // половинной плитке «Загрузка» и «В пути» сходились вплотную, а у груза с
  // несколькими точками подписи налезали друг на друга.
  { id: 'status', size: 'l' },
  { id: 'papers', size: 'w' },
  { id: 'rate', size: 'l' },
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
  // Шапка разобрана: паспорт с фото, текущее задание, длинные части задания и
  // одиннадцать цифр трака, каждая своей маленькой плиткой. Часть цифр есть не у
  // каждого трака — ключи смысловые, чтобы сохранённый порядок не путал пробег с
  // топливом.
  { id: 'hero', size: 'l' },
  // Во всю строку: задание бывает высоким (маршрут, даты, частичные грузы), и
  // маленькая плитка рядом с ним растягивалась на его высоту с одной цифрой внутри.
  { id: 'assignment', size: 'l' },
  { id: 'task', size: 'l' },
  { id: 'week-rate', size: 's' },
  { id: 'week-miles', size: 's' },
  { id: 'rpm', size: 's' },
  { id: 'deadhead', size: 's' },
  { id: 'week-target', size: 's' },
  { id: 'week-target-gross', size: 's' },
  { id: 'on-time', size: 's' },
  { id: 'odometer', size: 's' },
  { id: 'oil', size: 's' },
  { id: 'fuel', size: 's' },
  { id: 'load-fuel', size: 's' },
  { id: 'todos', size: 'l' },
  { id: 'map', size: 'l' },
  { id: 'ratecon', size: 'l' },
  { id: 'driver', size: 'l' },
  { id: 'trips', size: 'l' },
  { id: 'loads', size: 'w' },
  { id: 'docs', size: 'w' },
  // «driver-card» (Водитель · CDL, медкарта, фото) убрана 22.09.2026: она повторяла
  // шапку трака, её уникальное переехало в «hero». Сохранённый ключ applyLayout
  // выбрасывает сам — как любой незнакомый.
  { id: 'care', size: 'l' },
  { id: 'economics', size: 'l' },
]
