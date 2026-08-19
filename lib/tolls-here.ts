import 'server-only'

// Запрос маршрута с платными дорогами к HERE Routing v8. Разбор ответа и вся
// арифметика — в lib/tolls.ts, который поэтому проверяется тестами без сети.

import { hereKey } from './keys.ts'
import { getSetting, setSetting } from './settings.ts'
import { decodeFlexPolyline } from './flexpolyline.ts'
import { parseHereRoute, type TollQuote, type TruckSpec } from './tolls.ts'

/**
 * Жёсткий потолок обращений к HERE за календарный месяц.
 *
 * Тариф HERE — «freemium, pay as you grow»: бесплатный объём есть, но за его
 * пределом начинается счёт, а карта или PayPal уже привязаны. Значит защита от
 * счёта — не галочка в их панели (её там нет), а невозможность превысить объём с
 * нашей стороны. Тысяча запросов в месяц — это заведомо меньше любого их
 * бесплатного уровня и заведомо больше, чем нужно парку на семь машин: даже по
 * два маршрута на каждый груз это сотни звонков в месяц, а не тысячи.
 *
 * Счётчик живёт в settings по ключу с месяцем, поэтому обнуляется сам и не
 * требует ни крона, ни отдельной таблицы.
 */
const MONTHLY_CAP = 1000

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
  opts: { avoidTolls?: boolean; transponder?: boolean } = {},
): Promise<TollQuote | { error: string }> {
  const key = await hereKey()
  if (!key) return { error: 'no_key' }

  const params = new URLSearchParams({
    origin: `${from.lat},${from.lng}`,
    destination: `${to.lat},${to.lng}`,
    transportMode: 'truck',
    return: 'summary,polyline,tolls',
    currency: 'USD',
    apiKey: key,
  })
  params.set('truck[axleCount]', String(truck.axles))
  params.set('vehicle[grossWeight]', String(Math.round(truck.grossWeightLb * LB_TO_KG)))
  params.set('vehicle[height]', String(Math.round(truck.heightFt * FT_TO_CM)))
  if (opts.avoidTolls) params.set('avoid[features]', 'tollRoad')
  // ponytail: параметр принимается (HTTP 200), но на живом ответе тариф не менялся —
  // HERE всё равно вернул videoToll. Точное имя набора транспондеров в их
  // документации не описано, поэтому скидку E-ZPass пока считаем сами, выбирая
  // тариф транспондера из вариантов, которые HERE и так присылает.
  if (opts.transponder) params.set('tolls[transponders]', 'EZPass')

  // Кэш проверяем ДО лимита: повторный взгляд на тот же маршрут не должен
  // расходовать месячную квоту.
  const cacheKey =
    `here:${from.lat.toFixed(3)},${from.lng.toFixed(3)}->${to.lat.toFixed(3)},${to.lng.toFixed(3)}` +
    `:${truck.axles}/${truck.grossWeightLb}/${truck.heightFt}` +
    `${opts.avoidTolls ? ':free' : ''}${opts.transponder ? ':tag' : ''}`
  const hit = await getSetting(cacheKey)
  if (hit) {
    try {
      const c = JSON.parse(hit) as { at: number; quote: TollQuote }
      if (Date.now() - c.at < CACHE_TTL_MS) return c.quote
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
    const res = await fetch(`https://router.hereapi.com/v8/routes?${params}`, {
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
    const quote = parseHereRoute(json, decodeFlexPolyline, 'USD', opts.transponder ?? false)
    // Пустой ответ — не ошибка сети, а «маршрута нет»: между точками может не быть
    // дороги, законной для трака заданной высоты и веса.
    if (!quote) return { error: 'no_route' }
    await setSetting(cacheKey, JSON.stringify({ at: Date.now(), quote }))
    return quote
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'network error' }
  }
}
