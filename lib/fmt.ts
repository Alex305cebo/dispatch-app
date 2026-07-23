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

/** Minutes → "2ч 40м" / "40м" (ru) or "2h 40m" / "40m" (en). Rough drive-time estimates. */
export function driveTime(min: number, locale: Locale): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (locale === 'ru') return h > 0 ? `${h}ч ${m}м` : `${m}м`
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Midnight of the Monday on/before the given time — the start of ITS calendar week.
 * Shared by weekStart() (now) and anything bucketing PAST timestamps into weeks
 * (e.g. the per-dispatcher weekly report), so "which week" is computed one way. */
export function mondayOf(ms: number): number {
  const d = new Date(ms)
  const sinceMonday = (d.getDay() + 6) % 7 // Mon=0, Tue=1, ..., Sun=6
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - sinceMonday)
  return d.getTime()
}

/** Midnight of this week's Monday — "за неделю" stats reset on the calendar week,
 * not a rolling 7 days from whenever the page happens to load. */
export function weekStart(): number {
  return mondayOf(Date.now())
}

/** "21–27 июля 2026" (ru) / "Jul 21–27, 2026" (en) for a week starting at the given
 * Monday timestamp — each locale in its own natural date order, not a shared format. */
export function weekLabel(mondayMs: number, locale: Locale): string {
  const start = new Date(mondayMs)
  const end = new Date(mondayMs + 6 * 24 * 60 * 60 * 1000)
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
