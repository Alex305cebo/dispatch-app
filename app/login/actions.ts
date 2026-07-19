'use server'

import { cookies, headers } from 'next/headers'
import { AUTH_COOKIE, pinHash } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function signIn(
  pin: string,
  remember: boolean,
  who: string,
): Promise<{ error: string } | void> {
  const expected = process.env.APP_PIN
  if (!expected) return { error: 'APP_PIN не настроен на сервере.' }
  if (pin !== expected) return { error: 'Неверный PIN.' }

  const jar = await cookies()
  jar.set(AUTH_COOKIE, await pinHash(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // "Remember this computer": persistent for a year — log in once and that's it.
    // Unchecked → no maxAge, so a session cookie the browser clears on close, and
    // the checkbox comes back next visit. Standard remember-me pattern.
    ...(remember ? { maxAge: 60 * 60 * 24 * 365 } : {}),
  })

  // Login audit — who, from what device, and the city of the IP. Best-effort: a
  // failed insert or geolocation must never block sign-in.
  try {
    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
    const { ipCity } = await import('@/lib/geo-routing')
    const city = await ipCity(ip)
    await sql`INSERT INTO logins (who, ip, user_agent, city)
              VALUES (${who.trim() || null}, ${ip}, ${h.get('user-agent')}, ${city})`
  } catch {
    // ignore — audit is nice-to-have, not a gate
  }
}
