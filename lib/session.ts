// Reads the user identity middleware already resolved and attached as request
// headers — one DB lookup per request (in middleware), not one per Server Component.
import 'server-only'
import { headers } from 'next/headers'
import { sql } from './db.ts'
import { verifyPassword } from './auth.ts'
import { t, type Locale } from './i18n.ts'

export type CurrentUser = {
  id: number
  name: string
  role: 'admin' | 'dispatcher'
  companyId: 'default' | 'demo'
  isDemo: boolean
}

/**
 * Confirm the signed-in user re-typed their OWN login password. This replaced the
 * old shared APP_PIN on every irreversible action (deletes, sending to a driver):
 * whoever is logged in is who acts, so the caller also gets the user back to stamp
 * the audit row — no separate "кто удалил" field to type.
 */
export async function verifyMyPassword(
  password: string,
  locale: Locale = 'ru',
): Promise<{ user: CurrentUser } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: t(locale, 'session.expired') }
  if (!password) return { error: t(locale, 'session.enterPassword') }
  const rows = (await sql`SELECT password_hash FROM users WHERE id = ${user.id}`) as {
    password_hash: string
  }[]
  const hash = rows[0]?.password_hash
  if (!hash || !(await verifyPassword(password, hash))) return { error: t(locale, 'session.wrongPassword') }
  return { user }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const h = await headers()
  const id = h.get('x-user-id')
  if (!id) return null
  const role = h.get('x-user-role')
  const companyId = h.get('x-company-id') === 'demo' ? 'demo' : 'default'
  // middleware encodeURIComponent's the name so a non-Latin1 name (Cyrillic — the
  // norm here) doesn't crash Headers.set.
  const rawName = h.get('x-user-name')
  return {
    id: Number(id),
    name: rawName ? decodeURIComponent(rawName) : '',
    role: role === 'admin' ? 'admin' : 'dispatcher',
    companyId,
    isDemo: companyId === 'demo',
  }
}

/**
 * Every trucks/loads/documents query is filtered by this. Defaults to 'default' (the
 * real fleet) when there's no session at all — "open access" mode (admin toggle) and
 * the public /track/[id] link both run with no session, and both must keep behaving
 * exactly as before: only an actual signed-in demo session ever sees 'demo' data.
 */
export async function companyScope(): Promise<'default' | 'demo'> {
  return (await getCurrentUser())?.companyId ?? 'default'
}

/** Throws instead of returning null — for admin-only pages, right after the page's
 * own gate has already confirmed role === 'admin'. Never trust this alone. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('Admin access required')
  return user
}
