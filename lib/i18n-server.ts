// Server-only half of lib/i18n.ts: reads the `locale` cookie. Split into its own
// module (mirrors lib/session.ts's `import 'server-only'` pattern) so that
// lib/i18n.ts itself — imported by client components too — never pulls next/headers
// into a client bundle. Call from any Server Component or Server Action:
//   const locale = await getLocale()

import 'server-only'
import { cookies } from 'next/headers'
import { resolveLocale, type Locale } from './i18n.ts'

export async function getLocale(): Promise<Locale> {
  const c = await cookies()
  return resolveLocale(c.get('locale')?.value)
}
