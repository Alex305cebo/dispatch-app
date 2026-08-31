// No directive on purpose: server components and client components both import
// these, and Intl is pure — it behaves identically on either side.

import type { Locale } from './i18n.ts'

export const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

/** "Alex Morgan" → "Alex M." — first name + last-name initial, for keeping a person's
 * name on one line on a phone. One-word names (or blanks) pass through unchanged. */
export function shortName(full: string | null | undefined): string {
  const s = (full ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const parts = s.split(' ')
  if (parts.length < 2) return s
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`
}

/** Minutes → "2ч 40м" / "40м" (ru) or "2h 40m" / "40m" (en). Rough drive-time estimates. */
export function driveTime(min: number, locale: Locale): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (locale === 'ru') return h > 0 ? `${h}ч ${m}м` : `${m}м`
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * Начало расчётной недели, в которую попадает момент.
 *
 * Неделя тут не календарная, а ЗАРПЛАТНАЯ: в Maya Logistics и водителям, и
 * диспетчерам считают с пятницы по пятницу. Раньше всё считалось от понедельника,
 * и недельные суммы в приложении не сходились с тем, что реально выплачивается, —
 * груз, увезённый в субботу, попадал в другую неделю, чем его же оплата.
 *
 * Один этот якорь задаёт неделю во всём приложении (обзор, траки, грузы, финансы),
 * чтобы «за неделю» везде значило одно и то же.
 */
const PAY_WEEK_DAY = 5 // пятница (getDay: Вс=0 … Пт=5)

export function weekAnchorOf(ms: number): number {
  const d = new Date(ms)
  const since = (d.getDay() - PAY_WEEK_DAY + 7) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - since)
  return d.getTime()
}

/** Полночь пятницы текущей расчётной недели — «за неделю» отсчитывается от неё,
 * а не скользящими семью днями от момента открытия страницы. */
export function weekStart(): number {
  return weekAnchorOf(Date.now())
}

/** Неделя как полуоткрытый промежуток [пятница, следующая пятница). Верхняя граница
 * важна: груз, забронированный на следующую неделю, не должен попадать в текущие
 * цифры. */
export function weekBounds(): { start: number; end: number } {
  const start = weekStart()
  return { start, end: start + 7 * 24 * 60 * 60 * 1000 }
}

/** The instant a load counts toward for weekly stats: the PICKUP date — the day the
 * truck actually ran it — not when the row was entered. Falls back to entry time only
 * when the rate con carried no pickup date, so a manual load never vanishes. Anchoring
 * on entry time made every freshly-imported load land in "this week" regardless of when
 * the haul happened, which is why the fleet total read like an all-time sum. */
export function loadWeekAnchorMs(pickupDate: string | null, createdAt: string): number {
  if (pickupDate) {
    const ms = Date.parse(`${pickupDate}T12:00:00`)
    if (!Number.isNaN(ms)) return ms
  }
  return Date.parse(createdAt)
}

/** "21–27 июля 2026" (ru) / "Jul 21–27, 2026" (en) for a week starting at the given
 * Monday timestamp — each locale in its own natural date order, not a shared format. */
export function weekLabel(weekStartMs: number, locale: Locale): string {
  const start = new Date(weekStartMs)
  const end = new Date(weekStartMs + 6 * 24 * 60 * 60 * 1000)
  const sameMonth = start.getMonth() === end.getMonth()
  const day = (d: Date) => d.getDate()
  if (locale === 'ru') {
    const month = (d: Date) => d.toLocaleDateString('ru-RU', { month: 'long' })
    return sameMonth
      ? `${day(start)}–${day(end)} ${month(end)} ${end.getFullYear()}`
      : `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${end.getFullYear()}`
  }
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return sameMonth
    ? `${month(start)} ${day(start)}–${day(end)}, ${end.getFullYear()}`
    : `${month(start)} ${day(start)} – ${month(end)} ${day(end)}, ${end.getFullYear()}`
}

/** Timestamp → "5 мин назад" / "18.07" (ru) or "5 min ago" / "07/18" (en) once it's a
 * day+ stale. */
export function agoText(iso: string | Date, locale: Locale): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (locale === 'ru') {
    if (diffMin < 1) return 'только что'
    if (diffMin < 60) return `${diffMin} мин назад`
    const diffH = Math.round(diffMin / 60)
    if (diffH < 24) return `${diffH} ч назад`
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
  }
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })
}

/**
 * Clean up an appointment-time string from a rate con before it's shown.
 *
 * The AI (and some rate cons) mash a pickup/delivery WINDOW into one field with no
 * separator and military times with no colon — e.g. "07/22/2026 060007/22/2026 2100",
 * which reads as gibberish. This makes it "07/22/2026 06:00 – 21:00":
 *   1. a US date butted straight against a preceding 4-digit time gets a separator
 *   2. bare HHMM (00:00–23:59) gets its colon — but only after a space/start, so the
 *      YEAR inside a date (…/2026) is never turned into a time
 *   3. a "DATE T1 – DATE T2" window with the SAME date collapses to "DATE T1 – T2"
 * Anything already well-formed ("07/15/26 12:00 Appt") passes through untouched.
 */
export function normalizeApptTime(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = String(raw).trim()
  if (!s) return null
  s = s.replace(/(\d{4})(?=\d{1,2}\/\d{1,2}\/\d{2,4}\b)/g, '$1 – ')
  s = s.replace(/(^|\s)([01]\d|2[0-3])([0-5]\d)(?=\D|$)/g, '$1$2:$3')
  s = s.replace(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+[–-]\s+\1\s+(.+)$/, '$1 $2 – $3')
  return s.replace(/\s+/g, ' ').trim()
}

/** Время в чужом часовом поясе словами: «14:32 PDT».
 *
 * Аббревиатура обязательна: без неё непонятно, чьё это время — водителя или своё.
 * Пояс — IANA-имя (см. lib/tz.ts). Формат и переход на летнее время делает Intl,
 * поэтому своей арифметики с часами здесь нет и быть не должно.
 *
 * Живёт здесь, а не в lib/tz.ts, потому что нужен и на клиенте: tz.ts тянет
 * полигоны поясов на 150 КБ, и импорт его в браузерный бандл был бы платой ни за что.
 */
export function zoneTime(zone: string, now: Date): string | null {
  try {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now)
    const abbr = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value
    return abbr ? `${time} ${abbr}` : time
  } catch {
    // Неизвестное имя пояса — лучше промолчать, чем показать своё время как чужое.
    return null
  }
}
