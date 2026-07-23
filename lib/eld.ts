// ELD polling — fills fleet_status from the ZigZag API, server-side, no browser.
//
// Contract taken from the vendor's own OpenAPI document (title "ZIGZAG ELD API", v2):
//   https://eldapi.zigzageld.com/swagger/v2/swagger.json
// and verified end-to-end against their published sandbox account on 2026-07-23:
//   POST /eld/v2/External/Authorize  {userName,password,companyId} → {"accessToken": JWT}
//   GET  /eld/v2/External/VehicleStatuses   (Bearer)  → 28 vehicles, fields exactly:
//        vehicleUnit, vin, location{description,latitude,longitude}, engineStatus
//        (BOOLEAN), odometer, speed, updateDate (epoch MILLISECONDS)
//
// An earlier revision of this file guessed at /eld/dashboard/* with a static API key.
// Those paths answered 401 rather than 404, which read like "real but unauthorised"
// and kept the guess alive for days. They are not in the spec; the real scheme is a
// login that mints a short-lived JWT.
//
// HOS is a separate endpoint (/eld/v2/External/DriverStatus/{username}) and the
// vendor has NOT granted it: "HoS data is confidential and the access has to be
// discussed" (2026-07-22), then "we cannot provide, right now, credentials with HoS
// data" (2026-07-23). GPS only for now — hos_percent is left untouched by this path.
//
// Env:
//   ELD_USERNAME    — vendor-issued account name
//   ELD_PASSWORD    — vendor-issued password (never committed; set in the host's env)
//   ELD_COMPANY_ID  — our company GUID; the credentials are scoped to it
//   ELD_API_URL     — base, default https://eldapi.zigzageld.com
// All three of the first must be present or the poller reports no_key and does nothing.

import { sql } from './db.ts'
import { getSetting, setSetting } from './settings.ts'
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
export function idleSinceIn(trail: TrailPoint[], lat: number, lng: number): Date | null {
  let since: Date | null = null
  for (const r of trail) {
    if (haversineMiles({ lat, lng }, { lat: r.lat, lng: r.lng }) > 0.5) break
    since = new Date(r.at)
  }
  return since
}

export type TrailPoint = { lat: number; lng: number; at: string }

/** The truck's breadcrumb trail, newest first. 12 h covers every reader below. */
async function recentTrail(unit: string): Promise<TrailPoint[]> {
  return (await sql`
    SELECT lat, lng, at FROM truck_position_log
    WHERE unit = ${unit} AND at >= now() - interval '12 hours'
    ORDER BY at DESC`) as TrailPoint[]
}

/**
 * Idle time and heading from ONE read of the trail. /tracking wants both for every
 * truck and used to pay for two overlapping scans of truck_position_log per truck to
 * get them — the 12-hour window already contains the 2-hour one.
 */
export async function positionSignals(
  unit: string,
  lat: number,
  lng: number,
): Promise<{ idleAt: Date | null; heading: number | null }> {
  const trail = await recentTrail(unit)
  return { idleAt: idleSinceIn(trail, lat, lng), heading: headingIn(trail, lat, lng) }
}

/** Single-signal wrapper, for callers that genuinely need only this one. */
export async function idleSince(unit: string, lat: number, lng: number): Promise<Date | null> {
  return idleSinceIn(await recentTrail(unit), lat, lng)
}

/**
 * Compass heading (0-360) the truck is moving in, from its recent breadcrumb — points
 * the map's moving-truck arrow the right way instead of a fixed "up". Walks back until
 * it finds a point far enough away to give a real direction (skips GPS jitter); null
 * if the truck hasn't moved enough recently to know.
 *
 * Only the last 2 hours count: an older breadcrumb says where the truck came from
 * hours ago, not which way it points now. That cutoff is applied here rather than in
 * SQL so a single query can also serve idleSinceIn's wider window.
 */
export function headingIn(trail: TrailPoint[], lat: number, lng: number): number | null {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000
  for (const r of trail) {
    if (Date.parse(r.at) < cutoff) break
    if (haversineMiles({ lat, lng }, { lat: r.lat, lng: r.lng }) > 0.3) {
      return bearing({ lat: r.lat, lng: r.lng }, { lat, lng })
    }
  }
  return null
}

/** Single-signal wrapper, for callers that genuinely need only this one. */
export async function headingOf(unit: string, lat: number, lng: number): Promise<number | null> {
  return headingIn(await recentTrail(unit), lat, lng)
}

