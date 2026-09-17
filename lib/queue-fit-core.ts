/**
 * Успеет ли трак на следующий пикап. Сравниваем два момента: когда он освободится на
 * текущем грузе (сейчас + сколько ехать + разгрузка) плюс Deadhead до нового пикапа — и
 * когда пикап закрывается. Раньше очередь сравнивала только ДАТЫ: «пикап 09/18, выгрузка
 * 09/18» считалось нормой, хотя между ними полстраны.
 *
 * Всё в минутах, время — мс. Нет данных (нет ETA или даты пикапа) — null, строки нет:
 * догадки тут вреднее молчания.
 */
export type QueueFit = {
  /** На сколько минут не успевает; 0 и меньше — успевает с запасом. */
  lateMin: number
  /** Запас в минутах, когда успевает. */
  slackMin: number
}

/** Сколько стоим под выгрузкой, прежде чем ехать дальше. */
const UNLOAD_MIN = 90
/** Средняя скорость с учётом остановок — та же, что в оценке Deadhead по дорогам. */
const MPH = 50

export function queueFit(opts: {
  nowMs: number
  /** Минут до выгрузки текущего груза (из карты груза); null — не считаем. */
  etaMin: number | null
  /** Deadhead до нового пикапа, мили; null — считаем как 0, это оценка снизу. */
  deadheadMi: number | null
  /** Когда пикап закрывается, мс; null — не считаем. */
  pickupEndMs: number | null
}): QueueFit | null {
  const { nowMs, etaMin, deadheadMi, pickupEndMs } = opts
  if (etaMin == null || pickupEndMs == null) return null
  const readyMs = nowMs + (etaMin + UNLOAD_MIN + ((deadheadMi ?? 0) / MPH) * 60) * 60_000
  const diffMin = Math.round((readyMs - pickupEndMs) / 60_000)
  return diffMin > 0 ? { lateMin: diffMin, slackMin: 0 } : { lateMin: 0, slackMin: -diffMin }
}
