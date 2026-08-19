// Two-language UI (English default / Russian opt-in). No dependency — a flat
// dictionary assembled from per-area shards (lib/i18n/dict-*.ts) + a t() lookup.
// Pure/isomorphic module: safe to import from both Server and Client Components —
// the cookie-reading half (getLocale, needs next/headers) lives in lib/i18n-server.ts
// instead, so this file never pulls a server-only API into a client bundle.

import { commonDict } from './i18n/dict-common.ts'
import { navDict } from './i18n/dict-nav.ts'
import { loginDict } from './i18n/dict-login.ts'
import { actionsDict } from './i18n/dict-actions.ts'
import { loadsDict } from './i18n/dict-loads.ts'
import { trucksDict } from './i18n/dict-trucks.ts'
import { trackingDict } from './i18n/dict-tracking.ts'
import { financesDict } from './i18n/dict-finances.ts'
import { docsDict } from './i18n/dict-docs.ts'
import { telegramDict } from './i18n/dict-telegram.ts'
import { adminDict } from './i18n/dict-admin.ts'
import { overviewDict } from './i18n/dict-overview.ts'
import { brokersDict } from './i18n/dict-brokers.ts'
import { tollsDict } from './i18n/dict-tolls.ts'

export type Locale = 'ru' | 'en'
export const LOCALES: Locale[] = ['en', 'ru']
export const LOCALE_COOKIE = 'locale'

/** Cookie value → Locale, defaulting to English. Russian only when explicitly chosen. */
export function resolveLocale(v: string | undefined | null): Locale {
  return v === 'ru' ? 'ru' : 'en'
}

const DICT = {
  ...commonDict,
  ...navDict,
  ...loginDict,
  ...actionsDict,
  ...loadsDict,
  ...trucksDict,
  ...trackingDict,
  ...financesDict,
  ...docsDict,
  ...telegramDict,
  ...adminDict,
  ...overviewDict,
  ...brokersDict,
  ...tollsDict,
} as const

export type MsgKey = keyof typeof DICT

/** key → {ru,en} lookup. Falls back to the key itself if somehow missing, so a typo
 * shows up as an ugly-but-visible string instead of a crash. */
export function t(locale: Locale, key: MsgKey): string {
  const entry: { ru: string; en: string } | undefined = (DICT as Record<string, { ru: string; en: string }>)[key]
  return entry ? entry[locale] : key
}
