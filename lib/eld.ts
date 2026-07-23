// ELD polling — fills fleet_status from the ZigZag API, server-side, no browser.
//
// Endpoint contract CONFIRMED by probing the live API (2026-07-18), unauthenticated:
//   GET https://api.zigzageld.com/eld/dashboard/vehicleStatuses?VehicleId=ALL → 401
//   GET https://api.zigzageld.com/eld/dashboard/driverstatuses               → 401
//   GET https://api.zigzageld.com/eld/<nonsense>                             → 404
// A wrong path 404s while ours 401, so both routes are real and simply need auth.
// The server states the scheme itself: `www-authenticate: Bearer`, and it sends
// `access-control-allow-origin: https://zigzageld.com` — i.e. the dashboard calls
// this same REST API from the browser. It is NOT a WebSocket feed.
//
// Host matters: the older `eldapi.zigzageld.com` serves the same routes but its TLS
// certificate is EXPIRED, so any server-side fetch to it dies before sending. Use
// `api.zigzageld.com` (valid cert, behind Cloudflare).
//
// Still missing: the token itself. See docs/zigzag-api-request.txt — a durable key
// has to come from the vendor; a dashboard session token works only for hours.
//
// Env:
//   ELD_API_KEY   — the token/key from ZigZag. Absent → poller reports no_key.
//   ELD_API_URL   — base, default https://api.zigzageld.com/eld
//   ELD_API_AUTH  — 'bearer' (default, confirmed) | 'x-api-key' | 'x-auth-token'

import { sql } from './db.ts'
import { getSetting } from './settings.ts'
import { haversineMiles, bearing } from './geo.ts'
import { segmentTrail, type HistoryLeg } from './trip-history.ts'
import { t, type Locale } from './i18n.ts'

// Breadcrumb for idle detection + trip history — fleet_status only holds the latest
// point, this keeps a short trail. Pruned to 7 days on every write so it never needs
// a cron. `location` is whatever description string the ELD already gave us for this
// ping — free to keep, and it's what lets a stop leg say "Knoxville, TN" later.
async function logPosition(
  unit: string,
  lat: number | null,
  lng: number | null,
  driveStatus: string | null,
  location: string | null,
) {
  if (lat === null || lng === null) return
  await sql`INSERT INTO truck_position_log (unit, lat, lng, drive_status, location) VALUES (${unit}, ${lat}, ${lng}, ${driveStatus}, ${location})`
  await sql`DELETE FROM truck_position_log WHERE unit = ${unit} AND at < now() - interval '7 days'`
}

/** How long the truck's GPS has stayed within ~0.5mi of its current spot, walking
 * the breadcrumb trail backward. Null if it's been moving or there's no history. */
export async function idleSince(unit: string, lat: number, lng: number): Promise<Date | null> {
  const rows = (await sql`
    SELECT lat, lng, at FROM truck_position_log
    WHERE unit = ${unit} AND at >= now() - interval '12 hours'
    ORDER BY at DESC`) as { lat: number; lng: number; at: string }[]
  let since: Date | null = null
  for (const r of rows) {
    if (haversineMiles({ lat, lng }, { lat: r.lat, lng: r.lng }) > 0.5) break
    since = new Date(r.at)
  }
  return since
}

/** Compass heading (0-360) the truck is moving in, from its recent breadcrumb —
 * points the map's moving-truck arrow the right way instead of a fixed "up". Walks
 * back until it finds a point far enough away to give a real direction (skips GPS
 * jitter); null if the truck hasn't moved enough recently to know. */
export async function headingOf(unit: string, lat: number, lng: number): Promise<number | null> {
  const rows = (await sql`
    SELECT lat, lng FROM truck_position_log
    WHERE unit = ${unit} AND at >= now() - interval '2 hours'
    ORDER BY at DESC`) as { lat: number; lng: number }[]
  for (const r of rows) {
    if (haversineMiles({ lat, lng }, { lat: r.lat, lng: r.lng }) > 0.3) {
      return bearing({ lat: r.lat, lng: r.lng }, { lat, lng })
    }
  }
  return null
}

/** The truck's day as drive/stop legs — what /trucks/[id] shows under "История пути". */
export async function tripHistory(unit: string, hours = 24): Promise<HistoryLeg[]> {
  const rows = (await sql`
    SELECT lat, lng, at, location FROM truck_position_log
    WHERE unit = ${unit} AND at >= now() - interval '1 hour' * ${hours}
    ORDER BY at ASC`) as { lat: number; lng: number; at: string; location: string | null }[]
  return segmentTrail(rows)
}

