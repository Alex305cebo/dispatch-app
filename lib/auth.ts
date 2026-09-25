// Web Crypto only (crypto.subtle, crypto.randomUUID, crypto.getRandomValues) — this
// module is imported from middleware.ts, which runs on the Edge runtime and has no
// node:crypto. The same functions work identically in ordinary server actions, so
// one implementation covers both password hashing and session verification.

import { sql } from './db.ts'
import { hashSessionToken, THROTTLE, throttleEmail, attemptAllowed, type ThrottleKind } from './auth-core.ts'

// Хеширование паролей переехало в auth-core.ts (там его проверяет тест); отсюда —
// как раньше, чтобы вызывающим ничего не менять.
export { hashPassword, verifyPassword, needsRehash } from './auth-core.ts'

/** Код восстановления: 12 знаков, без похожих друг на друга символов (0/O, 1/I/L),
 * группами по четыре — такие диктуют по телефону и переписывают с бумажки без
 * ошибок. Энтропии ~57 бит: перебор через форму входа бессмысленен. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`
}
/** Как его ни введи — со строчными, пробелами, без дефисов — сравнивается одно и то же. */
export function normalizeRecoveryCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export const SESSION_COOKIE = 'dispatch_session'
// "Remember this device" persists the cookie itself this long; the session ROW gets
// the same lifetime either way — an unremembered login is ended by the browser
// dropping the (session-only) cookie on close, not by the server-side row expiring.
export const SESSION_DAYS = 365

export type SessionUser = {
  id: number
  name: string
  email: string
  role: 'admin' | 'dispatcher'
  /** 'demo' for the seeded public sandbox account, 'default' for every real user —
   * every trucks/loads/documents query is filtered by this so demo data can never
   * mix with real company data. */
  companyId: 'default' | 'demo'
}

export async function createSession(userId: number): Promise<string> {
  // Two UUIDs concatenated: 72 hex chars of entropy, plenty for a bearer token that
  // only needs to resist guessing, not memorability.
  const token = crypto.randomUUID() + crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
  // В базу — хеш, в куку — сам токен (почему — auth-core.ts, hashSessionToken).
  await sql`INSERT INTO sessions (token, user_id, expires_at)
            VALUES (${await hashSessionToken(token)}, ${userId}, ${new Date(expiresAt)})`
  return token
}

/** Session lookup used by middleware on every request — a disabled user or an
 * expired/deleted session both come back null, no separate check needed.
 * Ищется хеш куки: строки, записанные до хеширования (токен как есть), больше ни с
 * чем не совпадают — все один раз входят заново, и утёкшие токены мертвы. */
export async function sessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null
  const rows = (await sql`
    SELECT u.id, u.name, u.email, u.role, u.is_demo FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${await hashSessionToken(token)} AND s.expires_at > NOW(6) AND u.disabled_at IS NULL AND u.pending_since IS NULL`) as
    | { id: number; name: string; email: string; role: 'admin' | 'dispatcher'; is_demo: boolean }[]
  const row = rows[0]
  if (!row) return null
  return { id: row.id, name: row.name, email: row.email, role: row.role, companyId: row.is_demo ? 'demo' : 'default' }
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return
  await sql`DELETE FROM sessions WHERE token = ${await hashSessionToken(token)}`
}

/**
 * Засчитать попытку входа или сброса по email — ДО проверки пароля. false — замок
 * закрыт, пароль даже не проверяем.
 *
 * Счётчик в базе (auth_throttle), а не в памяти: процессов приложения несколько, и
 * у каждого была своя Map — лимит мягчал во столько же раз, а перезапуск его
 * обнулял. Два запроса, каждый атомарен сам по себе:
 * 1. окно истекло — строка удаляется, счёт с нуля;
 * 2. +1 к попыткам (строки нет — появится с 1), и RETURNING отдаёт номер ЭТОЙ
 *    попытки. Отдельный SELECT после не годится: сотня одновременных запросов
 *    сначала все прибавляют, потом все читают 100 — проверено, так не проходил
 *    никто, включая законные первые пять. window_at стоит ПЕРВЫМ: MariaDB выполняет
 *    присваивания слева направо, а условию нужно прежнее fails. Для входа окно
 *    сдвигается на каждую пропущенную попытку, отказанные его не продлевают; для
 *    сброса окно считается от первой попытки. Выше max+1 счёт не растёт.
 */
export async function takeAttempt(kind: ThrottleKind, email: string): Promise<boolean> {
  const rule = THROTTLE[kind]
  const key = throttleEmail(email)
  await sql`DELETE FROM auth_throttle
            WHERE kind = ${kind} AND email = ${key} AND window_at <= NOW(6) - INTERVAL ${rule.windowSec} SECOND`
  const rows = (await sql`
    INSERT INTO auth_throttle (kind, email, fails, window_at) VALUES (${kind}, ${key}, 1, NOW(6))
    ON DUPLICATE KEY UPDATE
      window_at = IF(${rule.sliding} AND fails < ${rule.max}, NOW(6), window_at),
      fails = IF(fails > ${rule.max}, fails, fails + 1)
    RETURNING fails`) as { fails: number }[]
  return attemptAllowed(kind, Number(rows[0]?.fails))
}

/** Удачный вход или сброс — счётчик с нуля. */
export async function clearAttempts(kind: ThrottleKind, email: string): Promise<void> {
  await sql`DELETE FROM auth_throttle WHERE kind = ${kind} AND email = ${throttleEmail(email)}`
}
