import { NextResponse, type NextRequest } from 'next/server'
import { tgMedia } from '@/lib/telegram'
import { getCurrentUser } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Behind the same login gate as everything else (middleware). The media comes from
// the CALLER's own connected account — the chat view only ever links to media in the
// account the current user is viewing, so pulling by their own uid is correct.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chat: string; msg: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })
  const { chat, msg } = await params
  const media = await tgMedia(user.id, chat, Number(msg)).catch(() => null)
  if (!media) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(Buffer.from(media.bytes), {
    headers: {
      'content-type': media.mime,
      'content-disposition': 'inline',
      'cache-control': 'private, max-age=3600',
    },
  })
}
