import { NextResponse } from 'next/server'

// Cheap liveness probe for an external uptime monitor. Returns 200 without touching the
// DB or a session, so it answers instantly even when the app is under load — and it's
// excluded from the auth middleware (see middleware.ts matcher) so it never does the
// per-request session lookup. A monitor hitting this every few minutes tells us the app
// is down within a minute, instead of finding out from a user staring at a 503.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
