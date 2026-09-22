// Server-only half of lib/i18n.ts: reads the `locale` cookie. Split into its own
// module (mirrors lib/session.ts's `import 'server-only'` pattern) so that
// lib/i18n.ts itself — imported by client components too — never pulls next/headers
// into a client bundle. Call from any Server Component or Server Action:
//   const locale = await getLocale()

import 'server-only'
import { cookies } from 'next/headers'
import { LOGIN_LOCALE_COOKIE, resolveLocale, type Locale } from './i18n.ts'

export async function getLocale(): Promise<Locale> {
  const c = await cookies()
  return resolveLocale(c.get('locale')?.value)
}

/** Язык формы входа (см. LOGIN_LOCALE_COOKIE): английский, пока человек не выбрал
 * другой флагом. Ошибки входа — на том же языке, что и сама форма. */
export async function getLoginLocale(): Promise<Locale> {
  const c = await cookies()
  return resolveLocale(c.get(LOGIN_LOCALE_COOKIE)?.value)
}
