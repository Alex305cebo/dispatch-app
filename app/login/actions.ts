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
import { t } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n-server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Тормоз на подбор пароля.
 *
 * Вход — обычный серверный вызов, и до этой правки его можно было дёргать в цикле
 * сколько угодно: ни задержки, ни блокировки. PBKDF2 делает каждую попытку не
 * бесплатной, но это защита от чтения украденной базы, а не от подбора — и она же
 * работает против нас: тысяча попыток в минуту укладывает процессор, даже если ни
 * одна не угадает.
 *
 * Счётчик в памяти процесса, не в базе. Приложение живёт одним процессом Node на
 * своём хостинге, и лишняя таблица под это — миграция, которую пришлось бы катить
 * руками на каждой установке.
 * ponytail: одна копия приложения. Появится вторая — счётчик переезжает в базу,
 * иначе лимит станет вдвое мягче.
 */
const FAILS = new Map<string, { n: number; until: number }>()
const MAX_FAILS = 8
const LOCK_MS = 15 * 60 * 1000

function throttleKey(email: string, ip: string | null): string {
  return `${email.trim().toLowerCase()}|${ip ?? ''}`
}

function lockedOut(key: string): boolean {
  const rec = FAILS.get(key)
  if (!rec) return false
  if (Date.now() > rec.until) {
    FAILS.delete(key)
    return false
  }
  return rec.n >= MAX_FAILS
}

function noteFail(key: string): void {
  const rec = FAILS.get(key)
  const fresh = !rec || Date.now() > rec.until
  FAILS.set(key, { n: fresh ? 1 : rec.n + 1, until: Date.now() + LOCK_MS })
  // Карта не растёт бесконечно: раз в вызов подчищаем истёкшее.
  if (FAILS.size > 500) for (const [k, v] of FAILS) if (Date.now() > v.until) FAILS.delete(k)
}

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
  const locale = await getLocale()
  if (!name.trim()) return { error: t(locale, 'login.error.enterName') }
  if (!EMAIL_RE.test(email.trim())) return { error: t(locale, 'login.error.badEmail') }
  if (password.length < 8) return { error: t(locale, 'login.error.passwordMin') }

  const existing = await sql`SELECT 1 FROM users WHERE is_demo = FALSE LIMIT 1`
  if (existing.length > 0) return { error: t(locale, 'login.error.accountExists') }

  let userId: number
  try {
    const rows = await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${await hashPassword(password)}, 'admin')
      RETURNING id`
    userId = (rows[0] as { id: number }).id
  } catch (e) {
    return {
      error: /unique/i.test(String(e)) ? t(locale, 'login.error.emailTaken') : t(locale, 'login.error.createFailed'),
    }
  }
  await startSession(userId, true)
  await logAudit(name.trim())
}

export async function signIn(
  email: string,
  password: string,
  remember: boolean,
): Promise<{ error: string } | void> {
  const ip = ((await headers()).get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
  const key = throttleKey(email, ip)
  if (lockedOut(key)) return { error: t(await getLocale(), 'login.error.tooManyTries') }
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
    noteFail(key)
    return { error: t(await getLocale(), 'login.error.badCredentials') }
  }
  FAILS.delete(key)
  await startSession(user.id, remember)
  await logAudit(user.name)
}

export async function signOut(): Promise<void> {
  const jar = await cookies()
  await destroySession(jar.get(SESSION_COOKIE)?.value)
  jar.delete(SESSION_COOKIE)
}
