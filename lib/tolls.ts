/**
 * Платные дороги: разбор ответа HERE Routing v8 и профиль трака.
 *
 * Чистый модуль — без сети и без ключей, чтобы его можно было проверять тестами.
 * Сам запрос живёт в lib/tolls-here.ts.
 *
 * Почему HERE, а не «как у всех». Отраслевой стандарт — TollGuru, но постоянного
 * бесплатного тарифа у него нет: две недели пробы, дальше от $80 в месяц. OSM
 * знает, ГДЕ платная дорога, но не знает цены, а публичный OSRM вдобавок не умеет
 * их объезжать — проверено, `exclude=toll` он отвергает. HERE Routing v8 считает
 * толлы для тракового профиля и отдаёт бесплатный лимит, которого парку на семь
 * машин хватает с многократным запасом.
 */

/** Габариты и вес трака — от них зависит и цена, и сама допустимость дороги. */
export interface TruckSpec {
  /** Осей всего: тягач + прицеп. Пятиосный сцеп — типовой случай. */
  axles: number
  /** Полная масса, фунты. */
  grossWeightLb: number
  /** Высота, футы. */
  heightFt: number
}

export const DEFAULT_TRUCK: TruckSpec = { axles: 5, grossWeightLb: 80_000, heightFt: 13.6 }

export interface TollPoint {
  name: string
  lat: number
  lng: number
}

export interface TollFare {
  /** Название пункта или системы, как его пишет сама дорога. */
  name: string
  system: string
  country: string
  amount: number
  currency: string
  /** Транспондер, наличные, по почте — цена у них разная, и это не мелочь. */
  methods: string[]
  /** Где физически стоят рамки этого платежа. HERE их присылает, и раньше мы их
   * выбрасывали — а это единственное, что превращает список сумм в карту: по ним
   * ставятся метки и по щелчку строки карта летит к нужной рамке. */
  points: TollPoint[]
}

export interface TollQuote {
  miles: number
  minutes: number
  coords: [number, number][]
  fares: TollFare[]
  total: number
  currency: string
}

/** Вариант маршрута — та же поездка, посчитанная другим путём. */
export interface RouteOption extends TollQuote {
  /** Устойчивый ключ для React и для выбора варианта. */
  id: string
  /** Откуда взялся: обычный маршрут, его альтернатива или попытка объехать платные. */
  source: 'main' | 'alt' | 'avoid'
  /** Толлы ПЛЮС цена пробега — то, во что поездка обойдётся целиком. Сравнивать
   * варианты по одним толлам бессмысленно: самый дешёвый по толлам обычно самый
   * длинный, и разница уходит в топливо. */
  totalCost: number
  /** Короткие ярлыки: «дешевле всего», «быстрее», «меньше платных». */
  badges: OptionBadge[]
}

export type OptionBadge = 'cheapest' | 'fastest' | 'shortest' | 'leastTolls'

/** Форма ответа HERE — ровно те поля, которые мы читаем. */
interface HereRoute {
  sections?: {
    summary?: { length?: number; duration?: number }
    polyline?: string
    tolls?: {
      countryCode?: string
      tollSystem?: string
      /** Физические пункты оплаты этой группы. Их имена куда полезнее названия
       * системы: на одном маршруте «PA TURNPIKE 476» повторяется четырежды, а
       * «Tredyffrin Twp → Monroeville» сразу говорит, где именно платят. */
      tollCollectionLocations?: { name?: string; location?: { lat?: number; lng?: number } }[]
      fares?: {
        name?: string
        price?: { value?: number; currency?: string }
        convertedPrice?: { value?: number; currency?: string }
        paymentMethods?: string[]
      }[]
    }[]
  }[]
}



const METERS_TO_MILES = 0.000621371

/**
 * Ответ HERE → одна поездка.
 *
 * Секций в маршруте может быть несколько (HERE режет его на участки), поэтому
 * длина, время и толлы складываются по всем, а не берутся из первой.
 *
 * Цену берём из convertedPrice, когда он есть: HERE отдаёт местную валюту в
 * price, а пересчёт в запрошенную — в convertedPrice. На канадском участке
 * маршрута иначе сложились бы доллары США с канадскими в одну сумму.
 */
