// Скриншот доски грузов (DAT и другие) → строки поля «Сравнить грузы с доски» в
// «Куда отправить трак» (components/route-planner.tsx, формат — parseBoardLoads).
//
// Модель только читает картинку. Что считать грузом, решается здесь и проверяется
// тестом: без штата США доставки и без миль груз не посчитать, а ставка дешевле $0.30
// или дороже $15 за милю — не ставка, а ошибка чтения (так бот однажды показал
// $22.20/mi, склеив две цифры). На её место встаёт «?»: груз посчитается по рынку DAT,
// а настоящую цифру диспетчер впишет после звонка брокеру.

import { US_STATES } from './us-states.ts'
import { stateFromPlace } from './dat-market-core.ts'

export const BOARD_SHOT_PROMPT = `You are reading a screenshot of a US truckload LOAD BOARD (DAT One, DAT Power, Truckstop, 123Loadboard or similar): either one load's detail view or a list of search results. Extract every load that is fully visible. Only facts printed on the screen — never guess; null when a value is not shown.

For each load:
- origin = the pickup place as printed, "City, ST" with the two-letter state or province code.
- destination = the delivery place as printed, "City, ST".
- tripMiles = the LOADED trip distance between origin and destination: the "Trip" column, or "139 mi" next to the route. Never a deadhead number.
- deadheadMiles = empty miles from the searcher's location to the pickup: the "DH-O" column, or the number in parentheses right after the origin in a detail view, e.g. "W Sacramento, CA (102)" -> 102. Never DH-D (deadhead after delivery). null if not shown.
- rate = the TOTAL dollars offered for the load ("$1,000" -> 1000). null when the rate shows "–", "—", is blank or hidden. Never a market estimate ("MARKET RATES", "RateView", "Rates are not available", "GET RATES" are DAT's market panel, not the load's rate) and never a per-mile figure.
- ratePerMile = the load's own per-mile rate, only when the board prints one and no total; otherwise null.
- company = the broker / poster company name as printed.
- pickupDate = the pickup date as MM/DD digits; convert month names in any language ("Sep 14" -> "09/14", "сент. 14" -> "09/14"). null if not shown.

One entry per load, in the order shown. Skip header rows, ads, cut-off rows and rows whose origin or destination is hidden. If the image is not a load board, return an empty list.`

/** Gemini responseSchema (подмножество OpenAPI, типы заглавными — как AI_SCHEMA рейт-кона). */
export const BOARD_SHOT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    loads: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          origin: { type: 'STRING', nullable: true },
          destination: { type: 'STRING', nullable: true },
          tripMiles: { type: 'NUMBER', nullable: true },
          deadheadMiles: { type: 'NUMBER', nullable: true },
          rate: { type: 'NUMBER', nullable: true },
          ratePerMile: { type: 'NUMBER', nullable: true },
          company: { type: 'STRING', nullable: true },
          pickupDate: { type: 'STRING', nullable: true },
        },
        required: ['origin', 'destination', 'tripMiles', 'rate'],
      },
    },
  },
  required: ['loads'],
}

export type BoardShotLoad = {
  origin?: string | null
  destination?: string | null
  tripMiles?: number | null
  deadheadMiles?: number | null
  rate?: number | null
  ratePerMile?: number | null
  company?: string | null
  pickupDate?: string | null
}

export type BoardShotAnswer = { loads?: BoardShotLoad[] | null }

const US = new Set(US_STATES.map(([code]) => code))
const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN)

/**
 * Ответ модели → строки «ШТАТ МИЛИ СТАВКА [ПОРОЖНИЙ] · подпись» для поля сравнения.
 * `skipped` — сколько грузов модель нашла, но посчитать их нельзя: доставка не в штат
 * США (Канада, Мексика) или миль на скриншоте нет.
 */
export function boardShotLines(answer: BoardShotAnswer | null): { lines: string[]; skipped: number } {
  const lines: string[] = []
  let skipped = 0
  for (const l of answer?.loads ?? []) {
    const origin = clean(l?.origin)
    const destination = clean(l?.destination)
    const state = stateFromPlace(destination)
    const miles = Math.round(num(l?.tripMiles))
    if (!state || !US.has(state) || !(miles > 0 && miles <= 6000)) {
      skipped++
      continue
    }
    let rate = num(l.rate)
    if (!(rate > 0)) rate = num(l.ratePerMile) * miles
    // Груза дешевле $20 не бывает: в поле суммы попала ставка за милю.
    else if (rate < 20) rate *= miles
    rate = Math.round(rate)
    const rpm = rate / miles
    const deadhead = Math.round(num(l.deadheadMiles))
    const label = [[origin, destination].filter(Boolean).join(' → '), clean(l.company), clean(l.pickupDate)]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 100)
    lines.push(
      [state, miles, rpm >= 0.3 && rpm <= 15 ? rate : '?', deadhead >= 0 && deadhead <= 1000 ? deadhead : null, label ? `· ${label}` : null]
        .filter((x) => x !== null)
        .join(' '),
    )
  }
  return { lines, skipped }
}
