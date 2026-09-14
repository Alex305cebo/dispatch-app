// Чистые расчёты страницы груза из бота: окна погрузки и доставки из текста
// рейт-кона и успевает ли рейс. Без сети и базы — проверяется тестом.

import { realDriveMinutes } from './trip-eta.ts'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/**
 * Окно из текста рейт-кона → начало и конец в «наивных» миллисекундах (часовой пояс
 * не учитываем: окна погрузки и доставки печатаются в местном времени складов, а
 * разница поясов на рейсе — час-два, на вывод «успевает / нет» почти не влияет, и
 * подпись на экране говорит «~»).
 *
 * Форматы, которые реально приходят из бота:
 *   «9/13/2026 FCFS 07:00 to 22:00», «09/14/2026 Appt 09:00»,
 *   «08/19/2026 08:00 - 15:00», «Sep 3, 2026 10:00 CDT», «7/29/26 8:00 am - 3:00 pm».
 */
export function parseWindow(text: string | null | undefined): { start: number; end: number } | null {
  const s = (text ?? '').trim()
  if (!s) return null

  let y = 0
  let mo = 0
  let d = 0
  const num = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s)
  const word = /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)
  if (num) {
    mo = Number(num[1])
    d = Number(num[2])
    y = Number(num[3])
    if (y < 100) y += 2000
  } else if (word && MONTHS[word[1]!.toLowerCase()]) {
    mo = MONTHS[word[1]!.toLowerCase()]!
    d = Number(word[2])
    y = Number(word[3])
  } else {
    return null
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null

  const times = [...s.matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)?/gi)].map((m) => {
    let h = Number(m[1])
    const ap = (m[3] ?? '').toLowerCase()
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    return h * 60 + Number(m[2])
  })
  const day = Date.UTC(y, mo - 1, d)
  if (!times.length) return { start: day, end: day + 24 * 3_600_000 }
  const start = day + times[0]! * 60_000
  let end = day + times[times.length - 1]! * 60_000
  if (end < start) end += 24 * 3_600_000 // окно через полночь
  return { start, end }
}

/** Средняя скорость фуры по маршруту с остановками — та же, что у приложения, когда
 * маршрутизатор не ответил (lib/geo-routing.ts). */
export const TRUCK_MPH = 55

/** На погрузку и выгрузку закладываем по часу: рейт-кон про это молчит, склад — нет. */
const DOCK_MIN = 120

export type TripFit = {
  driveMin: number
  /** С обязательными ночёвками HOS (10 ч после каждых 11 ч за рулём). */
  realMin: number
  shifts: number
  /** Сколько времени между началом окна погрузки и концом окна доставки. */
  availMin: number | null
  slackMin: number | null
  tone: 'good' | 'warn' | 'bad' | null
}

/**
 * Успевает ли рейс. Считаем по-доброму: выезд в самом начале окна погрузки, прибытие к
 * самому концу окна доставки. Если не сходится даже так — не сойдётся никак, и об этом
 * надо говорить брокеру ДО того, как груз взят.
 */
export function tripFit(miles: number, pickup: string | null | undefined, delivery: string | null | undefined): TripFit | null {
  if (!Number.isFinite(miles) || miles <= 0) return null
  const driveMin = Math.round((miles / TRUCK_MPH) * 60)
  const realMin = realDriveMinutes(driveMin)
  const shifts = Math.max(1, Math.ceil(driveMin / 660))
  const p = parseWindow(pickup)
  const q = parseWindow(delivery)
  const availMin = p && q && q.end > p.start ? Math.round((q.end - p.start) / 60_000) : null
  const slackMin = availMin === null ? null : availMin - realMin - DOCK_MIN
  const tone = slackMin === null ? null : slackMin >= 240 ? 'good' : slackMin >= 0 ? 'warn' : 'bad'
  return { driveMin, realMin, shifts, availMin, slackMin, tone }
}

/** Прорежённая линия маршрута для сервера: штаты пути по 300 точкам определяются так
 * же, как по трём тысячам, а запрос в разы легче. */
export function thinCoords(coords: [number, number][], max = 300): [number, number][] {
  if (coords.length <= max) return coords
  const step = (coords.length - 1) / (max - 1)
  const out: [number, number][] = []
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]!)
  return out
}

/** Google Maps: маршрут от погрузки до доставки — по адресу, если он есть. */
export function directionsUrl(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from || !to) return null
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`
}

/** Рейт-кон или груз с биржи: у рейт-кона есть склады, адреса и реф-номера точек. */
export function isRateCon(l: {
  pickupName?: string | null
  pickupAddress?: string | null
  pickupRefs?: string | null
  deliveryName?: string | null
  deliveryAddress?: string | null
  deliveryRefs?: string | null
}): boolean {
  return Boolean(l.pickupName || l.pickupAddress || l.pickupRefs || l.deliveryName || l.deliveryAddress || l.deliveryRefs)
}