type VehicleStatus = {
  vehicleUnit?: string | number
  driverName?: string
  odometer?: number
  speed?: number
  engineStatus?: string
  updateDate?: string
  location?: {
    description?: string
    latitude?: number
    longitude?: number
  }
}

type DriverStatus = {
  driverName?: string
  driverStatus?: string
  vehicle?: string | number
  driveTime?: string
  shiftTime?: string
  cycleTime?: string
  breakTime?: string
}

function headers(): Record<string, string> {
  const key = process.env.ELD_API_KEY!
  switch (process.env.ELD_API_AUTH) {
    case 'x-api-key':
      return { 'x-api-key': key }
    case 'x-auth-token':
      return { 'X-AUTH-TOKEN': key }
    default:
      return { Authorization: `Bearer ${key}` }
  }
}

/** "HH:MM" remaining → percent of the 11h drive clock; unparseable → null. */
function hosPercent(driveTime: string | undefined): number | null {
  const m = driveTime?.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const left = Number(m[1]) * 60 + Number(m[2])
  return Math.round(Math.min(100, (left / 660) * 100) * 10) / 10
}

export async function fleetSnapshot(
  locale: Locale = 'ru',
): Promise<{ updated: number } | { error: string }> {
  if (!process.env.ELD_API_KEY) return { error: 'no_key' }
  const base = (process.env.ELD_API_URL ?? 'https://api.zigzageld.com/eld').replace(/\/$/, '')

  let vehicles: VehicleStatus[] = []
  let drivers: DriverStatus[] = []
  try {
    // One fleet-wide call each — the owner's rule: few requests, human rhythm.
    const [vRes, dRes] = await Promise.all([
      fetch(`${base}/dashboard/vehicleStatuses?VehicleId=ALL`, { headers: headers() }),
      fetch(`${base}/dashboard/driverstatuses`, { headers: headers() }),
    ])
    // 401 is the everyday failure here — the dashboard token is short-lived — so
    // name it plainly instead of leaving a bare status code in the logs.
    if (vRes.status === 401 || vRes.status === 403) {
      return { error: t(locale, 'tracking.eldUnavailable') }
    }
    if (!vRes.ok) return { error: `vehicleStatuses HTTP ${vRes.status}` }
    vehicles = (await vRes.json()) as VehicleStatus[]
    // HOS is nice-to-have; a failed driver call must not lose the GPS update.
    if (dRes.ok) drivers = (await dRes.json()) as DriverStatus[]
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  const hosByUnit = new Map<string, DriverStatus>()
  for (const d of drivers) {
    if (d.vehicle !== undefined) hosByUnit.set(String(d.vehicle), d)
  }

  let updated = 0
  for (const v of vehicles) {
    const unit = v.vehicleUnit !== undefined ? String(v.vehicleUnit) : null
    if (!unit) continue
    const d = hosByUnit.get(unit)
    const status =
      d?.driverStatus ?? (v.speed && v.speed > 3 ? `${Math.round(v.speed)} mi/h` : (v.engineStatus ?? null))
    await sql`
      INSERT INTO fleet_status
        (unit, driver_name, hos_percent, drive_status, location, lat, lng, odometer, eld_seen, updated_at)
      VALUES (${unit}, ${v.driverName ?? d?.driverName ?? null}, ${hosPercent(d?.driveTime)},
              ${status}, ${v.location?.description ?? null},
              ${v.location?.latitude ?? null}, ${v.location?.longitude ?? null},
              ${v.odometer ?? null}, ${v.updateDate ?? null}, now())
      ON CONFLICT (unit) DO UPDATE SET
        driver_name = EXCLUDED.driver_name, hos_percent = EXCLUDED.hos_percent,
        drive_status = EXCLUDED.drive_status, location = EXCLUDED.location,
        lat = EXCLUDED.lat, lng = EXCLUDED.lng, odometer = EXCLUDED.odometer,
        eld_seen = EXCLUDED.eld_seen, updated_at = now()`
    await logPosition(
      unit,
      v.location?.latitude ?? null,
      v.location?.longitude ?? null,
      status,
      v.location?.description ?? null,
    )
    updated++
  }
  return { updated }
}

/* ===== Live Share path — no vendor key needed ============================== */
// The dashboard's "Live Share" button makes a public per-truck link:
//   https://zigzageld.com/tracker?token=<LINK_TOKEN>
// That page runs a 2-step flow we can reproduce server-side, with NO password and
// NO dashboard session:
//   1) GET /eld/externalLink/authorize?token=<LINK_TOKEN> → { accessToken: <JWT> }
//      The JWT's `exp` matches the link's expiry (set in the form — can be ~1 year),
//      and its `title` is "<unit> <VIN>", so we read the truck number straight from it.
//   2) GET /eld/externalLink/vehicleData  (Authorization: Bearer <JWT>) → location.
// Gives GPS only (no HOS). Owner pastes the link(s) into settings; we store the token.

/* eslint-disable @typescript-eslint/no-explicit-any */
const numOrNull = (x: any): number | null => {
  const n = typeof x === 'number' ? x : x != null ? Number(x) : NaN
  return Number.isFinite(n) ? n : null
}

// Try api.* (valid cert) first, then the older eldapi.* (the host the dashboard's
// tracker page actually calls). Bare fetch — if eldapi's cert is stale, that base
// just throws and we've already tried api.*.
const SHARE_BASES = [
  process.env.ELD_SHARE_URL?.replace(/\/$/, ''),
  'https://api.zigzageld.com/eld/externalLink',
  'https://eldapi.zigzageld.com/eld/externalLink',
].filter(Boolean) as string[]

function unitFromJwt(jwt: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64').toString('utf8'))
    const title = String(p.title ?? '').trim()
    return title.split(/\s+/)[0] || null
  } catch {
    return null
  }
}

