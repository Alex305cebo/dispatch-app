'use server'

import { cookies, headers } from 'next/headers'
import { sql } from '@/lib/db'
import {
  createSession,
  destroySession,
  generateRecoveryCode,
  hashPassword,
  normalizeRecoveryCode,
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

/** Новый код восстановления для пользователя: в базу — хеш, наружу — сам код.
 * Показывается один раз; потерял — перевыпускается из меню или сбрасывается
 * администратором. */
async function issueRecoveryCode(userId: number): Promise<string> {
  const code = generateRecoveryCode()
  await sql`UPDATE users SET recovery_hash = ${await hashPassword(normalizeRecoveryCode(code))} WHERE id = ${userId}`
  return code
}

export type Created = { error: string } | { recoveryCode: string }

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
): Promise<Created> {
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

  const recoveryCode = await issueRecoveryCode(userId)
  await startSession(userId, true)
  await logAudit(name.trim())
  return { recoveryCode }
}

/**
 * Заявка с экрана входа. Аккаунт создаётся сразу, но с pending_since: внутрь не
 * пускает, пока администратор не подтвердит в «Люди». Открытая регистрация без
 * подтверждения была бы дверью в данные компании для любого прохожего, а
 * «написать админу, чтобы завёл» — той самой зависимостью от одного человека,
 * из-за которой эта кнопка и появилась.
 */
export async function registerRequest(name: string, email: string, password: string): Promise<Created> {
  const locale = await getLocale()
  if (!name.trim()) return { error: t(locale, 'login.error.enterName') }
  if (!EMAIL_RE.test(email.trim())) return { error: t(locale, 'login.error.badEmail') }
  if (password.length < 8) return { error: t(locale, 'login.error.passwordMin') }

  // Пустая база — это установка, а не заявка: первый аккаунт обязан стать админом.
  const existing = await sql`SELECT 1 FROM users WHERE is_demo = FALSE LIMIT 1`
  if (existing.length === 0) return { error: t(locale, 'login.error.useSetup') }

  let userId: number
  try {
    const rows = await sql`
      INSERT INTO users (name, email, password_hash, role, pending_since)
      VALUES (${name.trim()}, ${email.trim().toLowerCase()}, ${await hashPassword(password)}, 'dispatcher', now())
      RETURNING id`
    userId = (rows[0] as { id: number }).id
  } catch (e) {
    return {
      error: /unique/i.test(String(e)) ? t(locale, 'login.error.emailTaken') : t(locale, 'login.error.createFailed'),
    }
  }
  return { recoveryCode: await issueRecoveryCode(userId) }
}

export async function signIn(
  email: string,
  password: string,
  remember: boolean,
): Promise<{ error: string } | void> {
  const locale = await getLocale()
  const rows = (await sql`
    SELECT id, name, password_hash, pending_since FROM users
    WHERE email = ${email.trim().toLowerCase()} AND disabled_at IS NULL`) as {
    id: number
    name: string
    password_hash: string
    pending_since: string | null
  }[]
  const user = rows[0]
  // Same generic error either way — confirming "no such email" to a stranger is a
  // free account-enumeration oracle, so a bad email and a bad password look identical.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: t(locale, 'login.error.badCredentials') }
  }
  // Пароль верный, но заявку ещё не подтвердили. Об этом — прямо: человек сделал
  // всё правильно, и «неверный пароль» здесь было бы ложью.
  if (user.pending_since) return { error: t(locale, 'login.error.pending') }
  await startSession(user.id, remember)
  await logAudit(user.name)
}

/**
 * «Забыл пароль»: email + код восстановления → новый пароль. Без почты и без
 * администратора — единственный админ иначе запирал бы себя навсегда.
 *
 * Код одноразовый: после сброса выдаётся новый, чтобы у человека всегда был
 * действующий. Все прежние сессии гасятся — тот, кто увёл пароль, теряет вход.
 */
export async function resetWithRecovery(email: string, code: string, newPassword: string): Promise<Created> {
  const locale = await getLocale()
  if (newPassword.length < 8) return { error: t(locale, 'login.error.passwordMin') }
  const rows = (await sql`
    SELECT id, name, recovery_hash, pending_since FROM users
    WHERE email = ${email.trim().toLowerCase()} AND is_demo = FALSE AND disabled_at IS NULL`) as {
    id: number
    name: string
    recovery_hash: string | null
    pending_since: string | null
  }[]
  const user = rows[0]
  // Один и тот же ответ на «нет такого email» и «код не тот» — по той же причине,
  // что и при входе: форма без сессии не должна подтверждать, чьи адреса тут есть.
  if (!user || !user.recovery_hash || !(await verifyPassword(normalizeRecoveryCode(code), user.recovery_hash))) {
    return { error: t(locale, 'login.error.badRecovery') }
  }
  await sql`UPDATE users SET password_hash = ${await hashPassword(newPassword)} WHERE id = ${user.id}`
  await sql`DELETE FROM sessions WHERE user_id = ${user.id}`
  const recoveryCode = await issueRecoveryCode(user.id)
  if (!user.pending_since) {
    await startSession(user.id, true)
    await logAudit(user.name)
  }
  return { recoveryCode }
}

export async function signOut(): Promise<void> {
  const jar = await cookies()
  await destroySession(jar.get(SESSION_COOKIE)?.value)
  jar.delete(SESSION_COOKIE)
}
