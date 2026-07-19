import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// The DispatchPro extension POSTs the ELD snapshot here from the portal page
// (read-only ELD, ~1/min). Shared-secret guard so only our extension can write;
// no FLEET_INGEST_TOKEN set on the server → the endpoint stays closed.
type Incoming = {
  unit?: string
  vehicleUnit?: string
  driverName?: string
  hosPercent?: number
  driveStatus?: string
  location?: string
  lat?: number
  lng?: number
  eldSeen?: string
}

export async function POST(req: NextRequest) {
  const secret = process.env.FLEET_INGEST_TOKEN
  if (!secret || req.headers.get('x-fleet-token') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const list = (Array.isArray(body) ? body : []) as Incoming[]
  if (!list.length) return NextResponse.json({ error: 'empty' }, { status: 400 })

  let updated = 0
  for (const r of list) {
    const unit = String(r.unit ?? r.vehicleUnit ?? '').trim()
    if (!unit) continue
    await sql`
      INSERT INTO fleet_status
        (unit, driver_name, hos_percent, drive_status, location, lat, lng, eld_seen, updated_at)
      VALUES (${unit}, ${r.driverName ?? null}, ${r.hosPercent ?? null}, ${r.driveStatus ?? null},
              ${r.location ?? null}, ${r.lat ?? null}, ${r.lng ?? null}, ${r.eldSeen ?? null}, now())
      ON CONFLICT (unit) DO UPDATE SET
        driver_name = EXCLUDED.driver_name, hos_percent = EXCLUDED.hos_percent,
        drive_status = EXCLUDED.drive_status, location = EXCLUDED.location,
        lat = EXCLUDED.lat, lng = EXCLUDED.lng, eld_seen = EXCLUDED.eld_seen, updated_at = now()`
    updated++
  }
  return NextResponse.json({ ok: true, updated })
}
