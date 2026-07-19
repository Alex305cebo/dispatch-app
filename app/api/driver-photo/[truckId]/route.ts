import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Streams a driver photo. Mirrors /api/docs/[id] — same bytea-in-Neon pattern,
// separate route because the photo lives on truck_meta, not documents.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ truckId: string }> },
) {
  const { truckId } = await params
  const rows = await sql`
    SELECT driver_photo_mime AS mime, encode(driver_photo, 'base64') AS b64
    FROM truck_meta WHERE truck_id = ${Number(truckId)} AND driver_photo IS NOT NULL`
  const row = rows[0] as { mime: string; b64: string } | undefined
  if (!row) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(Buffer.from(row.b64, 'base64'), {
    headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=3600' },
  })
}
