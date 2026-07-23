// calcLoad and the DB CHECKs shout in English — that's right for a log and wrong for
// a dispatcher. One translator, because both the form and the server actions show
// these to the same person.

import { t, type Locale } from './i18n.ts'

export function humanError(e: unknown, locale: Locale = 'ru'): string {
  const raw = e instanceof Error ? e.message : String(e)

  if (/loaded_miles|Loaded miles/.test(raw)) return t(locale, 'msg.needMiles')
  if (/transit_days|Transit days/.test(raw)) return t(locale, 'msg.transitDaysPositive')
  if (/deadhead_miles|Deadhead/.test(raw)) return t(locale, 'msg.deadheadNegative')
  if (/\bMPG\b/.test(raw)) return t(locale, 'msg.mpgPositive')
  if (/Rate cannot|\brate\b/.test(raw)) return t(locale, 'msg.rateNegative')
  if (/under 100%/.test(raw)) return t(locale, 'msg.cutsOver100')
  return raw
}