export function parseHereRoute(
  json: unknown,
  decodePolyline: (s: string) => [number, number][],
  wantCurrency = 'USD',
): TollQuote | null {
  const route = (json as { routes?: HereRoute[] })?.routes?.[0]
  if (!route?.sections?.length) return null

  let meters = 0
  let seconds = 0
  const coords: [number, number][] = []
  const fares: TollFare[] = []

  for (const s of route.sections) {
    meters += s.summary?.length ?? 0
    seconds += s.summary?.duration ?? 0
    if (s.polyline) coords.push(...decodePolyline(s.polyline))

    // Элемент tolls — это ОДИН пункт (или отрезок) оплаты, а fares внутри него —
    // альтернативы по способу оплаты за один и тот же проезд, а не отдельные
    // платежи. Складывать их было бы двойным счётом: на живом маршруте
    // Филадельфия — Питтсбург так набежало бы вчетверо больше настоящего.
    // Складываем ГРУППЫ, а внутри группы выбираем один тариф.
    for (const toll of s.tolls ?? []) {
      const options = (toll.fares ?? [])
        .map((f) => {
          const priced = f.convertedPrice?.currency === wantCurrency ? f.convertedPrice : f.price
          return { f, amount: priced?.value, currency: priced?.currency || wantCurrency }
        })
        .filter((o): o is { f: NonNullable<typeof o.f>; amount: number; currency: string } =>
          typeof o.amount === 'number',
        )
      if (options.length === 0) continue

      // Берём САМЫЙ ДОРОГОЙ из вариантов оплаты. Раздел отвечает на вопрос
      // «сколько будет стоить проезд», и ошибиться в большую сторону безопасно:
      // диспетчер заложил больше, чем спишется. Ошибка вниз — это груз, взятый
      // по ставке, которая не окупается.
      const chosen = options.reduce((a, b) => (b.amount > a.amount ? b : a))

      const locations = toll.tollCollectionLocations ?? []
      const where = locations
        .map((l) => l.name?.trim())
        .filter(Boolean)
        .join(' → ')
      const points: TollPoint[] = locations
        .filter((l) => typeof l.location?.lat === 'number' && typeof l.location?.lng === 'number')
        .map((l) => ({ name: l.name?.trim() || '', lat: l.location!.lat!, lng: l.location!.lng! }))

      fares.push({
        name: where || chosen.f.name?.trim() || toll.tollSystem?.trim() || '—',
        system: toll.tollSystem?.trim() || '',
        country: toll.countryCode?.trim() || '',
        amount: chosen.amount,
        currency: chosen.currency,
        methods: chosen.f.paymentMethods ?? [],
        points,
      })
    }
  }

  return {
    miles: Math.round(meters * METERS_TO_MILES),
    minutes: Math.round(seconds / 60),
    coords,
    fares,
    total: Math.round(fares.reduce((s, f) => s + f.amount, 0) * 100) / 100,
    currency: wantCurrency,
  }
}

/**
 * Сравнение «через платные» и «в объезд».
 *
 * Объезд имеет смысл не всегда: лишние мили жгут топливо, лишние часы — это часы
 * водителя, которых по HOS ровно одиннадцать. Поэтому считаем не «сколько сэкономим
 * на толлах», а сколько стоит объезд целиком — с топливом и с оплатой водителя.
 */
export interface TollComparison {
  /** Экономия на самих платных дорогах, доллары. */
  tollsSaved: number
  /** Лишние мили объезда и во что они обходятся по топливу и водителю. */
  extraMiles: number
  extraMinutes: number
  extraCost: number
  /** Итог: положительный — объезд выгоден, отрицательный — дороже. */
  net: number
}

export function compareRoutes(
  withTolls: TollQuote,
  avoiding: TollQuote,
  costPerMile: number,
): TollComparison {
  const tollsSaved = withTolls.total - avoiding.total
  const extraMiles = avoiding.miles - withTolls.miles
  const extraMinutes = avoiding.minutes - withTolls.minutes
  const extraCost = Math.round(extraMiles * costPerMile * 100) / 100
  return {
    tollsSaved: Math.round(tollsSaved * 100) / 100,
    extraMiles,
    extraMinutes,
    extraCost,
    net: Math.round((tollsSaved - extraCost) * 100) / 100,
  }
}


/**
 * Все варианты маршрута из одного ответа HERE.
 *
 * `alternatives=2` возвращает до трёх маршрутов за ОДИН запрос — то есть кнопки
 * «другой путь» не стоят ни одного обращения сверх уже потраченного. Раньше
 * читался только первый, и два готовых варианта просто выбрасывались.
 */
export function parseHereRoutes(
  json: unknown,
  decodePolyline: (s: string) => [number, number][],
  wantCurrency = 'USD',
): TollQuote[] {
  const routes = (json as { routes?: unknown[] })?.routes ?? []
  const out: TollQuote[] = []
  for (const r of routes) {
    const q = parseHereRoute({ routes: [r] }, decodePolyline, wantCurrency)
    if (q) out.push(q)
  }
  return out
}

/**
 * Приводит варианты к сравнимому виду и вешает ярлыки.
 *
 * Ранжируем по ПОЛНОЙ стоимости — толлы плюс цена пробега, — а не по одним
 * толлам: маршрут с наименьшими толлами почти всегда самый длинный, и вся
 * экономия уходит в топливо и часы водителя. Именно на этом основан весь смысл
 * раздела, поэтому «дешевле всего» считается по сумме, а не по одной её половине.
 *
 * Одинаковые по расстоянию и деньгам варианты отбрасываются: три кнопки с одним
 * и тем же ответом — это не выбор, а шум.
 */
export function rankOptions(
  raw: { quote: TollQuote; source: RouteOption['source'] }[],
  costPerMile: number,
): RouteOption[] {
  const seen = new Set<string>()
  const options: RouteOption[] = []
  for (const [i, r] of raw.entries()) {
    const key = `${r.quote.miles}:${r.quote.total.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    options.push({
      ...r.quote,
      id: `${r.source}-${i}`,
      source: r.source,
      totalCost: Math.round((r.quote.total + r.quote.miles * costPerMile) * 100) / 100,
      badges: [],
    })
  }
  if (options.length === 0) return []

  const best = <K extends keyof RouteOption>(field: K, badge: OptionBadge) => {
    const winner = options.reduce((a, b) => ((b[field] as number) < (a[field] as number) ? b : a))
    winner.badges.push(badge)
  }
  best('totalCost', 'cheapest')
  best('minutes', 'fastest')
  best('miles', 'shortest')
  best('total', 'leastTolls')
  return options.sort((a, b) => a.totalCost - b.totalCost)
}
