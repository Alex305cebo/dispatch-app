'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { humanError } from '@/lib/msg'
import { hashPassword } from '@/lib/auth'
import { getCurrentUser } from '@/lib/session'
import { getSetting, setSetting } from '@/lib/settings'
import { tgAccountInfo, tgConnected, tgDialogs, tgHiddenChats, setTgHiddenChats, type TgDialog } from '@/lib/telegram'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function assertAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('Только для администратора.')
}

export type AdminUser = {
  id: number
  name: string
  email: string
  role: 'admin' | 'dispatcher'
  createdAt: string
  disabledAt: string | null
}

export async function listUsers(): Promise<AdminUser[]> {
  await assertAdmin()
  const rows = (await sql`
    SELECT id, name, email, role, created_at, disabled_at FROM users ORDER BY created_at ASC`) as {
    id: number
    name: string
    email: string
    role: 'admin' | 'dispatcher'
    created_at: string
    disabled_at: string | null
  }[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    createdAt: r.created_at,
    disabledAt: r.disabled_at,
  }))
}

export async function createUser(
  name: string,
  email: string,
  password: string,
  role: 'admin' | 'dispatcher',
): Promise<{ error: string } | void> {
  await assertAdmin()
  if (!name.trim()) return { error: 'Впиши имя.' }
  if (!EMAIL_RE.test(email.trim())) return { error: 'Некорректный email.' }
  if (password.length < 8) return { error: 'Пароль — минимум 8 символов.' }

  try {
    await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${await hashPassword(password)}, ${role})`
  } catch (e) {
    return { error: /unique/i.test(String(e)) ? 'Этот email уже занят.' : humanError(e) }
  }
  revalidatePath('/admin')
}

export async function setUserRole(userId: number, role: 'admin' | 'dispatcher'): Promise<{ error: string } | void> {
  await assertAdmin()
  await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`
  revalidatePath('/admin')
}

/** Disabling also kills every active session for that user — the whole point over
 * just hiding them from a list is that access actually ends right away. */
export async function setUserDisabled(userId: number, disabled: boolean): Promise<{ error: string } | void> {
  await assertAdmin()
  await sql`UPDATE users SET disabled_at = ${disabled ? new Date().toISOString() : null} WHERE id = ${userId}`
  if (disabled) await sql`DELETE FROM sessions WHERE user_id = ${userId}`
  revalidatePath('/admin')
}

export async function resetUserPassword(userId: number, newPassword: string): Promise<{ error: string } | void> {
  await assertAdmin()
  if (newPassword.length < 8) return { error: 'Пароль — минимум 8 символов.' }
  await sql`UPDATE users SET password_hash = ${await hashPassword(newPassword)} WHERE id = ${userId}`
  // A reset password should force a real re-login, not leave old sessions valid.
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`
  revalidatePath('/admin')
}

export async function getOpenAccess(): Promise<boolean> {
  await assertAdmin()
  return (await getSetting('open_access')) === '1'
}

/** middleware.ts checks this flag on every request — when on, the whole app (except
 * /admin itself) skips the login check entirely. /admin always still requires a real
 * admin session, so this switch can always be found and flipped back off. */
export async function setOpenAccess(enabled: boolean): Promise<{ error: string } | void> {
  await assertAdmin()
  await setSetting('open_access', enabled ? '1' : '0')
  revalidatePath('/admin')
}

export async function getTgDispatcherAccess(): Promise<boolean> {
  await assertAdmin()
  return (await getSetting('tg_dispatcher_access')) === '1'
}

/** Off by default — a freshly connected Telegram account stays admin-only (nav link
 * hidden, /telegram itself refuses non-admins) until the admin explicitly opens it
 * up to every dispatcher. Connect/disconnect stay admin-only either way. */
export async function setTgDispatcherAccess(enabled: boolean): Promise<{ error: string } | void> {
  await assertAdmin()
  await setSetting('tg_dispatcher_access', enabled ? '1' : '0')
  revalidatePath('/admin')
  revalidatePath('/telegram')
  revalidatePath('/', 'layout')
}

export type TgAdminStatus =
  | { connected: false }
  | {
      connected: true
      account: { name: string; phone: string | null; username: string | null } | null
      dialogs: TgDialog[]
      hidden: string[]
    }

export async function tgAdminStatus(): Promise<TgAdminStatus | { error: string }> {
  await assertAdmin()
  if (!(await tgConnected())) return { connected: false }
  try {
    const [account, dialogs, hidden] = await Promise.all([tgAccountInfo(), tgDialogs(), tgHiddenChats()])
    return { connected: true, account, dialogs, hidden: [...hidden] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Which of the connected account's chats show up on /telegram — same list for
 * every dispatcher, curated here instead of per-viewer. */
export async function setTgVisibility(hiddenIds: string[]): Promise<{ error: string } | void> {
  await assertAdmin()
  await setTgHiddenChats(hiddenIds)
  revalidatePath('/admin')
  revalidatePath('/telegram')
}
