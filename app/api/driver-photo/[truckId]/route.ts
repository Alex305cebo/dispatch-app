import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { companyScope } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Streams a driver photo. Mirrors /api/docs/[id] — same bytea-in-Neon pattern,
// separate route because the photo lives on truck_meta, not documents. Joined to
// trucks to scope by company, same reason as /api/docs/[id].
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ truckId: string }> },
) {
  const { truckId } = await params
  const rows = await sql`
    SELECT m.driver_photo_mime AS mime, encode(m.driver_photo, 'base64') AS b64
    FROM truck_meta m JOIN trucks t ON t.id = m.truck_id
    WHERE m.truck_id = ${Number(truckId)} AND t.company_id = ${await companyScope()}
      AND m.driver_photo IS NOT NULL`
  const row = rows[0] as { mime: string; b64: string } | undefined
  if (!row) return new NextResponse('Not found', { status: 404 })

  // Тип приходит из браузера при загрузке, поэтому здесь он не «как есть», а из
  // короткого списка картинок: с типом text/html этот же адрес выполнял бы чужой
  // скрипт на нашем домене (та же дыра, что закрыта в /api/docs/[id]).
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
