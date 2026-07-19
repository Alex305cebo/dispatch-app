import { NextResponse, type NextRequest } from 'next/server'
import { fleetSnapshot, liveShareSnapshot } from '@/lib/eld'

export const dynamic = 'force-dynamic'

// Hit by the free external scheduler (cron-job.org, ~every 5 min) — Vercel Hobby
// cron only fires daily. Guarded by CRON_SECRET; without it the endpoint is closed.
// Runs BOTH sources: the Live Share links (GPS, no vendor key) and the vendor-key
// API (GPS + HOS, once a key exists). Either can be absent without failing the other.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const given =
    req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret')
  if (!secret || given !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const [share, key] = await Promise.all([liveShareSnapshot(), fleetSnapshot()])
  const anyUpdated =
    ('updated' in share && share.updated > 0) || ('updated' in key && key.updated > 0)
  return NextResponse.json({ share, key }, { status: anyUpdated ? 200 : 503 })
}