/** The truck's day as drive/stop legs — what /trucks/[id] shows under "История пути". */
export async function tripHistory(unit: string, hours = 24): Promise<HistoryLeg[]> {
  const rows = (await sql`
    SELECT lat, lng, at, location FROM truck_position_log
    WHERE unit = ${unit} AND at >= now() - interval '1 hour' * ${hours}
    ORDER BY at ASC`) as { lat: number; lng: number; at: string; location: string | null }[]
  return segmentTrail(rows)
}

/* ===== Vendor-key path — ZigZag "External" API v2 =============================
 *
 * Contract taken from the vendor's own OpenAPI document, not guessed:
 *   https://eldapi.zigzageld.com/swagger/v2/swagger.json   (title "ZIGZAG ELD API", v2)
 *
 * This replaced an earlier hand-written guess that was wrong in every dimension —
 * wrong host, wrong paths (/dashboard/*, which do not exist in the spec), and a
 * static API key where the real scheme is a login that mints a JWT. The old paths
 * answered 401 rather than 404, which read like "real but unauthorised" and kept the
 * guess alive far longer than it deserved.
 *
 * Two steps:
 *   1) POST /eld/v2/External/Authorize  { userName, password, companyId } → JWT
 *   2) GET  /eld/v2/External/VehicleStatuses   (Authorization: Bearer <JWT>)
 *
 * HOS lives at /eld/v2/External/DriverStatus/{username} and the vendor has NOT
 * granted it ("HoS data is confidential... we cannot provide, right now"), so this
 * path deliberately does not call it. `hosPercent` stays for whenever that changes.
 *
 * Host note: eldapi.zigzageld.com's TLS certificate WAS expired, which is why an
 * older revision pointed at api.zigzageld.com. It is valid again (checked: expires
 * 2026-09-02) and is the host the vendor documents, so it is the default here.
 */
type VehicleStatus = {
  companyId?: string
  vehicleId?: string
  vehicleUnit?: string | number
  vin?: string
  driverName?: string
  odometer?: number
  speed?: number
  /** Spec says boolean (engine on/off), NOT the duty-status string the old code assumed. */
  engineStatus?: boolean | string
  /** Spec says integer. Observed as an epoch stamp; tolerated as a string too. */
  updateDate?: number | string
  location?: {
    locationType?: string
    origin?: string
    bearing?: number
    description?: string
    latitude?: number
    longitude?: number
  }
}

/** Spec: /eld/v2/External/DriverStatus/{username}. Times are INTEGERS here, not the
 * "HH:MM" strings an earlier guess assumed. Unused until the vendor grants HOS. */
type DriverStatus = {
  username?: string
  driverName?: string
  vehicleId?: string
  currentStatus?: string
  breakTime?: number
  driveTime?: number
  shiftTime?: number
  cycleTime?: number
}

const ELD_BASE = (process.env.ELD_API_URL ?? 'https://eldapi.zigzageld.com').replace(/\/+$/, '')

/** Minutes of drive time left → percent of the 11h clock. */
function hosPercent(driveMinutes: number | undefined): number | null {
  if (typeof driveMinutes !== 'number' || !Number.isFinite(driveMinutes)) return null
  return Math.round(Math.min(100, (driveMinutes / 660) * 100) * 10) / 10
}

/**
 * Log in and cache the JWT.
 *
 * Cached in `settings` rather than a module variable because every request can land
 * in a fresh serverless instance — a per-process cache would mean a login on every
 * poll. Expiry is read from the JWT itself and trimmed by a minute so a token can't
 * die mid-request.
 *
 * The vendor's Swagger annotates the 200 response with the REQUEST schema (their bug),
 * so the real shape is unknown from the document alone — hence accepting the common
 * spellings rather than trusting one.
 */
