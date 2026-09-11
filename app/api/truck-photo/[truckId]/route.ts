import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { companyScope } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Своё фото трака. Зеркало /api/driver-photo/[truckId]: те же байты в Neon, та же
// проверка компании через trucks, тот же короткий список типов картинок.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params
  const rows = await sql`
    SELECT m.truck_photo_mime AS mime, encode(m.truck_photo, 'base64') AS b64
    FROM truck_meta m JOIN trucks t ON t.id = m.truck_id
    WHERE m.truck_id = ${Number(truckId)} AND t.company_id = ${await companyScope()}
      AND m.truck_photo IS NOT NULL`
  const row = rows[0] as { mime: string; b64: string } | undefined
  if (!row) return new NextResponse('Not found', { status: 404 })

  const mime = (row.mime || '').split(';')[0]!.trim().toLowerCase()
  const ok = mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp'
  return new NextResponse(Buffer.from(row.b64, 'base64'), {
    headers: {
      'content-type': ok ? mime : 'application/octet-stream',
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      ...(ok ? {} : { 'content-disposition': 'attachment' }),
    },
  })
}
