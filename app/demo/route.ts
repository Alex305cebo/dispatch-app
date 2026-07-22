import { NextResponse, type NextRequest } from 'next/server'
import { startDemoSession } from '@/lib/demo'

export const dynamic = 'force-dynamic'

// The "Попробовать демо" link on /login. A GET (not a form/action) so it's a plain
// one-click link — signs the browser in as the shared public demo account (fresh
// sandbox data if the last visitor's has gone stale) and drops straight into the app.
export async function GET(req: NextRequest) {
  await startDemoSession()
  return NextResponse.redirect(new URL('/', req.url))
}
