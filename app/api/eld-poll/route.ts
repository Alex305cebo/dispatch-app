import { NextResponse, type NextRequest } from 'next/server'
import { fleetSnapshot, liveShareSnapshot } from '@/lib/eld'
import { backfillBrokerMc } from '@/lib/mc-backfill'
import { samsaraSnapshot } from '@/lib/eld-samsara'

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
  // Заодно дозаполняем брокерам MC. Живёт здесь, а не в своём расписании, потому что
  // внешний планировщик у нас один и настроен на этот адрес: отдельный крон пришлось
  // бы заводить руками, а это ровно та работа, которой быть не должно. Партия
  // маленькая — реестр отвечает медленно, и опрос траков ждать не должен.
  const [share, key, samsara, mc] = await Promise.all([
    liveShareSnapshot(),
    fleetSnapshot(),
    samsaraSnapshot(),
    backfillBrokerMc('default', 3).catch(() => null),
  ])
  const anyUpdated =
    ('updated' in share && share.updated > 0) ||
    ('updated' in key && key.updated > 0) ||
    ('updated' in samsara && samsara.updated > 0)
  return NextResponse.json({ share, key, samsara, mc }, { status: anyUpdated ? 200 : 503 })
}
