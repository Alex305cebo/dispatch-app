'use server'

import { hashPassword } from '@/lib/auth'
import { getCurrentUser } from '@/lib/session'
import { sql } from '@/lib/db'

/** Self-service — any signed-in user changes their own password, no admin needed. */
export async function changeMyPassword(newPassword: string): Promise<{ error: string } | void> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Не авторизован.' }
  if (newPassword.length < 8) return { error: 'Пароль — минимум 8 символов.' }
  await sql`UPDATE users SET password_hash = ${await hashPassword(newPassword)} WHERE id = ${user.id}`
}
