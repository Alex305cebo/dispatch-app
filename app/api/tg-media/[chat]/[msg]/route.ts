import { NextResponse, type NextRequest } from 'next/server'
import { tgMedia } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Behind the same login gate as everything else (middleware) — only a signed-in
// dispatcher can pull a driver's photo/PDF out of the connected Telegram account.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chat: string; msg: string }> },
) {
  const { chat, msg } = await params
  const media = await tgMedia(chat, Number(msg)).catch(() => null)
  if (!media) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(Buffer.from(media.bytes), {
    headers: {
      'content-type': media.mime,
      'content-disposition': 'inline',
      'cache-control': 'private, max-age=3600',
    },
  })
}
