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
import type { NextState } from './route-plan-core.ts'

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
  /** Регион выгрузки: чем платит следующий рейс оттуда; states — его горячие штаты (DAT /lt), куда дальше. */
  destDat: { region: string; rpm: number; states?: string[] } | null
  /** Сколько грузов на трак в штате погрузки и выгрузки (DAT) — легко ли там найти груз. */
  origin: RateSide | null
  dest: RateSide | null
  /** Наши грузы по этим штатам за полгода — своя история, не рынок. */
  history: { rpm: number; n: number } | null
  /** Куда лучше везти следующий груз из штата выгрузки: на день (400–700 mi) и на 2–3 дня. */
  next: { day: NextState[]; long: NextState[] } | null
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
  destDat: { region: string; rpm: number; states?: string[] } | null
  origin: RateSide | null
  dest: RateSide | null
  history: { rpm: number; n: number } | null
  next?: RateCheck['next']
}): RateCheck {
  const band = p.shipper && p.cut ? targetBand(p.shipper, p.cut, p.broker) : null
  // Вилка — в центах, как её видит диспетчер; всё за рейс считается уже от неё, чтобы
  // «$2.61 × 1,997 mi» у него на калькуляторе сходилось с тем, что написано.
  const low = band ? round2(band.low) : 0
  const base: RateCheck = {
    miles: null,
    rate: null,
    rpm: null,
    allInRpm: null,
    target:
      band && p.shipper
        ? {
            low,
            high: round2(band.high),
            lowTotal: null,
            highTotal: null,
            shipper: round2(p.shipper),
            brokerTake: round2(p.shipper - low),
            brokerPct: Math.round((1 - low / p.shipper) * 100),
            n: band.n,
            broker: band.broker,
            verdict: null,
            gap: null,
            wk: p.wk ?? null,
            live: !!p.live,
          }
        : null,
    dat: p.dat ? { ...p.dat, diff: null } : null,
    destDat: p.destDat,
    origin: p.origin,
    dest: p.dest,
    history: p.history && p.history.n > 0 ? { rpm: round2(p.history.rpm), n: p.history.n } : null,
    next: p.next && (p.next.day.length || p.next.long.length) ? p.next : null,
  }
  return withRate(base, p.rate, p.miles, p.deadhead)
}

/**
 * Ставка и мили к готовой проверке: вердикт, недобор за рейс и сравнение с рынком
 * пересчитываются, остальное как было. Отдельно — для страницы груза из бота: ставка
 * там живёт только в браузере, на сервер уходят одни города.
 */
export function withRate(rc: RateCheck, rate: number | null, miles: number | null, deadhead?: number | null): RateCheck {
  const m = miles && miles > 0 ? miles : null
  const r = rate && rate > 0 ? rate : null
  const rpm = r && m ? r / m : null
  const dh = deadhead && deadhead > 0 ? deadhead : 0
  const tg = rc.target
  const verdict = tg && rpm ? vsTarget(rpm, tg) : null
  return {
    ...rc,
    miles: m,
    rate: r,
    rpm: rpm ? round2(rpm) : null,
    allInRpm: r && m && dh ? round2(r / (m + dh)) : null,
    target: tg && {
      ...tg,
      lowTotal: m ? Math.round(tg.low * m) : null,
      highTotal: m ? Math.round(tg.high * m) : null,
      verdict,
      gap:
        rpm && m && verdict === 'below'
          ? Math.round((tg.low - rpm) * m)
          : rpm && m && verdict === 'above'
            ? Math.round((rpm - tg.high) * m)
            : null,
    },
    dat: rc.dat && { ...rc.dat, diff: rpm ? Math.round(((rpm - rc.dat.rpm) / rc.dat.rpm) * 100) : null },
  }
}
