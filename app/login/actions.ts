'use server'

import { cookies, headers } from 'next/headers'
import { sql } from '@/lib/db'
import {
  createSession,
  destroySession,
  hashPassword,
  normalizeRecoveryCode,
  verifyPassword,
  SESSION_COOKIE,
  SESSION_DAYS,
} from '@/lib/auth'
import { applySchema, schemaInstalled } from '@/lib/install'
import { deleteSetting, getSetting, setSetting } from '@/lib/settings'
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

/** Дата рождения — «код восстановления», который не надо записывать.
 *
 * ЧЕСТНО О ЦЕНЕ: дата — слабый секрет (десятки тысяч вариантов, и близкие её
 * знают). Выбрана сознательно, потому что случайные коды владельцы теряли — а
 * потерянный код хуже слабого. Слабость компенсирует замок ниже (throttled):
 * пять неверных попыток — и сброс для этого email заперт на 15 минут, перебор
 * дат становится бессмысленным. Хранится тем же PBKDF2-хешем, что и пароль. */
const BIRTHDAY_RE = /^\d{4}-\d{2}-\d{2}$/
function birthdayOk(b: string): boolean {
  if (!BIRTHDAY_RE.test(b)) return false
  const year = Number(b.slice(0, 4))
  const now = new Date().getFullYear()
  return year >= 1920 && year <= now - 10
}
async function saveBirthday(userId: number, birthday: string): Promise<void> {
  await sql`UPDATE users SET recovery_hash = ${await hashPassword(normalizeRecoveryCode(birthday))} WHERE id = ${userId}`
}

/** Замок от перебора дат: счётчик неудач на email, окно 15 минут, порог 5. */
const TRY_WINDOW_MS = 15 * 60 * 1000
const TRY_MAX = 5
async function throttled(email: string): Promise<boolean> {
  const raw = await getSetting(`pwtry:${email}`)
  if (!raw) return false
  const [n, ts] = raw.split(':').map(Number)
  if (!n || !ts || Date.now() - ts > TRY_WINDOW_MS) return false
  return n >= TRY_MAX
}
async function noteFailure(email: string): Promise<void> {
  const key = `pwtry:${email}`
  const raw = await getSetting(key)
  const [n, ts] = (raw ?? '').split(':').map(Number)
  const fresh = n && ts && Date.now() - ts <= TRY_WINDOW_MS
  await setSetting(key, fresh ? `${n + 1}:${ts}` : `1:${Date.now()}`)
}

/**
 * Первый запуск, он же установка: при необходимости накатывает схему, создаёт
 * первый аккаунт (он становится администратором) и записывает профиль компании.
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
  birthday: string,
  consent: boolean,
): Promise<{ error: string } | void> {
  const locale = await getLocale()
  if (!name.trim()) return { error: t(locale, 'login.error.enterName') }
  if (!EMAIL_RE.test(email.trim())) return { error: t(locale, 'login.error.badEmail') }
  if (password.length < 8) return { error: t(locale, 'login.error.passwordMin') }
  if (!coName.trim()) return { error: t(locale, 'login.error.enterCompany') }
  if (!birthdayOk(birthday)) return { error: t(locale, 'login.error.badBirthday') }
  // Проверка на сервере, а не только галочкой в форме: форму можно обойти.
  if (!consent) return { error: t(locale, 'login.error.needConsent') }

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
  // выставлять счёт, пока co_name и co_mcdot пустые. MC/DOT можно дописать позже,
  // название — нет, поэтому обязательное только оно.
  await setSetting('co_name', coName.trim())
  if (coMcdot.trim()) await setSetting('co_mcdot', coMcdot.trim())

  await saveBirthday(userId, birthday)
  // Согласие — с меткой времени: «галочка стояла» без «когда» ничего не стоит.
  await setSetting(`consent:${userId}`, new Date().toISOString())
  await startSession(userId, true)
  await logAudit(name.trim())
}

/**
 * Заявка с экрана входа. Аккаунт создаётся сразу, но с pending_since: внутрь не
 * пускает, пока администратор не подтвердит в «Люди». Открытая регистрация без
 * подтверждения была бы дверью в данные компании для любого прохожего.
 */
export async function registerRequest(
  name: string,
  email: string,
  password: string,
  birthday: string,
  consent: boolean,
): Promise<{ error: string } | void> {
  const locale = await getLocale()
  if (!name.trim()) return { error: t(locale, 'login.error.enterName') }
  if (!EMAIL_RE.test(email.trim())) return { error: t(locale, 'login.error.badEmail') }
  if (password.length < 8) return { error: t(locale, 'login.error.passwordMin') }
  if (!birthdayOk(birthday)) return { error: t(locale, 'login.error.badBirthday') }
  if (!consent) return { error: t(locale, 'login.error.needConsent') }

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
  await saveBirthday(userId, birthday)
  await setSetting(`consent:${userId}`, new Date().toISOString())
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
 * «Забыли пароль»: email + дата рождения → новый пароль, сразу внутрь. Без почты
 * и без администратора — единственный админ иначе запирал бы себя навсегда.
 * Все прежние сессии гасятся: тот, кто увёл старый пароль, теряет вход.
 */
export async function resetWithRecovery(
  email: string,
  birthday: string,
  newPassword: string,
): Promise<{ error: string } | void> {
  const locale = await getLocale()
  if (newPassword.length < 8) return { error: t(locale, 'login.error.passwordMin') }
  const mail = email.trim().toLowerCase()
  if (await throttled(mail)) return { error: t(locale, 'login.error.tooManyTries') }
  const rows = (await sql`
    SELECT id, name, recovery_hash, pending_since FROM users
    WHERE email = ${mail} AND is_demo = FALSE AND disabled_at IS NULL`) as {
    id: number
    name: string
    recovery_hash: string | null
    pending_since: string | null
  }[]
  const user = rows[0]
  // Один и тот же ответ на «нет такого email» и «дата не та» — по той же причине,
  // что и при входе: форма без сессии не должна подтверждать, чьи адреса тут есть.
  if (!user || !user.recovery_hash || !(await verifyPassword(normalizeRecoveryCode(birthday), user.recovery_hash))) {
    await noteFailure(mail)
    return { error: t(locale, 'login.error.badRecovery') }
  }
  await deleteSetting(`pwtry:${mail}`)
  await sql`UPDATE users SET password_hash = ${await hashPassword(newPassword)} WHERE id = ${user.id}`
  await sql`DELETE FROM sessions WHERE user_id = ${user.id}`
  if (user.pending_since) return { error: t(locale, 'login.error.pending') }
  await startSession(user.id, true)
  await logAudit(user.name)
}

export async function signOut(): Promise<void> {
  const jar = await cookies()
  await destroySession(jar.get(SESSION_COOKIE)?.value)
  jar.delete(SESSION_COOKIE)
}
