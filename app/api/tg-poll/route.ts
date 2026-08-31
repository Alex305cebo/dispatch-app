import { NextResponse, type NextRequest } from 'next/server'
import { intakeDriverMedia } from '@/lib/tg-intake'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Free external scheduler (cron-job.org) hits this every few minutes to pull driver
// photos into loads. Guarded by CRON_SECRET like /api/eld-poll.
//
// Только ЧТЕНИЕ: забрать присланные водителями файлы и разложить по грузам.
// Ничего не отправляет — приложение не пишет в Telegram само (см. lib/tg-intake).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const given = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret')
  if (!secret || given !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const intake = await intakeDriverMedia()
  return NextResponse.json({ intake })
}
