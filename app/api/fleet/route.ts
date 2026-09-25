import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { secretMatches } from '@/lib/secret-compare'

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
  if (!secretMatches(req.headers.get('x-fleet-token'), secret)) {
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
              ${r.location ?? null}, ${r.lat ?? null}, ${r.lng ?? null}, ${r.eldSeen ?? null}, NOW(6))
      ON DUPLICATE KEY UPDATE
        driver_name = VALUES(driver_name), hos_percent = VALUES(hos_percent),
        drive_status = VALUES(drive_status), location = VALUES(location),
        lat = VALUES(lat), lng = VALUES(lng), eld_seen = VALUES(eld_seen), updated_at = NOW(6)`
    updated++
  }
  return NextResponse.json({ ok: true, updated })
}
