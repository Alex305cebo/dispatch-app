// Честный срок прибытия: чистое время за рулём + обязательные ночёвки.
//
// «~31ч до выгрузки» на карте — это время ЗА РУЛЁМ, а водитель столько подряд не
// едет: правило HOS отводит максимум 11 часов драйва, затем минимум 10 часов
// отдыха. Диспетчер это пересчитывал в голове; теперь считает страница и сразу
// сравнивает со сроком доставки — «успевает с запасом» или «опаздывает».
//
// Модуль чистый: ни сети, ни базы — время и пояс приходят снаружи, поэтому всё
// проверяется тестами. Точных часов HOS водителя у нас нет (вендор их не выдал),
// так что цикл 11/10 — честное приближение, и подпись на экране говорит «~».

/** Минуты за рулём → минуты реального пути с ночёвками (10 ч после каждых 11 ч). */
export function realDriveMinutes(driveMin: number): number {
  if (!Number.isFinite(driveMin) || driveMin <= 0) return 0
  const rests = Math.max(0, Math.ceil(driveMin / 660) - 1)
  return Math.round(driveMin + rests * 600)
}

/** «14:00» из строки времени назначения; окно «14:00-16:00» читается по началу —
 * приезжать надо к открытию окна, а не к закрытию. */
export function apptMinutes(time: string | null | undefined): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(time ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Момент (мс UTC) «эта дата, это время стены» в поясе выгрузки.
 *
 * Двухшаговый перевод через Intl: строим догадку в UTC, спрашиваем у пояса, какое
 * время стены она даёт, и сдвигаем на разницу. На границе перевода часов ошибка
 * не больше часа — для срока доставки это шум. */
export function zonedMs(dateIso: string, minutesOfDay: number, zone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateIso)
  if (!m) return null
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, minutesOfDay)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(guess)
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    // «hour: 24» Intl отдаёт для полуночи — нормализуем.
    const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
    return guess - (wall - guess)
  } catch {
    return null // неизвестный пояс — лучше без срока, чем с неверным
  }
}

export type TripEta = {
  /** Реальные минуты пути (с ночёвками). */
  realMin: number
  /** Минуты запаса до срока выгрузки; отрицательные — опоздание. Null — срока нет. */
  slackMin: number | null
}

/**
 * Свести всё вместе: за рулём осталось driveMin, срок — дата и время назначения в
 * поясе выгрузки. Без времени назначения срок — конец дня (23:59): «доставить
 * such-то числа» значит успеть в этот день.
 */
export function tripEta(
  driveMin: number,
  nowMs: number,
  deliveryDate: string | null,
  deliveryTime: string | null,
  destZone: string | null,
): TripEta {
  const realMin = realDriveMinutes(driveMin)
  let slackMin: number | null = null
  if (deliveryDate) {
    const deadline = zonedMs(deliveryDate, apptMinutes(deliveryTime) ?? 23 * 60 + 59, destZone ?? 'America/Chicago')
    if (deadline !== null) slackMin = Math.round((deadline - (nowMs + realMin * 60_000)) / 60_000)
  }
  return { realMin, slackMin }
}
