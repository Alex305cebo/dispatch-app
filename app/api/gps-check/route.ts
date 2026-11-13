import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/session'
import { sql } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { eldDebug } from '@/lib/eld'
import { samsaraToken } from '@/lib/eld-samsara'

export const dynamic = 'force-dynamic'

// Разбор «трак не двигается» (11/13/26): что сейчас отдаёт каждый источник по одному
// траку, что лежит в fleet_status и журнал точек. Только админ, только чтение.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin' || user.isDemo || user.isWorkspace)
    return new NextResponse('Forbidden', { status: 403 })
  const unit = (req.nextUrl.searchParams.get('unit') ?? '').trim()
  if (!/^[\w-]{1,20}$/.test(unit)) return new NextResponse('unit?', { status: 400 })
  const like = `%${unit}%`
  const [db, log, settings] = await Promise.all([
    sql`SELECT unit, location, lat, lng, drive_status, eld_seen, updated_at FROM fleet_status WHERE unit LIKE ${like}`,
    sql`SELECT lat, lng, drive_status, location, at FROM truck_position_log WHERE unit LIKE ${like} ORDER BY at DESC LIMIT 30`,
    getSettings(['eld_share_shape', 'fleet_poll_at', 'fleet_auto_refresh_at']).then((m) => Object.fromEntries(m)),
  ])
  const sources = await eldDebug(unit)
  let samsara: unknown = 'not configured'
  const st = await samsaraToken()
  if (st) {
    try {
      const r = await fetch('https://api.samsara.com/fleet/vehicles/stats?types=gps', {
        headers: { Authorization: `Bearer ${st}` },
        cache: 'no-store',
      })
      const b = r.ok ? ((await r.json()) as { data?: { name?: string }[] }) : await r.text()
      samsara = {
        http: r.status,
        vehicle: typeof b === 'string' ? b.slice(0, 300) : (b.data ?? []).filter((v) => (v.name ?? '').includes(unit)),
      }
    } catch (e) {
      samsara = String(e)
    }
  }
  return NextResponse.json({ now: new Date().toISOString(), db, log, settings, sources, samsara })
}
