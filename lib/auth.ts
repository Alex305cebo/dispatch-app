// Web Crypto only (crypto.subtle, crypto.randomUUID, crypto.getRandomValues) — this
// module is imported from middleware.ts, which runs on the Edge runtime and has no
// node:crypto. The same functions work identically in ordinary server actions, so
// one implementation covers both password hashing and session verification.

import { sql } from './db.ts'

const PBKDF2_ITERATIONS = 100_000

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** "salt:hash", both hex — stored in users.password_hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt)
  return `${toHex(salt)}:${toHex(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const hash = await pbkdf2(password, fromHex(saltHex))
  const hex = toHex(hash)
  if (hex.length !== hashHex.length) return false
  // Constant-time compare — a timing difference on early mismatch is a real side
  // channel for a hash comparison, cheap enough to close.
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ hashHex.charCodeAt(i)
  return diff === 0
}

export const SESSION_COOKIE = 'dispatch_session'
// "Remember this device" persists the cookie itself this long; the session ROW gets
// the same lifetime either way — an unremembered login is ended by the browser
// dropping the (session-only) cookie on close, not by the server-side row expiring.
export const SESSION_DAYS = 365

export type SessionUser = { id: number; name: string; email: string; role: 'admin' | 'dispatcher' }

export async function createSession(userId: number): Promise<string> {
  // Two UUIDs concatenated: 72 hex chars of entropy, plenty for a bearer token that
  // only needs to resist guessing, not memorability.
  const token = crypto.randomUUID() + crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAt})`
  return token
}

/** Session lookup used by middleware on every request — a disabled user or an
 * expired/deleted session both come back null, no separate check needed. */
export async function sessionUser(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null
  const rows = await sql`
    SELECT u.id, u.name, u.email, u.role FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now() AND u.disabled_at IS NULL`
  return (rows[0] as SessionUser | undefined) ?? null
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return
  await sql`DELETE FROM sessions WHERE token = ${token}`
}
