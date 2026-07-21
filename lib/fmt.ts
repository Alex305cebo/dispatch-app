// No directive on purpose: server components and client components both import
// these, and Intl is pure — it behaves identically on either side.

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

/** Minutes → "2ч 40м" / "40м". For rough drive-time estimates. */
export function driveTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}ч ${m}м` : `${m}м`
}

/** Midnight of this week's Monday — "за неделю" stats reset on the calendar week,
 * not a rolling 7 days from whenever the page happens to load. */
export function weekStart(): number {
  const now = new Date()
  const sinceMonday = (now.getDay() + 6) % 7 // Mon=0, Tue=1, ..., Sun=6
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - sinceMonday)
  return monday.getTime()
}

/** Timestamp → "5 мин назад" / "2 ч назад" / "18.07" once it's a day+ stale. */
export function agoText(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} ч назад`
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}
