// Толлы в деньгах: сколько парк реально отдаёт платным дорогам и где мы их не
// посчитали вовсе.
//
// Расчёт по маршруту отвечает на вопрос «сколько будет стоить». Этот модуль — на
// другой: «сколько уже стоило». Пока толлы считались на глаз, они не попадали ни в
// чистую по рейсу, ни в счёт брокеру, и месячная сумма никогда не называлась вслух.
//
// Отдельно и намеренно выделены рейсы БЕЗ посчитанных толлов через платные штаты:
// пустое поле в такой строке — не ноль, а «мы не знаем», и чистая по такому рейсу
// завышена ровно на неизвестную сумму.

import { TOLL_STATES } from './toll-usa.ts'

export type TollLoad = {
  id: number
  rate: number
  /** Все мили рейса: гружёные плюс порожние. */
  miles: number
  /** Посчитанные толлы. null — не считали вовсе, это не то же самое, что ноль. */
  tolls: number | null
  origin: string | null
  destination: string | null
  status: string
  /** Дата пикапа (или заведения), ISO. */
  at: string | null
}

export type TollSpend = {
  /** Сумма толлов за период. */
  total: number
  /** Рейсов с посчитанными толлами. */
  counted: number
  /** Толлы на милю по всем таким рейсам. */
  perMile: number
  /** Какую долю гросса съели платные дороги, проценты. */
  shareOfGross: number
  /** Самые дорогие рейсы — с них и начинается разговор о маршруте. */
  top: TollLoad[]
  /** Через платные штаты, но толлы не посчитаны: скрытая дыра в прибыли. */
  missing: TollLoad[]
}

const TOLL_CODES = new Set(TOLL_STATES.map((s) => s.code))

/** Штат из названия города: «Dallas, TX» → TX. Единственный формат, в котором
 * города приходят и с бирж, и из рейт-конов. */
export function stateOfCity(city: string | null): string | null {
  const m = /,\s*([A-Za-z]{2})\b/.exec(city ?? '')
  return m ? m[1]!.toUpperCase() : null
}

/** Рейс идёт по платным штатам? Смотрим на концы маршрута: середины мы не знаем, а
 * концы — знаем всегда. Признак грубый и намеренно осторожный: он не утверждает,
 * что толлы были, он говорит «здесь их стоит проверить». */
export function looksTolled(l: TollLoad): boolean {
  const a = stateOfCity(l.origin)
  const b = stateOfCity(l.destination)
  return (a !== null && TOLL_CODES.has(a)) || (b !== null && TOLL_CODES.has(b))
}

export function tollSpend(rows: TollLoad[], days: number, nowMs: number): TollSpend {
  const from = nowMs - days * 86400000
  const live = rows.filter((l) => {
    if (l.status === 'cancelled' || l.status === 'quoted') return false
    if (!l.at) return false
    return Date.parse(`${l.at}T00:00:00`) >= from
  })

  const withTolls = live.filter((l) => l.tolls != null && l.tolls > 0)
  const total = withTolls.reduce((s, l) => s + (l.tolls ?? 0), 0)
  const miles = withTolls.reduce((s, l) => s + l.miles, 0)
  const gross = live.reduce((s, l) => s + l.rate, 0)

  return {
    total,
    counted: withTolls.length,
    perMile: miles > 0 ? total / miles : 0,
    shareOfGross: gross > 0 ? (total / gross) * 100 : 0,
    top: [...withTolls].sort((a, b) => (b.tolls ?? 0) - (a.tolls ?? 0)).slice(0, 5),
    missing: live.filter((l) => l.tolls == null && looksTolled(l)),
  }
}
