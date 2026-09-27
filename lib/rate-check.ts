// Проверка ставки груза — сбор цифр. Расчёт — lib/rate-check-core.ts (под тестом).
//
// Одна функция на все места, где груз оценивают: страница груза, форма нового груза,
// распознанный рейт-кон, список грузов, а снаружи — бот Telegram и расширение на доске DAT
// через app/api/rate-check. Разные места показывают одинаковые цифры, потому что берут их
// отсюда.

import { sql } from '@/lib/db'
import { brokerCutFromLoads, laneRpmTables } from '@/lib/dat-lanes'
import { datCached } from '@/lib/dat-market'
import { datEquipment, heatLevel, ltMedian, ltOf, regionOf, regionStates, stateFromPlace, type DatSnapshot } from '@/lib/dat-market-core'
import { WARP_MIN_MILES } from '@/lib/rpm-bench-core'
import { warpQuote, zipOfCity } from '@/lib/warp-quote'
import { usDate } from '@/lib/fmt'
import { todayEt } from '@/lib/payments'
import { rateCheckFrom, type RateCheck, type RateSide } from '@/lib/rate-check-core'

export type { RateCheck } from '@/lib/rate-check-core'

export type RateCheckInput = {
  /** «City, ST» — можно с индексом в конце. */
  origin: string | null
  dest: string | null
  originZip?: string | null
  destZip?: string | null
  miles: number | null
  rate: number | null
  equipment?: string | null
  broker?: string | null
  deadhead?: number | null
}

type Company = 'default' | 'demo'

const regionTitle = (code: string) => code.charAt(0) + code.slice(1).toLowerCase()

function side(snap: DatSnapshot | null, state: string | null): RateSide | null {
  if (!snap || !state) return null
  const lt = ltOf(snap, state)
  return lt ? { state, ratio: lt.ratio, heat: heatLevel(ltMedian(snap), lt.ratio) } : null
}

/** Наши грузы между этими штатами за полгода: средняя $/mi и сколько их было. */
async function ownLane(companyId: Company, from: string | null, to: string | null): Promise<{ rpm: number; n: number } | null> {
  if (!from || !to) return null
  const rows = (await sql`
    SELECT SUM(rate) AS rate, SUM(loaded_miles) AS miles, COUNT(*) AS n
    FROM loads
    WHERE company_id = ${companyId} AND status <> 'cancelled' AND loaded_miles > 100 AND rate > 0
      AND pickup_date >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
      AND UPPER(RIGHT(origin, 2)) = ${from} AND UPPER(RIGHT(destination, 2)) = ${to}`) as {
    rate: number | string | null
    miles: number | string | null
    n: number | string
  }[]
  const rate = Number(rows[0]?.rate ?? 0)
  const miles = Number(rows[0]?.miles ?? 0)
  return rate > 0 && miles > 0 ? { rpm: rate / miles, n: Number(rows[0]?.n ?? 0) } : null
}

/**
 * Котировка Warp по паре городов → строка dat_lanes (source='warp', как ночной сбор).
 * Коды ошибок, а не текст: слова подставляет тот, кто показывает (app/actions.ts).
 */
export async function recordWarpLane(
  companyId: Company,
  fromCity: string,
  toCity: string,
  miles: number,
  zips: { from?: string | null; to?: string | null } = {},
): Promise<{ rpm: number } | { error: 'noRoute' | 'tooShort' | 'noZipFrom' | 'noZipTo' | 'fail'; detail?: string }> {
  const from = stateFromPlace(fromCity)
  const to = stateFromPlace(toCity)
  if (!from || !to || !(miles > 0)) return { error: 'noRoute' }
  // Короче этого цена Warp — минимальная подача: делить её на мили нельзя.
  if (miles < WARP_MIN_MILES) return { error: 'tooShort' }
  const [oz, dz] = await Promise.all([zips.from || zipOfCity(fromCity), zips.to || zipOfCity(toCity)])
  if (!oz) return { error: 'noZipFrom' }
  if (!dz) return { error: 'noZipTo' }
  let price: number
  try {
    price = await warpQuote(oz, dz)
  } catch (e) {
    return { error: 'fail', detail: e instanceof Error ? e.message : String(e) }
  }
  const rate = Math.round(price)
  const m = Math.round(miles)
  await sql`
    INSERT INTO dat_lanes (company_id, source, origin, dest, origin_state, dest_state, equipment, miles, spot_rate, spot_rpm, seen_on, seen_at)
    VALUES (${companyId}, 'warp', ${fromCity.slice(0, 120)}, ${toCity.slice(0, 120)}, ${from}, ${to}, 'VAN', ${m}, ${rate}, ${rate / m}, CURDATE(), NOW(6))
    ON DUPLICATE KEY UPDATE miles = VALUES(miles), spot_rate = VALUES(spot_rate), spot_rpm = VALUES(spot_rpm), seen_at = NOW(6)`
  return { rpm: rate / m }
}

