// Проверка ставки груза — чистый расчёт, без сети и базы (проверяется тестом).
//
// Главная цифра диспетчера — ставка за милю, поэтому ответ один на все места, где груз
// оценивают: страница груза, форма нового груза, распознанный рейт-кон, список грузов,
// бот Telegram и расширение на доске DAT. Данные собирает lib/rate-check.ts.
//
// Что в ответе и откуда:
// • цель торга — цена грузоотправителя (Warp) × доля трака, доля — по нашим рейт-конам
//   (по этому брокеру, если сравнений хватает), lib/broker-cut.ts;
// • рынок DAT по региону погрузки — и насколько ставка выше или ниже него;
// • регион выгрузки — чем платит следующий рейс, и насколько там легко найти груз
//   (грузов на трак), чтобы трак не застрял;
// • своя история по этим штатам — отдельной строкой и с подписью: это не рынок.

import { targetBand, vsTarget, type BrokerCut } from './broker-cut.ts'
import type { HeatLevel } from './dat-market-core.ts'

export type RateSide = { state: string; ratio: number; heat: HeatLevel }

export type RateCheck = {
  miles: number | null
  rate: number | null
  /** Ставка брокера за гружёную милю. */
  rpm: number | null
  /** То же с Deadhead до погрузки, если он известен. */
  allInRpm: number | null
  target: {
    /** Вилка торга, $/mi: от «сколько обычно достаётся траку» до «сколько брокер отдаст с трудом». */
    low: number
    high: number
    /** Та же вилка за рейс, $ — при известных милях. */
    lowTotal: number | null
    highTotal: number | null
    /** Цена грузоотправителя, $/mi — из неё брокер платит траку. */
    shipper: number
    /** Сколько брокер оставляет себе при нижней границе, $/mi и %. */
    brokerTake: number
    brokerPct: number
    /** По скольким нашим грузам посчитана доля и чья она (ключ брокера; null — общая). */
    n: number
    broker: string | null
    /** Ставка брокера против вилки. */
    verdict: 'below' | 'inside' | 'above' | null
    /** $ за рейс: сколько не хватает до вилки (below) или сколько сверх неё (above). */
    gap: number | null
    /** Сдвиг цены по маршруту за неделю, доля: 0.05 — на 5% дороже, чем неделей раньше. */
    wk: number | null
    /** Котировку взяли только что, а не из собранных за 30 дней. */
    live: boolean
  } | null
  /** Рынок DAT по региону погрузки и ставка против него, %. */
  dat: { region: string; rpm: number; diff: number | null; date: string | null } | null
  /** Регион выгрузки: чем платит следующий рейс оттуда. */
  destDat: { region: string; rpm: number } | null
  /** Сколько грузов на трак в штате погрузки и выгрузки (DAT) — легко ли там найти груз. */
  origin: RateSide | null
  dest: RateSide | null
  /** Наши грузы по этим штатам за полгода — своя история, не рынок. */
  history: { rpm: number; n: number } | null
}

const round2 = (v: number) => Math.round(v * 100) / 100

/** Собрать ответ из найденных цифр. Любая часть может отсутствовать — тогда её нет и в ответе. */
export function rateCheckFrom(p: {
  rate: number | null
  miles: number | null
  deadhead?: number | null
  shipper: number | null
  wk?: number | null
  live?: boolean
  cut: BrokerCut | null
  broker?: string | null
  dat: { region: string; rpm: number; date: string | null } | null
  destDat: { region: string; rpm: number } | null
  origin: RateSide | null
  dest: RateSide | null
  history: { rpm: number; n: number } | null
}): RateCheck {
  const miles = p.miles && p.miles > 0 ? p.miles : null
  const rate = p.rate && p.rate > 0 ? p.rate : null
  const rpm = rate && miles ? rate / miles : null
  const dh = p.deadhead && p.deadhead > 0 ? p.deadhead : 0
  const allInRpm = rate && miles && dh ? rate / (miles + dh) : null

  let target: RateCheck['target'] = null
  const band = p.shipper && p.cut ? targetBand(p.shipper, p.cut, p.broker) : null
  if (band && p.shipper) {
    const verdict = rpm ? vsTarget(rpm, band) : null
    const gap =
      rpm && miles && verdict === 'below'
        ? Math.round((band.low - rpm) * miles)
        : rpm && miles && verdict === 'above'
          ? Math.round((rpm - band.high) * miles)
          : null
    target = {
      low: round2(band.low),
      high: round2(band.high),
      lowTotal: miles ? Math.round(band.low * miles) : null,
      highTotal: miles ? Math.round(band.high * miles) : null,
      shipper: round2(p.shipper),
      brokerTake: round2(p.shipper - band.low),
      brokerPct: Math.round((1 - band.low / p.shipper) * 100),
      n: band.n,
      broker: band.broker,
      verdict,
      gap,
      wk: p.wk ?? null,
      live: !!p.live,
    }
  }

  return {
    miles,
    rate,
    rpm: rpm ? round2(rpm) : null,
    allInRpm: allInRpm ? round2(allInRpm) : null,
    target,
    dat: p.dat ? { ...p.dat, diff: rpm ? Math.round(((rpm - p.dat.rpm) / p.dat.rpm) * 100) : null } : null,
    destDat: p.destDat,
    origin: p.origin,
    dest: p.dest,
    history: p.history && p.history.n > 0 ? { rpm: round2(p.history.rpm), n: p.history.n } : null,
  }
}
