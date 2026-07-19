import { NextResponse, type NextRequest } from 'next/server'
import { AUTH_COOKIE, pinHash } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const pin = process.env.APP_PIN

  if (!pin) {
    // Fail closed. A deploy that forgot APP_PIN must not be an open door.
    return process.env.NODE_ENV === 'production'
      ? new NextResponse('APP_PIN is not configured on this deployment.', { status: 503 })
      : NextResponse.next()
  }

  if (req.cookies.get(AUTH_COOKIE)?.value === (await pinHash(pin))) {
    return NextResponse.next()
  }

  // rewrite, not redirect: the QR carries the load in the URL hash, and a redirect
  // would drop it. Rewriting keeps the address bar — and the hash — intact, so after
  // sign-in the load is still there.
  return NextResponse.rewrite(new URL('/login', req.url))
}

export const config = {
  // These API routes are excluded: their callers (extension, cron pingers) can't
  // send the PIN cookie — each route guards itself with its own shared token.
  matcher: [
    '/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico|api/fleet|api/eld-poll|api/tg-poll).*)',
  ],
}