/**
 * Цель торга для списка грузов разом: котировки и доли — одним заходом на весь список,
 * Warp не спрашиваем. Цель — по котировкам за последние 30 дней, поэтому сравнивать с ней
 * имеет смысл только открытые грузы; какие — решает вызывающий.
 */
export async function laneTargets(
  loads: { id: number; origin: string | null; destination: string | null; rate: number; loadedMiles: number; brokerName: string | null; equipment: string }[],
  market: Company,
): Promise<Map<number, Pick<RateCheck, 'rpm' | 'target'>>> {
  const out = new Map<number, Pick<RateCheck, 'rpm' | 'target'>>()
  if (!loads.length) return out
  const [warp, cut] = await Promise.all([
    laneRpmTables(market, 'warp').catch(() => ({}) as Awaited<ReturnType<typeof laneRpmTables>>),
    brokerCutFromLoads(market).catch(() => null),
  ])
  if (!cut) return out
  for (const l of loads) {
    const from = stateFromPlace(l.origin)
    const to = stateFromPlace(l.destination)
    const lane = from && to ? warp[datEquipment(l.equipment) ?? 'VAN']?.lane[`${from}>${to}`] : undefined
    if (!lane) continue
    const r = rateCheckFrom({
      rate: l.rate,
      miles: l.loadedMiles,
      shipper: lane.rpm,
      wk: lane.wk,
      cut,
      broker: l.brokerName,
      dat: null,
      destDat: null,
      origin: null,
      dest: null,
      history: null,
    })
    if (r.target) out.set(l.id, { rpm: r.rpm, target: r.target })
  }
  return out
}

/** «Fresno, CA 93722» → «Fresno, CA»: для котировки и подписи нужен город со штатом. */
function cityOnly(place: string | null): string | null {
  const m = /^(.*?,\s*[A-Za-z]{2})\b/.exec((place ?? '').trim())
  return m ? m[1]!.trim() : null
}
const zipIn = (place: string | null) => /\b(\d{5})(?:-\d{4})?\s*$/.exec((place ?? '').trim())?.[1] ?? null

/**
 * Проверка ставки. `market` — чьи собранные котировки и доли брать (демо смотрит рынок
 * основной компании, своих котировок у него почти нет). `live` — можно ли спросить Warp
 * прямо сейчас, если за 30 дней по маршруту ничего не собрано (демо — нельзя: без входа
 * любой гонял бы чужой сервис и писал в базу).
 */
export async function rateCheck(input: RateCheckInput, opts: { market: Company; live: boolean }): Promise<RateCheck> {
  const eq = datEquipment(input.equipment) ?? 'VAN'
  const fromCity = cityOnly(input.origin)
  const toCity = cityOnly(input.dest)
  const from = stateFromPlace(input.origin)
  const to = stateFromPlace(input.dest)
  const miles = input.miles && input.miles > 0 ? input.miles : null

  const [snap, warp, cut, history] = await Promise.all([
    datCached(eq).catch(() => null),
    laneRpmTables(opts.market, 'warp').catch(() => ({}) as Awaited<ReturnType<typeof laneRpmTables>>),
    brokerCutFromLoads(opts.market).catch(() => null),
    ownLane(opts.market, from, to).catch(() => null),
  ])

  let lane = from && to ? warp[eq]?.lane[`${from}>${to}`] : undefined
  let shipper: number | null = lane?.rpm ?? null
  let live = false
  // Нет котировок по маршруту — спрашиваем Warp сейчас (только Van: у Warp других прицепов нет).
  if (!shipper && opts.live && eq === 'VAN' && fromCity && toCity && miles && miles >= WARP_MIN_MILES) {
    const res = await recordWarpLane(opts.market, fromCity, toCity, miles, {
      from: input.originZip || zipIn(input.origin),
      to: input.destZip || zipIn(input.dest),
    }).catch(() => null)
    if (res && 'rpm' in res) {
      shipper = res.rpm
      live = true
      lane = undefined
    }
  }

  const o = snap && from ? regionOf(snap, from) : null
  const d = snap && to ? regionOf(snap, to) : null
  return rateCheckFrom({
    rate: input.rate,
    miles,
    deadhead: input.deadhead,
    shipper,
    wk: lane?.wk ?? null,
    live,
    cut,
    broker: input.broker,
    dat: o ? { region: regionTitle(o.code), rpm: o.rpm, date: snap ? usDate(todayEt(new Date(snap.at))) : null } : null,
    destDat: d && snap ? { region: regionTitle(d.code), rpm: d.rpm, states: regionStates(snap, d.states).best.map((r) => r.code) } : null,
    origin: side(snap, from),
    dest: side(snap, to),
    history,
  })
}
