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

export interface TollFare {
  /** Название пункта или системы, как его пишет сама дорога. */
  name: string
  system: string
  country: string
  amount: number
  currency: string
  /** Транспондер, наличные, по почте — цена у них разная, и это не мелочь. */
  methods: string[]
}

export interface TollQuote {
  miles: number
  minutes: number
  coords: [number, number][]
  fares: TollFare[]
  total: number
  currency: string
}

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
      tollCollectionLocations?: { name?: string }[]
      fares?: {
        name?: string
        price?: { value?: number; currency?: string }
        convertedPrice?: { value?: number; currency?: string }
        paymentMethods?: string[]
      }[]
    }[]
  }[]
}

/** Способы оплаты, означающие транспондер (E-ZPass и родня). */
const TRANSPONDER = /transponder|ezpass|e-zpass|pass/i

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
  hasTransponder = false,
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

      // С транспондером берём тариф транспондера — он и дешевле, и это то, что
      // реально спишется. Без него берём САМЫЙ ДОРОГОЙ из оставшихся: ошибиться
      // в большую сторону безопасно (диспетчер заложил больше, чем заплатит),
      // в меньшую — нет.
      const byTransponder = hasTransponder
        ? options.find((o) => (o.f.paymentMethods ?? []).some((m) => TRANSPONDER.test(m)))
        : undefined
      const chosen =
        byTransponder ?? options.reduce((a, b) => (b.amount > a.amount ? b : a))

      const where = (toll.tollCollectionLocations ?? [])
        .map((l) => l.name?.trim())
        .filter(Boolean)
        .join(' → ')

      fares.push({
        name: where || chosen.f.name?.trim() || toll.tollSystem?.trim() || '—',
        system: toll.tollSystem?.trim() || '',
        country: toll.countryCode?.trim() || '',
        amount: chosen.amount,
        currency: chosen.currency,
        methods: chosen.f.paymentMethods ?? [],
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
