'use server'

import { generateRecoveryCode, hashPassword, normalizeRecoveryCode } from '@/lib/auth'
import { getCurrentUser } from '@/lib/session'
import { sql } from '@/lib/db'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

/** Self-service — any signed-in user changes their own password, no admin needed. */
export async function changeMyPassword(newPassword: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser()
  const locale = await getLocale()
  if (!user) return { error: t(locale, 'admin.err.notAuthorized') }
  // The demo account is SHARED by every visitor, and resetDemoData() rebuilds loads,
  // trucks and documents but deliberately never touches `users` — so a password set
  // here was the one demo change that survived forever, on a row everybody uses. The
  // banner promises nothing persists; this is the only action that broke that promise.
  if (user.isDemo) return { error: t(locale, 'admin.err.demoReadOnly') }
  if (newPassword.length < 8) return { error: t(locale, 'admin.err.passwordMin8') }
  await sql`UPDATE users SET password_hash = ${await hashPassword(newPassword)} WHERE id = ${user.id}`
}

/** Новый код восстановления — прежний перестаёт действовать. Показывается один раз,
 * хранится только хешем: прочитать его из базы потом нельзя, только выпустить ещё. */
export async function newRecoveryCode(): Promise<{ error: string } | { code: string }> {
  const user = await getCurrentUser()
  const locale = await getLocale()
  if (!user) return { error: t(locale, 'admin.err.notAuthorized') }
  if (user.isDemo) return { error: t(locale, 'admin.err.demoReadOnly') }
  const code = generateRecoveryCode()
  await sql`UPDATE users SET recovery_hash = ${await hashPassword(normalizeRecoveryCode(code))} WHERE id = ${user.id}`
  return { code }
}
