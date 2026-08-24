import 'server-only'

// Запрос маршрута с платными дорогами к HERE Routing v8. Разбор ответа и вся
// арифметика — в lib/tolls.ts, который поэтому проверяется тестами без сети.

import { hereKey } from './keys.ts'
import { getSetting, setSetting } from './settings.ts'
import { decodeFlexPolyline } from './flexpolyline.ts'
import { parseHereRoutes, type TollQuote, type TruckSpec } from './tolls.ts'

/** Чужая служба не должна держать наш ответ: без срока один зависший запрос
 * превращается в бесконечную загрузку страницы. 12 секунд — потолок, после
 * которого вызывающий получает отказ и работает без этих данных. */
async function fetchSoon(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(12000) })
}

/**
 * Жёсткий потолок обращений к HERE за календарный месяц.
 *
 * Тариф HERE — «freemium, pay as you grow»: бесплатный объём есть, но за его
 * пределом начинается счёт, а способ оплаты уже привязан. Лимита расходов в их
 * панели нет, поэтому защита от счёта — не галочка у них, а невозможность
 * превысить объём с нашей стороны.
 *
 * Откуда 400. Бесплатный объём Routing у HERE — 5000 запросов в месяц. Нигде не
 * сказано, считается ли маршрут с толлами за одну операцию или за несколько как
 * «продвинутый», поэтому берём запас впятеро: даже при множителе ×4 выйдет 1600
 * из 5000. Для парка на семь машин это всё равно с избытком — 400 проверок в
 * месяц это тринадцать в день, а маршрут под груз считают один раз.
 *
 * Счётчик живёт в settings по ключу с месяцем, поэтому обнуляется сам и не
 * требует ни крона, ни отдельной таблицы.
 */
const MONTHLY_CAP = 400

/** Кэш ответа. Цены на платных дорогах меняются раз в годы, а не в часы, и один
 * и тот же маршрут диспетчер открывает по многу раз — без кэша каждый его взгляд
 * стоил бы обращения из того же лимита. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function monthKey(): string {
  const d = new Date()
  return `here_calls:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Сколько обращений к HERE израсходовано в этом месяце и сколько осталось. */
export async function hereUsage(): Promise<{ used: number; cap: number }> {
  const used = Number((await getSetting(monthKey())) ?? 0)
  return { used: Number.isFinite(used) ? used : 0, cap: MONTHLY_CAP }
}

const LB_TO_KG = 0.45359237
const FT_TO_CM = 30.48

/**
 * Один маршрут: с платными дорогами или в объезд.
 *
 * Набор параметров намеренно скромный — только те, что описаны в документации
 * HERE. Соблазн добавить транспондеры, классы эмиссии и типы прицепа велик, но
 * непроверенный параметр здесь стоит дорого: HERE отвечает на него 400, и раздел
 * не работает целиком. Поэтому расширять этот список можно только после живой
 * проверки на боевом ключе.
 *
 * Текст ошибки от HERE возвращаем наружу как есть: если параметр всё же окажется
 * неверным, это будет видно на экране, а не в догадках.
 */
export async function hereTollRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  truck: TruckSpec,
  opts: {
    avoidTolls?: boolean
    /** Точки, через которые маршрут обязан пройти. Нужны там, где объехать
     * нельзя в принципе: мосты и туннели Нью-Йорка платные все до одного, и
     * «объезд» вокруг них — это лишняя сотня миль ради дороги, которой нет.
     * Задав такую точку руками, диспетчер оставляет неизбежное неизбежным, а
     * экономию ищет дальше по пути. */
    via?: { lat: number; lng: number }[]
    /** Момент выезда, ISO без зоны. Часть дорог тарифицируется по часу: в
     * Нью-Йорке и Чикаго пик дороже межпикового, и выехать на два часа позже
     * иногда дешевле, чем объезжать. Без него HERE считает по текущему времени. */
    departure?: string
  } = {},
): Promise<TollQuote[] | { error: string }> {
  const key = await hereKey()
  if (!key) return { error: 'no_key' }

  const params = new URLSearchParams({
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    transportMode: 'truck',
    return: 'summary,polyline,tolls',
    currency: 'USD',
    // Три маршрута по цене одного обращения: альтернативы приходят тем же
    // ответом, и кнопки «другой путь» не стоят ни цента месячной квоты.
    alternatives: '2',
    apiKey: key,
  })
  params.set('truck[axleCount]', String(truck.axles))
  params.set('vehicle[grossWeight]', String(Math.round(truck.grossWeightLb * LB_TO_KG)))
  params.set('vehicle[height]', String(Math.round(truck.heightFt * FT_TO_CM)))
  if (opts.avoidTolls) params.set('avoid[features]', 'tollRoad')
  // via повторяется столько раз, сколько точек: URLSearchParams.append, а не set.
  for (const v of opts.via ?? []) params.append('via', `${v.lat},${v.lng}`)
  if (opts.departure) params.set('departureTime', opts.departure)

  // Кэш проверяем ДО лимита: повторный взгляд на тот же маршрут не должен
  // расходовать месячную квоту.
  const cacheKey =
    `here:${from.lat.toFixed(3)},${from.lng.toFixed(3)}->${to.lat.toFixed(3)},${to.lng.toFixed(3)}` +
    `:${truck.axles}/${truck.grossWeightLb}/${truck.heightFt}` +
    `${opts.avoidTolls ? ':free' : ''}` +
    `${(opts.via ?? []).map((v) => `:${v.lat.toFixed(3)},${v.lng.toFixed(3)}`).join('')}` +
    `${opts.departure ? `:${opts.departure}` : ''}`
  const hit = await getSetting(cacheKey)
  if (hit) {
    try {
      const c = JSON.parse(hit) as { at: number; quotes: TollQuote[] }
      if (Date.now() - c.at < CACHE_TTL_MS && Array.isArray(c.quotes)) return c.quotes
    } catch {
      // разберём заново
    }
  }

  const { used, cap } = await hereUsage()
  if (used >= cap) return { error: 'monthly_cap' }

  try {
    // Счётчик увеличиваем ДО запроса, а не после: упавший ответ всё равно был
    // обращением, и считать надо по факту вызова, а не по факту удачи.
    await setSetting(monthKey(), String(used + 1))
    const res = await fetchSoon(`https://router.hereapi.com/v8/routes?${params}`, {
      headers: { accept: 'application/json' },
    })
    const json = (await res.json()) as unknown
    if (!res.ok) {
      const msg =
        (json as { title?: string; cause?: string; error_description?: string })?.cause ??
        (json as { title?: string })?.title ??
        `HTTP ${res.status}`
      return { error: msg }
    }
    const quotes = parseHereRoutes(json, decodeFlexPolyline, 'USD')
    // Пустой ответ — не ошибка сети, а «маршрута нет»: между точками может не быть
    // дороги, законной для трака заданной высоты и веса.
    if (quotes.length === 0) return { error: 'no_route' }
    await setSetting(cacheKey, JSON.stringify({ at: Date.now(), quotes }))
    return quotes
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' }
  }
}