async function eldToken(): Promise<string | null> {
  const userName = process.env.ELD_USERNAME
  const password = process.env.ELD_PASSWORD
  const companyId = process.env.ELD_COMPANY_ID
  if (!userName || !password || !companyId) return null

  const cached = await getSetting('eld:token')
  if (cached) {
    try {
      const c = JSON.parse(cached) as { token: string; exp: number }
      if (c.exp > Date.now()) return c.token
    } catch {
      // fall through and re-authorize
    }
  }

  const res = await fetch(`${ELD_BASE}/eld/v2/External/Authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userName, password, companyId }),
  })
  if (!res.ok) return null
  const raw = await res.text()
  let token: string | null = null
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    token = (j.accessToken ?? j.token ?? j.access_token ?? j.jwt) as string | null
  } catch {
    // A bare token string, unquoted, is a legitimate shape too.
    token = raw.trim().replace(/^"|"$/g, '') || null
  }
  if (!token) return null

  // exp is seconds since epoch, per JWT. No signature check — we are the client, not
  // the verifier; this only decides when to ask for a new one.
  let exp = Date.now() + 30 * 60 * 1000
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64').toString())
    if (typeof payload.exp === 'number') exp = payload.exp * 1000 - 60_000
  } catch {
    // Not a JWT, or an odd payload — the 30-minute default stands.
  }
  await setSetting('eld:token', JSON.stringify({ token, exp }))
  return token
}

/** One trip's worth of breadcrumbs. Each point carries fuel and odometer, which the
 * fleet-wide VehicleStatuses call does not. */
type TripPoint = {
  timeStamp?: number
  speed?: number
  fuel?: number
  odometer?: number
  latitude?: number
  longitude?: number
  locationDescription?: string
}
type LastTrip = { tripId?: string; vehicleId?: string; points?: TripPoint[] }

/** How often to go looking for fuel. VehicleStatuses is ONE call for the whole fleet,
 * but fuel needs one call PER TRUCK — at a 5-minute poll that would be ~2,000 vendor
 * requests a day for a number that moves slowly. Twenty minutes keeps it useful and
 * keeps us a polite client. */
const FUEL_EVERY_MS = 20 * 60 * 1000

/**
 * Latest fuel + odometer per unit, read from each vehicle's last trip.
 *
 * Returns an empty map (never throws) when the endpoint is role-gated or the interval
 * has not elapsed — fuel is a bonus reading and must never cost us the GPS update that
 * the rest of the poll exists for.
 */
async function fuelByUnit(
  token: string,
  vehicles: VehicleStatus[],
): Promise<{ map: Map<string, { fuel: number | null; odometer: number | null }>; note: string }> {
  const out = new Map<string, { fuel: number | null; odometer: number | null }>()
  const last = Number((await getSetting('eld:fuel_at')) ?? 0)
  if (Date.now() - last < FUEL_EVERY_MS) {
    const mins = Math.ceil((FUEL_EVERY_MS - (Date.now() - last)) / 60000)
    return { map: out, note: `skipped, next in ~${mins}m` }
  }
  // Reported back through the poll response. Without this the only symptom of a
  // role-gated endpoint is a silently empty column, which is indistinguishable from
  // "the trucks have no fuel sensor" — two very different problems.
  let note = 'no trips returned'

  for (const v of vehicles) {
    const unit = v.vehicleUnit != null ? String(v.vehicleUnit) : null
    if (!unit || !v.vehicleId) continue
    try {
      const res = await fetch(`${ELD_BASE}/eld/v2/External/Trips/Last/${v.vehicleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      // 403 = the credentials' role does not include trips. Stop asking for the rest
      // of the fleet rather than collecting the same refusal seven times.
      if (res.status === 403 || res.status === 401) {
        note = `Trips/Last forbidden (HTTP ${res.status}) — role does not include trips`
        break
      }
      if (!res.ok) {
        note = `Trips/Last HTTP ${res.status}`
        continue
      }
      const body = (await res.json()) as LastTrip | LastTrip[]
      const trip = Array.isArray(body) ? body[0] : body
      const pts = trip?.points
      if (!pts?.length) continue
      // Newest point wins: the array is chronological, and a mid-trip reading is
      // staler than the one taken when the truck last reported.
      const p = pts[pts.length - 1]!
      out.set(unit, {
        fuel: typeof p.fuel === 'number' ? p.fuel : null,
        odometer: typeof p.odometer === 'number' && p.odometer > 0 ? p.odometer : null,
      })
    } catch {
      // A single truck's trip call failing is not worth losing the others over.
    }
  }
  if (out.size > 0) {
    await setSetting('eld:fuel_at', String(Date.now()))
    const withFuel = [...out.values()].filter((x) => x.fuel !== null).length
    note = `${out.size} trips read, ${withFuel} with a fuel reading`
  }
  return { map: out, note }
}

