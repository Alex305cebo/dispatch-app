import { NextResponse } from 'next/server'
import { startDemoSession } from '@/lib/demo'
import { SESSION_COOKIE } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

// The "Попробовать демо" link on /login. A GET (not a form/action) so it's a plain
// one-click link — signs the browser in as the shared public demo account (fresh
// sandbox data if the last visitor's has gone stale) and drops straight into the app.
export async function GET() {
  const locale = await getLocale()
  const token = await startDemoSession(locale)
  // Relative Location on purpose: behind Hostinger's reverse proxy the request's own
  // URL is the internal http://0.0.0.0:3000 bind address, so an absolute redirect
  // (new URL('/', req.url)) sent the browser to 0.0.0.0 (ERR_ADDRESS_INVALID). A
  // relative "/" is resolved by the browser against the public URL it actually
  // requested — dispatch4you.pro.
  const res = new NextResponse(null, { status: 307, headers: { Location: '/' } })
  // Set the cookie directly on THIS response so it attaches regardless of proxying.
  // Session-only (no maxAge) — a demo visit shouldn't linger like a remembered login.
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
  return res
}
