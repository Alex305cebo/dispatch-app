import { NextResponse } from 'next/server'
import { startDemoSession } from '@/lib/demo'
import { SESSION_COOKIE } from '@/lib/auth'
import { getLocale } from '@/lib/i18n-server'

export const dynamic = 'force-dynamic'

// The "Попробовать демо" link on /login. A GET (not a form/action) so it's a plain
// one-click link — signs the browser in as the shared public demo account (fresh
// sandbox data if the last visitor's has gone stale) and drops straight into the app.
export async function GET(req: Request) {
  // Выключено у клиентских установок (форма установки пишет demo_public='0').
  // Проверка здесь, а не только на кнопке: кнопку убрать мало — адрес /demo
  // публичный, его достаточно набрать руками. Ключа нет — демо работает, поэтому
  // наши собственные установки правки не замечают.
  const { getSetting } = await import('@/lib/settings')
  if ((await getSetting('demo_public')) === '0') {
    return new NextResponse(null, { status: 307, headers: { Location: '/login' } })
  }
  const locale = await getLocale()
  const token = await startDemoSession(locale)
  // `?next=` lets a link hand the demo a destination — the Telegram bot sends
  // /demo?next=/load#rate=…&origin=… so a parsed rate con opens straight in the load
  // form. The fragment survives on its own: the browser re-attaches it to a redirect
  // whose Location carries no fragment of its own (RFC 7231 §7.1.2), and it never
  // reaches us anyway, which is the whole point of lib/qr-load.ts.
  //
  // Only a same-site path is accepted. This endpoint is public and unauthenticated, so
  // anyone can paste it anywhere: without this test, "//attacker.example" or
  // "/\attacker.example" would turn it into an open redirect wearing our domain —
  // a link that opens with app.mayalogisticsinc.com and lands somewhere else.
  // (.example is reserved by RFC 2606 and can never resolve, so nobody reading this
  // comment can accidentally visit a stranger's domain.)
  const raw = new URL(req.url).searchParams.get('next')
  const next = raw && /^\/[^/\\]/.test(raw) ? raw : '/'
  // Relative Location on purpose: behind Hostinger's reverse proxy the request's own
  // URL is the internal http://0.0.0.0:3000 bind address, so an absolute redirect
  // (new URL('/', req.url)) sent the browser to 0.0.0.0 (ERR_ADDRESS_INVALID). A
  // relative "/" is resolved by the browser against the public URL it actually
  // requested — dispatch4you.pro.
  const res = new NextResponse(null, { status: 307, headers: { Location: next } })
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
