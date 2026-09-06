// Two-language UI (English default / Russian opt-in). No dependency — a flat
// dictionary assembled from per-area shards (lib/i18n/dict-*.ts) + a t() lookup.
// Pure/isomorphic module: safe to import from both Server and Client Components —
// the cookie-reading half (getLocale, needs next/headers) lives in lib/i18n-server.ts
// instead, so this file never pulls a server-only API into a client bundle.

import { commonDict } from './i18n/dict-common.ts'
import { weatherDict } from './i18n/dict-weather.ts'
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
import { tourDict } from './i18n/dict-tour.ts'

export type Locale = 'en' | 'ru' | 'es' | 'uk' | 'ro' | 'kk'

/** Языки интерфейса и как они называются НА СЕБЕ. Список на родном языке — правило
 * любого нормального переключателя: человек ищет «Español», а не «Spanish», потому
 * что английского он может и не знать — ради этого переключатель и открывают. */
export const LOCALES: { code: Locale; native: string; short: string }[] = [
  { code: 'en', native: 'English', short: 'EN' },
  { code: 'ru', native: 'Русский', short: 'RU' },
  { code: 'es', native: 'Español', short: 'ES' },
  { code: 'uk', native: 'Українська', short: 'UK' },
  { code: 'ro', native: 'Română', short: 'RO' },
  { code: 'kk', native: 'Қазақша', short: 'KK' },
]
export const LOCALE_COOKIE = 'locale'

const CODES = new Set(LOCALES.map((l) => l.code))

/** Cookie value → Locale, defaulting to English. */
export function resolveLocale(v: string | undefined | null): Locale {
  return v && CODES.has(v as Locale) ? (v as Locale) : 'en'
}

const DICT = {
  ...weatherDict,
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
  ...tourDict,
} as const

export type MsgKey = keyof typeof DICT

/**
 * key → строка на нужном языке.
 *
 * Языков пять, а переведено не всё и не сразу: испанский, украинский и румынский
 * добавляются по разделам. Отсутствующий перевод падает на АНГЛИЙСКИЙ, а не на ключ,
 * — иначе на непереведённом экране пользователь увидел бы «loads.page.title» вместо
 * слов. Английский тут не «язык по умолчанию из вежливости», а язык отрасли: все
 * рейт-коны, биржи и брокеры всё равно на нём.
 *
 * Совсем отсутствующий ключ отдаётся как есть — уродливо, зато заметно, и опечатка
 * не превращается в пустое место на экране.
 */
export function t(locale: Locale, key: MsgKey): string {
  const entry = (DICT as Record<string, Partial<Record<Locale, string>>>)[key]
  if (!entry) return key
  return entry[locale] ?? entry.en ?? key
}