export async function fleetSnapshot(
  locale: Locale = 'ru',
): Promise<{ updated: number; fuel?: string; bearing?: string; vin?: string } | { error: string }> {
  if (!process.env.ELD_USERNAME || !process.env.ELD_PASSWORD || !process.env.ELD_COMPANY_ID) {
    return { error: 'no_key' }
  }
  const token = await eldToken()
  if (!token) return { error: t(locale, 'tracking.eldUnavailable') }

  let vehicles: VehicleStatus[] = []
  try {
    // One fleet-wide call — the owner's rule: few requests, human rhythm.
    const res = await fetch(`${ELD_BASE}/eld/v2/External/VehicleStatuses`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401 || res.status === 403) {
      // Token rejected — drop it so the next poll logs in fresh rather than
      // re-presenting a credential the server has already refused.
      await setSetting('eld:token', '')
      return { error: t(locale, 'tracking.eldUnavailable') }
    }
    if (!res.ok) return { error: `VehicleStatuses HTTP ${res.status}` }
    const body = (await res.json()) as VehicleStatus[] | VehicleStatus
    vehicles = Array.isArray(body) ? body : [body]
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  // Best-effort extras. Empty map when the role forbids trips or the interval has
  // not elapsed, in which case COALESCE below keeps whatever we already had.
  const { map: extras, note: fuelNote } = await fuelByUnit(token, vehicles)

  let updated = 0
  for (const v of vehicles) {
    const unit = v.vehicleUnit !== undefined && v.vehicleUnit !== null ? String(v.vehicleUnit) : null
    if (!unit) continue
    const extra = extras.get(unit)
    // engineStatus is a BOOLEAN in this API (engine on/off), not a duty code. Speed
    // wins when the truck is actually rolling, same reading the Live Share path uses,
    // so both sources write the same vocabulary into drive_status.
    const status =
      v.speed && v.speed > 3
        ? `${Math.round(v.speed)} mi/h`
        : typeof v.engineStatus === 'boolean'
          ? v.engineStatus
            ? 'ON'
            : 'OFF'
          : (v.engineStatus ?? null)
    // updateDate is an epoch integer; eld_seen is text and is rendered as a date.
    const seen =
      typeof v.updateDate === 'number'
        ? new Date(v.updateDate > 1e12 ? v.updateDate : v.updateDate * 1000).toISOString()
        : (v.updateDate ?? null)
    // Trip odometer is per-point and finer than the fleet-wide figure, so it wins
    // when present. COALESCE on the way in AND on conflict: fuel is refreshed on a
    // slower cadence than position, and a poll without it must not blank the last
    // known reading.
    const odo = extra?.odometer ?? v.odometer ?? null
    await sql`
      INSERT INTO fleet_status
        (unit, driver_name, drive_status, location, lat, lng, odometer, fuel, bearing,
         eld_seen, updated_at)
      VALUES (${unit}, ${v.driverName ?? null},
              ${status}, ${v.location?.description ?? null},
              ${v.location?.latitude ?? null}, ${v.location?.longitude ?? null},
              ${odo}, ${extra?.fuel ?? null}, ${v.location?.bearing ?? null},
              ${seen}, now())
      ON CONFLICT (unit) DO UPDATE SET
        driver_name = COALESCE(EXCLUDED.driver_name, fleet_status.driver_name),
        drive_status = EXCLUDED.drive_status, location = EXCLUDED.location,
        lat = EXCLUDED.lat, lng = EXCLUDED.lng,
        odometer = COALESCE(EXCLUDED.odometer, fleet_status.odometer),
        fuel = COALESCE(EXCLUDED.fuel, fleet_status.fuel),
        bearing = COALESCE(EXCLUDED.bearing, fleet_status.bearing),
        eld_seen = EXCLUDED.eld_seen, updated_at = now()`
    await logPosition(
      unit,
      v.location?.latitude ?? null,
      v.location?.longitude ?? null,
      status,
      v.location?.description ?? null,
    )

    // Auto-fill the VIN from the ELD when the passport hasn't got one. The device
    // knows every truck's VIN; typing it by hand into truck_meta is exactly the kind
    // of chore this integration exists to remove. Only ever fills a BLANK — a VIN a
    // person entered is never overwritten by the feed, even if the two disagree
    // (a mismatch is worth a human noticing, not silently papering over). Matched by
    // unit number = trucks.number, the same key fleet_status uses.
    if (v.vin && v.vin.trim()) {
      // INSERT..SELECT so a truck with no passport row yet (three of the real fleet
      // have none) still gets its VIN; ON CONFLICT fills a blank without overwriting a
      // hand-entered value. NULLIF turns the empty subquery result into no-op rather
      // than an error when the unit isn't one of ours.
      await sql`
        INSERT INTO truck_meta (truck_id, vin)
        SELECT id, ${v.vin.trim()} FROM trucks WHERE number = ${unit} AND company_id = 'default'
        ON CONFLICT (truck_id) DO UPDATE SET vin = EXCLUDED.vin
        WHERE truck_meta.vin IS NULL OR truck_meta.vin = ''`
    }
    updated++
  }
  // bearing rides along in VehicleStatuses, so if it is empty the devices simply are
  // not reporting it — worth saying out loud rather than leaving a null column.
  const withBearing = vehicles.filter((v) => typeof v.location?.bearing === 'number').length
  const withVin = vehicles.filter((v) => v.vin && v.vin.trim()).length
  return {
    updated,
    fuel: fuelNote,
    bearing: `${withBearing}/${vehicles.length} vehicles report a heading`,
    vin: `${withVin}/${vehicles.length} vehicles report a VIN`,
  }
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
