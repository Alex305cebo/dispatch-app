'use server'

import { cookies, headers } from 'next/headers'
import { sql } from '@/lib/db'
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE,
  SESSION_DAYS,
} from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Login audit — who, from what device, and the city of the IP. Best-effort: a
// failed insert or geolocation must never block sign-in.
async function logAudit(who: string) {
  try {
    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
    const { ipCity } = await import('@/lib/geo-routing')
    const city = await ipCity(ip)
    await sql`INSERT INTO logins (who, ip, user_agent, city)
              VALUES (${who}, ${ip}, ${h.get('user-agent')}, ${city})`
  } catch {
    // ignore — audit is nice-to-have, not a gate
  }
}

async function startSession(userId: number, remember: boolean) {
  const token = await createSession(userId)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // "Remember this computer": persistent for a year — log in once and that's it.
    // Unchecked → no maxAge, so a session cookie the browser clears on close, and
    // the checkbox comes back next visit. Standard remember-me pattern.
    ...(remember ? { maxAge: 60 * 60 * 24 * SESSION_DAYS } : {}),
  })
}

/**
 * First-run only: creates the first account, which becomes admin. Refuses once any
 * account exists — after that, use signIn. The login PAGE decides which form to show
 * by checking whether users exist; this re-checks server-side so the bootstrap path
 * can never run twice even if two tabs race.
 */
export async function bootstrapAdmin(
  name: string,
  email: string,
  password: string,
): Promise<{ error: string } | void> {
  if (!name.trim()) return { error: 'Впиши имя.' }
  if (!EMAIL_RE.test(email.trim())) return { error: 'Некорректный email.' }
  if (password.length < 8) return { error: 'Пароль — минимум 8 символов.' }

  const existing = await sql`SELECT 1 FROM users LIMIT 1`
  if (existing.length > 0) return { error: 'Аккаунт уже создан — используй форму входа.' }

  let userId: number
  try {
    const rows = await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${await hashPassword(password)}, 'admin')
      RETURNING id`
    userId = (rows[0] as { id: number }).id
  } catch (e) {
    return { error: /unique/i.test(String(e)) ? 'Этот email уже занят.' : 'Не вышло создать аккаунт.' }
  }
  await startSession(userId, true)
  await logAudit(name.trim())
}

export async function signIn(
  email: string,
  password: string,
  remember: boolean,
): Promise<{ error: string } | void> {
  const rows = (await sql`
    SELECT id, name, password_hash FROM users
    WHERE email = ${email.trim().toLowerCase()} AND disabled_at IS NULL`) as {
    id: number
    name: string
    password_hash: string
  }[]
  const user = rows[0]
  // Same generic error either way — confirming "no such email" to a stranger is a
  // free account-enumeration oracle, so a bad email and a bad password look identical.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: 'Неверный email или пароль.' }
  }
  await startSession(user.id, remember)
  await logAudit(user.name)
}

export async function signOut(): Promise<void> {
  const jar = await cookies()
  await destroySession(jar.get(SESSION_COOKIE)?.value)
  jar.delete(SESSION_COOKIE)
}
