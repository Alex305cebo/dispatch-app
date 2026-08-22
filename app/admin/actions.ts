'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { humanError } from '@/lib/msg'
import { hashPassword } from '@/lib/auth'
import { getCurrentUser } from '@/lib/session'
import { deleteSetting, getSetting, setSetting } from '@/lib/settings'
import { aiModelPref, fmcsaKey, geminiKey, hereKey } from '@/lib/keys'
import { CAPABILITIES, type CapabilityKey } from '@/lib/capabilities'
import { capabilitiesFor, setUserCapability } from '@/lib/capabilities-server'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CAP_KEYS = new Set(CAPABILITIES.map((c) => c.key))

async function assertAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error(t(await getLocale(), 'admin.err.adminOnly'))
}

export type AdminUser = {
  id: number
  name: string
  email: string
  role: 'admin' | 'dispatcher'
  createdAt: string
  disabledAt: string | null
  /** Effective feature access, for dispatchers only (admins have everything). */
  capabilities: Record<CapabilityKey, boolean> | null
}

export async function listUsers(): Promise<AdminUser[]> {
  await assertAdmin()
  // The seeded public-demo account (lib/demo.ts) is a real row in this table so
  // sessions/dispatcher_id work for it — but it's not a dispatcher anyone here
  // manages, so it must never show up for a real admin to edit or get confused by.
  const rows = (await sql`
    SELECT id, name, email, role, created_at, disabled_at FROM users
    WHERE is_demo = FALSE ORDER BY created_at ASC`) as {
    id: number
    name: string
    email: string
    role: 'admin' | 'dispatcher'
    created_at: string
    disabled_at: string | null
  }[]
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
      disabledAt: r.disabled_at,
      capabilities: r.role === 'dispatcher' ? await capabilitiesFor(r.id) : null,
    })),
  )
}

/** Toggle one dispatcher's access to one capability. Admins have everything, so this
 * only ever targets dispatchers. */
export async function setDispatcherCapability(
  userId: number,
  key: string,
  allowed: boolean,
): Promise<{ error: string } | void> {
  await assertAdmin()
  if (!CAP_KEYS.has(key as CapabilityKey)) return { error: t(await getLocale(), 'admin.err.unknownCapability') }
  await setUserCapability(userId, key as CapabilityKey, allowed)
  revalidatePath('/admin')
  revalidatePath('/', 'layout')
}

export async function createUser(
  name: string,
  email: string,
  password: string,
  role: 'admin' | 'dispatcher',
): Promise<{ error: string } | void> {
  await assertAdmin()
  const locale = await getLocale()
  if (!name.trim()) return { error: t(locale, 'admin.err.enterName') }
  if (!EMAIL_RE.test(email.trim())) return { error: t(locale, 'admin.err.invalidEmail') }
  if (password.length < 8) return { error: t(locale, 'admin.err.passwordMin8') }

  try {
    await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${await hashPassword(password)}, ${role})`
  } catch (e) {
    return { error: /unique/i.test(String(e)) ? t(locale, 'admin.err.emailTaken') : humanError(e) }
  }
  revalidatePath('/admin')
  // Ключ HERE читает раздел платных дорог — без этого он остался бы
  // на закэшированном «ключа нет» до следующей полной перезагрузки.
  revalidatePath('/tolls')
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
  if (newPassword.length < 8) return { error: t(await getLocale(), 'admin.err.passwordMin8') }
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

/** Публичное демо на входе: кнопка «посмотреть без регистрации».
 *
 * Отсутствие ключа = включено. Это ради установок, которые уже работают: у них
 * этой строки в базе нет, и выключить им демо задним числом правкой кода было бы
 * подменой их настройки. Форма установки новой копии пишет '0' — у клиента демо
 * нет с первого дня, а витрину включают здесь. */
export async function getDemoPublic(): Promise<boolean> {
  await assertAdmin()
  return (await getSetting('demo_public')) !== '0'
}

export async function setDemoPublic(enabled: boolean): Promise<{ error: string } | void> {
  await assertAdmin()
  await setSetting('demo_public', enabled ? '1' : '0')
  revalidatePath('/admin')
  revalidatePath('/login')
}

/** Which third-party keys this install has, WITHOUT ever returning their values. The
 * admin panel only needs to show "set / not set" and offer to replace — echoing a key
 * back into a page would put it in the HTML, the RSC payload and the browser cache. */
export async function getKeyStatus(): Promise<{
  gemini: boolean
  fmcsa: boolean
  here: boolean
  modelPref: 'saving' | 'quality'
}> {
  await assertAdmin()
  const [gemini, fmcsa, here, modelPref] = await Promise.all([
    geminiKey(),
    fmcsaKey(),
    hereKey(),
    aiModelPref(),
  ])
  return { gemini: gemini !== '', fmcsa: fmcsa !== '', here: here !== '', modelPref }
}

/** Saves the install's own API keys. An empty string means "leave as it is" — the form
 * never knows the current value, so a blank field must not wipe a working key. Passing
 * the literal '-' clears one, which is the only way to undo a paste-mistake. */
export async function saveKeys(input: {
  gemini?: string
  fmcsa?: string
  here?: string
  modelPref?: 'saving' | 'quality'
}): Promise<{ error: string } | void> {
  await assertAdmin()
  const write = async (key: string, raw: string | undefined) => {
    const v = (raw ?? '').trim()
    if (!v) return
    if (v === '-') await deleteSetting(key)
    else await setSetting(key, v)
  }
  await write('gemini_api_key', input.gemini)
  await write('fmcsa_webkey', input.fmcsa)
  await write('here_api_key', input.here)
  if (input.modelPref) await setSetting('ai_model_pref', input.modelPref)
  revalidatePath('/admin')
}
