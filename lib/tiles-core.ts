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
  | 'amazon'
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
  amazon: '/amazon',
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
 *  Четыре цифры парка, карта, под ней один список траков (вкладкой рядом —
 *  «Загрузка парка») и подключение ELD. План «Порядок в TMS», 10/09/26: до этого
 *  один и тот же водитель стоял на странице четыре раза — кнопкой-траком под картой,
 *  строкой «Загрузки парка», плиткой с телефоном и карточкой внизу.
 *
 *  Живёт ЗДЕСЬ, а не рядом с самим компонентом: fleet-panel.tsx помечен 'use client',
 *  и обычное значение, вывезенное из клиентского модуля, на сервере превращается в
 *  ссылку на клиентский компонент, а не в массив. Страница падала ровно на этом —
 *  «defaults.map is not a function».
 */
export const TRUCKS_TILES: TilePlacement[] = [
  { id: 'on-load', size: 's' },
  { id: 'free', size: 's' },
  { id: 'off', size: 's' },
  { id: 'attention', size: 's' },
  { id: 'map', size: 'l' },
  { id: 'list', size: 'l' },
  { id: 'eld', size: 'w' },
]

/** Цифры «Траков» до 10/09/26: восемь плиток в два ряда. */
const OLD_TRUCK_NUMBERS = new Set(['week-gross', 'fleet-size', 'unavailable', 'status', 'counter-1', 'counter-2', 'counter-3', 'counter-4'])

/** Сохранённый порядок «Траков» со старыми цифрами → четыре новые на их месте.
 *
 *  Без этого раздел, где кто-то уже переставлял плитки, встретил бы владельца
 *  цифрами в самом низу страницы: старые ключи applyLayout выбросил бы как
 *  незнакомые, а новые приписал бы в конец, под ELD. Новые встают туда, где стояла
 *  первая из старых цифр; раскладки без них — перед картой. Записывать обратно в
 *  настройки нечего: как только плитку подвинут, сохранится уже новый порядок. */