/** Pull the share-link tokens out of whatever the owner pasted (full URLs or bare tokens). */
export function parseShareTokens(text: string): string[] {
  const out = new Set<string>()
  for (const line of text.split(/[\s,]+/)) {
    if (!line) continue
    const m = line.match(/[?&]token=([^&\s]+)/)
    out.add(m ? decodeURIComponent(m[1]!) : line)
  }
  return [...out]
}

export async function liveShareSnapshot(): Promise<
  { updated: number; errors: string[] } | { error: string }
> {
  const raw = await getSetting('eld_share_tokens')
  if (!raw) return { error: 'no_links' }
  let tokens: string[]
  try {
    tokens = JSON.parse(raw)
  } catch {
    return { error: 'bad_links' }
  }
  if (!tokens.length) return { error: 'no_links' }

  let updated = 0
  const errors: string[] = []
  for (const token of tokens) {
    try {
      // 1) authorize — public, no auth header
      let accessToken: string | null = null
      for (const base of SHARE_BASES) {
        try {
          const r = await fetch(`${base}/authorize?token=${encodeURIComponent(token)}`)
          if (r.ok) {
            accessToken = ((await r.json()) as any).accessToken ?? null
            if (accessToken) break
          }
        } catch {
          /* try next base */
        }
      }
      if (!accessToken) {
        errors.push('authorize failed (link expired or wrong?)')
        continue
      }
      const unit = unitFromJwt(accessToken)
      if (!unit) {
        errors.push('no unit number in token')
        continue
      }

      // 2) vehicleData — Bearer the JWT from step 1
      let data: any = null
      for (const base of SHARE_BASES) {
        try {
          const r = await fetch(`${base}/vehicleData`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          if (r.ok) {
            data = await r.json()
            break
          }
        } catch {
          /* try next base */
        }
      }
      if (!data) {
        errors.push(`${unit}: vehicleData failed`)
        continue
      }

      const loc = data.location ?? data
      const lat = numOrNull(loc.latitude ?? loc.lat ?? data.latitude)
      const lng = numOrNull(loc.longitude ?? loc.lng ?? loc.lon ?? data.longitude)
      const desc = loc.description ?? loc.address ?? data.description ?? null
      const speed = numOrNull(data.speed ?? loc.speed)
      const status = speed && speed > 3 ? `${Math.round(speed)} mi/h` : null

      // Only touch the columns Live Share provides — leave driver_name / hos_percent
      // (they come from the key path) alone.
      await sql`
        INSERT INTO fleet_status (unit, location, lat, lng, drive_status, eld_seen, updated_at)
        VALUES (${unit}, ${desc}, ${lat}, ${lng}, ${status}, ${'live share'}, now())
        ON CONFLICT (unit) DO UPDATE SET
          location = COALESCE(EXCLUDED.location, fleet_status.location),
          lat = EXCLUDED.lat, lng = EXCLUDED.lng,
          drive_status = COALESCE(EXCLUDED.drive_status, fleet_status.drive_status),
          eld_seen = EXCLUDED.eld_seen, updated_at = now()`
      await logPosition(unit, lat, lng, status, desc)
      updated++
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { updated, errors }
}
