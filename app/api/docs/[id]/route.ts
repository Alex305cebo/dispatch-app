import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { companyScope } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Streams a stored document. Behind the session gate (middleware) — the browser
// sends the auth cookie on normal navigation, so links "just work" for a signed-in
// user. Scoped by company so a demo session can never fetch a real document (or vice
// versa) just by guessing its id.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const rows = await sql`
    SELECT title, mime, encode(data, 'base64') AS b64 FROM documents
    WHERE id = ${Number(id)} AND company_id = ${await companyScope()}`
  const doc = rows[0] as { title: string; mime: string; b64: string } | undefined
  if (!doc) return new NextResponse('Not found', { status: 404 })

  // ?download=1 → force a save-to-computer; otherwise open inline in the browser tab.
  const download = new URL(_req.url).searchParams.has('download')
  return new NextResponse(Buffer.from(doc.b64, 'base64'), {
    headers: {
      'content-type': doc.mime,
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(doc.title)}"`,
      'cache-control': 'private, max-age=3600',
    },
  })
}
