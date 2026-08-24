'use server'

import { cookies, headers } from 'next/headers'
import { sql } from '@/lib/db'
import { createSession, SESSION_COOKIE, SESSION_DAYS } from '@/lib/auth'
import { googleClientId, verifyGoogleToken } from '@/lib/google-auth'
import { applySchema, schemaInstalled } from '@/lib/install'
import { setSetting } from '@/lib/settings'
import { t } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n-server'

async function startSession(userId: number) {
  const token = await createSession(userId)
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // Через Google входят «насовсем»: смысл кнопки в том, чтобы не спрашивать
    // ничего каждый раз. Выйти по-прежнему можно в меню аккаунта.
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  })
}

async function logAudit(who: string) {
  try {
    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
    const { ipCity } = await import('@/lib/geo-routing')
    await sql`INSERT INTO logins (who, ip, user_agent, city)
              VALUES (${who}, ${ip}, ${h.get('user-agent')}, ${await ipCity(ip)})`
  } catch {
    // журнал — приятно иметь, но не повод не пустить внутрь
  }
}

/** Что делать браузеру после ответа сервера. 'wait' — аккаунт создан, но ждёт
 * подтверждения администратором; показываем экран ожидания, а не пускаем внутрь. */
export type GoogleResult = { error: string } | { ok: true } | { wait: true }

/**
 * Вход через Google — для всех: и для администратора, и для диспетчеров.
 *
 * Логика та же, что у входа с паролем, и намеренно: Google приносит только
 * подтверждённый email, а права мы по-прежнему выдаём сами.
 *
 * • email совпал с существующим аккаунтом → входит с его ролью;
 * • совпал, но заявка не подтверждена или человек отключён → внутрь нельзя;
 * • не совпал ни с кем, а аккаунты в базе есть → создаётся ЗАЯВКА, которую
 *   администратор подтверждает в «Люди». Иначе любой, у кого есть почта Google,
 *   заходил бы в чужую компанию;
 * • не совпал и база пуста → это первый запуск, человек становится
 *   администратором. Название компании после этого спросит сама админка.
 *
 * Пароль такому аккаунту не заводится (password_hash пустой, verifyPassword его
 * всегда отвергает): вход только через Google, и красть нечего.
 */
export async function signInWithGoogle(idToken: string): Promise<GoogleResult> {
  const locale = await getLocale()
  const clientId = googleClientId()
  if (!clientId) return { error: t(locale, 'login.error.googleOff') }

  const g = await verifyGoogleToken(idToken, clientId)
  if (!g) return { error: t(locale, 'login.error.googleFailed') }

  if (!(await schemaInstalled())) {
    try {
      await applySchema()
    } catch (e) {
      console.error('applySchema failed', e)
      return { error: t(locale, 'login.error.schemaFailed') }
    }
  }

  const rows = (await sql`
    SELECT id, name, role, disabled_at, pending_since FROM users
    WHERE email = ${g.email} AND is_demo = FALSE`) as {
    id: number
    name: string
    role: 'admin' | 'dispatcher'
    disabled_at: string | null
    pending_since: string | null
  }[]
  const user = rows[0]

  if (user) {
    if (user.disabled_at) return { error: t(locale, 'login.error.badCredentials') }
    if (user.pending_since) return { wait: true }
    await startSession(user.id)
    await logAudit(user.name)
    return { ok: true }
  }

  const anyUser = await sql`SELECT 1 FROM users WHERE is_demo = FALSE LIMIT 1`
  const first = anyUser.length === 0

  const created = (await sql`
    INSERT INTO users (name, email, password_hash, role, pending_since)
    VALUES (${g.name}, ${g.email}, '', ${first ? 'admin' : 'dispatcher'}, ${first ? null : new Date().toISOString()})
    RETURNING id`) as { id: number }[]
  const id = created[0]!.id

  if (!first) return { wait: true }

  // Первый аккаунт установки. Согласие с условиями — фактом входа через Google,
  // с меткой времени: галочки на этом пути нет, а отметка о согласии нужна.
  await setSetting(`consent:${id}`, new Date().toISOString())
  await startSession(id)
  await logAudit(g.name)
  return { ok: true }
}
