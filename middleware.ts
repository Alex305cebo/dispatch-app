import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, sessionUser } from '@/lib/auth'
import { getSetting } from '@/lib/settings'

export async function middleware(req: NextRequest) {
  // Strip any client-supplied identity headers FIRST, unconditionally, on every
  // request this middleware sees (including /demo below) — only the session lookup
  // in this function is allowed to set them. Without this, a request straight to
  // /demo (which skips the auth check) could hand the app a forged x-user-role:
  // admin header, since nothing downstream would otherwise know it didn't come
  // from us.
  const headers = new Headers(req.headers)
  headers.delete('x-user-id')
  headers.delete('x-user-name')
  headers.delete('x-user-role')
  headers.delete('x-company-id')

  // Public, no session needed — signs the browser in as the demo account and
  // redirects, see app/demo/route.ts.
  if (req.nextUrl.pathname.startsWith('/demo')) {
    return NextResponse.next({ request: { headers } })
  }

  // Public, no session needed — a single truck's live map for sharing with a
  // broker/customer, see app/track/[id]/page.tsx. Only truck number + location.
  if (req.nextUrl.pathname.startsWith('/track/')) {
    return NextResponse.next({ request: { headers } })
  }

  // Open-access mode (admin-panel switch, app/admin/actions.ts): the whole app
  // works without signing in. /admin stays exempt so the switch that turns this
  // back off can never itself be reached without a real login.
  if (!req.nextUrl.pathname.startsWith('/admin') && (await getSetting('open_access')) === '1') {
    return NextResponse.next({ request: { headers } })
  }

  const user = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value)

  if (!user) {
    // rewrite, not redirect: the QR carries the load in the URL hash, and a redirect
    // would drop it. Rewriting keeps the address bar — and the hash — intact, so after
    // sign-in the load is still there.
    return NextResponse.rewrite(new URL('/login', req.url))
  }

  // Downstream Server Components read these via next/headers' headers() instead of
  // hitting the DB again — middleware already did the one lookup for this request.
  // encodeURIComponent: HTTP header VALUES must be Latin1/ASCII (the Headers API
  // throws on anything past code point 255) — a name in Cyrillic (real dispatchers,
  // and the seeded "Демо" account) would otherwise crash every single request.
  // lib/session.ts decodes it back on the read side.
  headers.set('x-user-id', String(user.id))
  headers.set('x-user-name', encodeURIComponent(user.name))
  headers.set('x-user-role', user.role)
  headers.set('x-company-id', user.companyId)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // These API routes are excluded: their callers (extension, cron pingers) can't
  // send a session cookie — each guards itself with its own shared token instead.
  matcher: ['/((?!_next/static|_next/image|icon|apple-icon|manifest.webmanifest|favicon.ico|api/fleet|api/eld-poll|api/tg-poll|api/health).*)'],
}
