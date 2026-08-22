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
import { applySchema, schemaInstalled } from '@/lib/install'
import { setSetting } from '@/lib/settings'
import { t } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n-server'

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
 * Первый запуск, он же установка: при необходимости накатывает схему, создаёт
 * первый аккаунт (он становится администратором) и записывает профиль компании.
 *
 * Три шага здесь, а не в трёх местах, потому что для клиента это один шаг —
 * «поставить приложение». Раньше схему накатывали командой с нашей машины, а
 * профиль компании передавали её флагами; клиент не мог сделать ни того, ни
 * другого, и каждая установка упиралась в нас.
 *
 * Дверь та же самая, что и была: как только существует хоть один настоящий
 * аккаунт, эта функция отказывает — и это же закрывает установку от посторонних.
 * Проверка повторяется на сервере, чтобы две вкладки не прошли её одновременно.
 */
export async function bootstrapAdmin(
  name: string,
  email: string,
  password: string,
  coName: string,
  coMcdot: string,
): Promise<{ error: string } | void> {
  const locale = await getLocale()
  if (!name.trim()) return { error: t(locale, 'login.error.enterName') }
  if (!EMAIL_RE.test(email.trim())) return { error: t(locale, 'login.error.badEmail') }
  if (password.length < 8) return { error: t(locale, 'login.error.passwordMin') }
  if (!coName.trim()) return { error: t(locale, 'login.error.enterCompany') }

  // Пустая база: сначала схема, иначе следующий же запрос упадёт на отсутствующей
  // таблице. schema.sql идемпотентна, так что гонка двух вкладок здесь ничего не
  // ломает — второй проход просто ничего не создаёт.
  if (!(await schemaInstalled())) {
    try {
      await applySchema()
    } catch (e) {
      console.error('applySchema failed', e)
      return { error: t(locale, 'login.error.schemaFailed') }
    }
  }

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
  // Профиль компании — здесь, а не «потом в настройках»: lib/invoice.ts отказывается
  // выставлять счёт, пока co_name и co_mcdot пустые, и установка, которая выглядит
  // законченной, ломается на первом же счёте. MC/DOT можно дописать позже, название —
  // нет, поэтому обязательное только оно.
  await setSetting('co_name', coName.trim())
  if (coMcdot.trim()) await setSetting('co_mcdot', coMcdot.trim())

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
    return { error: t(await getLocale(), 'login.error.badCredentials') }
  }
  await startSession(user.id, remember)
  await logAudit(user.name)
}

export async function signOut(): Promise<void> {
  const jar = await cookies()
  await destroySession(jar.get(SESSION_COOKIE)?.value)
  jar.delete(SESSION_COOKIE)
}
