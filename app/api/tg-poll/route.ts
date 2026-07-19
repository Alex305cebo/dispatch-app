import { NextResponse, type NextRequest } from 'next/server'
import { intakeDriverMedia, remindMissingPods } from '@/lib/tg-intake'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Free external scheduler (cron-job.org) hits this every few minutes to pull driver
// photos into loads and chase missing PODs. Guarded by CRON_SECRET like /api/eld-poll.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const given = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret')
  if (!secret || given !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const [intake, reminders] = await Promise.all([intakeDriverMedia(), remindMissingPods()])
  return NextResponse.json({ intake, reminders })
}