export function migrateTrucksTiles(saved: TilePlacement[]): TilePlacement[] {
  const fresh = TRUCKS_TILES.filter((p) => p.size === 's')
  if (!saved.length || saved.some((p) => fresh.some((f) => f.id === p.id))) return saved
  const old = saved.findIndex((p) => OLD_TRUCK_NUMBERS.has(p.id))
  const at = old >= 0 ? old : Math.max(0, saved.findIndex((p) => p.id === 'map'))
  return [...saved.slice(0, at), ...fresh, ...saved.slice(at)]
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

/** Карточка груза: плитки, влитые в соседние 25.09.2026 (владелец: «должна быть одна
 *  плитка»). Кнопки груза («Открыть Rate Con», «Чат Telegram», «Повторить груз») — в
 *  плитке статуса, «Важное от брокера» — в шапке груза рядом с самим брокером.
 *
 *  Старые ключи уходят, хозяева остаются на своих местах. Статус при этом забирает
 *  строку: в нём теперь и полоса, и кнопки, а в половине строки рядом встала бы чужая
 *  плитка, растянутая на его высоту. Как и migrateTruckDriverCard, срабатывает один
 *  раз — пока старый ключ лежит в сохранённой раскладке.
 *
 *  10/07/26 туда же ушли «Точки» и «Подробности» (владелец: «одна карточка со всей
 *  инфой по грузу»): шапка теперь и есть карточка груза и забирает всю строку. */
const LOAD_MERGED = new Set(['papers', 'notes', 'stops', 'details'])
export function migrateLoadPapers(saved: TilePlacement[]): TilePlacement[] {
  if (!saved.some((p) => LOAD_MERGED.has(p.id))) return saved
  const hadPapers = saved.some((p) => p.id === 'papers')
  const hadFacts = saved.some((p) => p.id === 'stops' || p.id === 'details')
  return saved
    .filter((p) => !LOAD_MERGED.has(p.id))
    .map((p) =>
      hadPapers && p.id === 'status'
        ? { id: 'status', size: 'l' as const }
        : hadFacts && p.id === 'hero'
          ? { id: 'hero', size: 'l' as const }
          : p,
    )
}

/** Карточка груза по плану «Порядок в TMS» (10/09/26): шапка → статус → карта →
 *  «Документы» и «Инвойс» рядом. Блок «Ставка за груз» и «Расходы трака» влиты в
 *  шапку, плашки «мили на глаз» и «медленный брокер» — в «Предупреждения».
 *
 *  Сохранённая раскладка с любым из этих ключей — старая карточка: в ней «Документы» и
 *  счёт стоят внизу во всю строку, и просто выбросить ключи мало — новый порядок тогда
 *  не наступит. Такая раскладка уступает новой целиком, один раз: в следующей
 *  сохранённой старых ключей уже нет, и дальше порядок — выбор того, кто переставляет. */
const LOAD_RETIRED = new Set(['rate', 'truck-costs', 'miles-estimated', 'slow-payer'])
export function migrateLoadOrder(saved: TilePlacement[]): TilePlacement[] {
  return saved.some((p) => LOAD_RETIRED.has(p.id)) ? LOAD_DETAIL_TILES : saved
}

/** Все переезды карточки груза по порядку — то, что отдаётся в tileGrid. */
export const migrateLoadCard = (saved: TilePlacement[]): TilePlacement[] => migrateLoadOrder(migrateLoadPapers(saved))

/** Карточка трака по плану «Порядок в TMS» (10/09/26). Двенадцать плиток-цифр
 *  собраны в «Неделю», «Новый груз из rate con» стал кнопкой «＋ Груз» в шапке,
 *  «История пути» — частью карты, а грузы, документы, обслуживание и экономика трака —
 *  вкладками.
 *
 *  Раскладка с любым из старых ключей уступает новой целиком, один раз — как
 *  migrateLoadOrder: иначе новые плитки встали бы в конец, под старый порядок. */
const TRUCK_RETIRED = new Set([
  'week-rate',
  'week-miles',
  'rpm',
  'deadhead',
  'week-target',
  'week-target-gross',
  'on-time',
  'odometer',
  'oil',
  'fuel',
  'load-fuel',
  'ratecon',
  'trips',
  'loads',
  'docs',
  'care',
  'economics',
])
export function migrateTruckOrder(saved: TilePlacement[]): TilePlacement[] {
  return saved.some((p) => TRUCK_RETIRED.has(p.id)) ? TRUCK_DETAIL_TILES : saved
}

/** Все переезды карточки трака по порядку — то, что отдаётся в tileGrid. */
export const migrateTruckCard = (saved: TilePlacement[]): TilePlacement[] => migrateTruckOrder(migrateTruckDriverCard(saved))

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
// Раздел «Amazon» (10/03/26): счётчики сверху, рейс вставкой, рейсы по дням, траки.
export const AMAZON_TILES: TilePlacement[] = [
  { id: 'am-today', size: 's' },
  { id: 'am-transit', size: 's' },
  { id: 'am-week', size: 's' },
  { id: 'am-rpm', size: 's' },
  { id: 'am-add', size: 'l' },
  { id: 'am-board', size: 'l' },
  { id: 'am-trucks', size: 'l' },
  { id: 'am-lessons', size: 'l' },
]

export const DOCS_TILES: TilePlacement[] = [
  // «Распознать Rate Con» с 25.09.2026 — кнопка в шапке раздела, не плитка.
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

/** «Грузы» с 10/09/26 (план «Порядок в TMS»): четыре цифры недели — по плитке на
 *  каждую, — под ними карта активных грузов со списком водителей и кнопкой «Открыть
 *  груз», ниже одна большая плитка со списком и переключателем Список · Статусы ·
 *  Неделя. Счётчики по состояниям раньше были шестью маленькими плитками — теперь это
 *  пилюли поиска, а «Грузы по дате пикапа» и «Направления» уехали в «Деньги». Их ключи
 *  в сохранённой раскладке applyLayout просто пропускает.
 *
 *  Карта сутки побыла видом внутри 'list' и вернулась своей плиткой: владелец, 10/09/26,
 *  «карта и список водителей со ссылкой должны быть всегда на первой странице». */
export const LOADS_TILES: TilePlacement[] = [
  { id: 'week-gross', size: 's' },
  { id: 'week-rpm', size: 's' },
  { id: 'utilization', size: 's' },
  { id: 'next-week', size: 's' },
  { id: 'map', size: 'l' },
  { id: 'list', size: 'l' },
]

/** Сохранённый порядок «Грузов» без карты → карта перед списком.
 *
 *  Раскладка, сохранённая, пока карта была видом внутри списка, ключа 'map' не знает, и
 *  applyLayout приписал бы карту в самый низ, под все грузы, — ровно туда, откуда её
 *  просили достать. Раскладки старше хранят 'map' на прежнем месте и не трогаются. */
export function migrateLoadsMap(saved: TilePlacement[]): TilePlacement[] {
  if (!saved.length || saved.some((p) => p.id === 'map')) return saved
  const at = saved.findIndex((p) => p.id === 'list')
  const map: TilePlacement = { id: 'map', size: 'l' }
  return at < 0 ? [...saved, map] : [...saved.slice(0, at), map, ...saved.slice(at)]
}

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
 *  экране: половина блоков условная — предупреждений у большинства грузов нет вовсе,
 *  «Обратный груз» — не у каждого направления, хронология водителя пропадает у
 *  отменённого груза. Перечислены ВСЕ возможные плитки, и это важно:
 *  applyLayout сверяется именно с этим списком, поэтому плитка, которой сегодня на
 *  экране нет, не теряет своё место в сохранённом порядке, а сетка её просто
 *  пропускает. Иначе у каждого следующего груза чужие блоки уезжали бы в конец.
 *
 *  Раскладка ОДНА на все грузы: карточка у них одинаковая, и переставлять её заново
 *  на каждом грузе — не то, о чём просили. */
export const LOAD_DETAIL_TILES: TilePlacement[] = [
  // Шапка — это и есть карточка груза: точки, ставка шкалой, мили полосой, груз,
  // брокер, а расходы раскрываются в ней же (10/07/26, план «Порядок в TMS» 10/09/26).
  { id: 'hero', size: 'l' },
  // Во всю строку: плашки «опаздывает», «мили на глаз», «медленный брокер» — текст на
  // всю ширину, а в половине строки рядом с ними плотная сетка ставила «Документы».
  { id: 'warnings', size: 'l' },
  // Во всю строку: полоса статуса раскладывает до пяти подписанных шагов, и в
  // половинной плитке «Загрузка» и «В пути» сходились вплотную, а у груза с
  // несколькими точками подписи налезали друг на друга.
  { id: 'status', size: 'l' },
  { id: 'map', size: 'l' },
  // Бумаги и счёт — рядом: это одна работа (RC, BOL, POD → счёт брокеру).
  { id: 'docs', size: 'w' },
  { id: 'invoice', size: 'w' },
  { id: 'driver', size: 'l' },
  { id: 'queued', size: 'l' },
  { id: 'driver-info', size: 'l' },
  { id: 'facility-hints', size: 'l' },
  { id: 'backhaul', size: 'l' },
]

/** Карточка трака — по той же причине со всеми условными плитками в списке.
 *
 *  План «Порядок в TMS» (10/09/26): шапка с одной кнопкой «＋ Груз» → текущий груз →
 *  карта с историей пути → неделя картинками → вкладки «Грузы | Документы |
 *  Обслуживание». */
export const TRUCK_DETAIL_TILES: TilePlacement[] = [
  // Паспорт с фото, водитель, где сейчас и бак — и «＋ Груз».
  { id: 'hero', size: 'l' },
  // Во всю строку: задание бывает высоким (маршрут, даты, частичные грузы), и
  // маленькая плитка рядом с ним растягивалась на его высоту с одной цифрой внутри.
  { id: 'assignment', size: 'l' },
  { id: 'task', size: 'l' },
  { id: 'todos', size: 'l' },
  // Карта и история пути — одна плитка: это один ответ на «где он был и где он сейчас».
  { id: 'map', size: 'l' },
  { id: 'driver', size: 'l' },
  // Неделя трака одной строкой картинок вместо двенадцати маленьких плиток-цифр —
  // прямо над вкладкой «Грузы», где эти же грузы списком.
  { id: 'week', size: 'l' },
  // Грузы, бумаги и обслуживание — вкладками (components/truck-tabs.tsx).
  { id: 'tabs', size: 'l' },
]
