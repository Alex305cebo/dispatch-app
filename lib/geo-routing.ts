// Real truck miles + diesel price — free tiers, degrade to null without keys.
// SERVER ONLY. Geocode cache lives in the settings table (no new table needed).
//
// Env: ORS_API_KEY (openrouteservice.org, driving-hgv), EIA_API_KEY (eia.gov).

import { getSetting, setSetting } from './settings.ts'
import { sql } from './db.ts'
import { cacheCell, haversineMiles } from './geo.ts'
import { t, type Locale } from './i18n.ts'

type LatLng = { lat: number; lng: number }

/** "City, ST" → coords. Nominatim (1 req/s, UA required), cached forever in settings. */
async function geocode(place: string): Promise<LatLng | null> {
  const key = `geo:${place.toLowerCase().trim()}`
  const hit = await getSetting(key)
  if (hit) {
    const [lat, lng] = hit.split(',').map(Number)
    return lat && lng ? { lat, lng } : null
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(place)}`
    const res = await fetch(url, { headers: { 'User-Agent': 'DispatchApp/1.0 (fleet tool)' } })
    if (!res.ok) return null
    const arr = (await res.json()) as { lat: string; lon: string }[]
    if (!arr[0]) return null
    const pt = { lat: Number(arr[0].lat), lng: Number(arr[0].lon) }
    await setSetting(key, `${pt.lat},${pt.lng}`)
    return pt
  } catch {
    return null
  }
}

/** "City, ST" → coords, for placing a marker with no route needed (e.g. a pickup pin). */
export async function cityCoords(place: string): Promise<LatLng | null> {
  return geocode(place)
}

/** Last 5-digit run in a US address string — "160 Smith Farms Pkwy, Greer, SC 29651" → "29651". */
function extractZip(address: string): string | null {
  const matches = address.match(/\b\d{5}\b/g)
  return matches?.[matches.length - 1] ?? null
}

/**
 * Mapbox geocoder — the most accurate option available on a free tier (100k requests a
 * month; ~95% rooftop matching in US metros). Server-only token, so it never reaches the
 * browser and can stay unrestricted. Tried FIRST: Nominatim missed 7 of 14 real rate-con
 * addresses and Census only recovered 4 of those, so this is what closes the gap.
 * Skipped entirely when MAPBOX_TOKEN isn't set — the Census/Nominatim/ZIP chain still runs.
 */
async function geocodeMapbox(address: string): Promise<LatLng | null> {
  const token = process.env.MAPBOX_TOKEN
  if (!token) return null
  const key = `geo:mapbox:${address.toLowerCase().trim()}`
  const hit = await getSetting(key)
  if (hit === '-') return null
  if (hit) {
    const [lat, lng] = hit.split(',').map(Number)
    return lat && lng ? { lat, lng } : null
  }
  try {
    const url =
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(address)}` +
      `&country=us&limit=1&access_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const j = (await res.json()) as { features?: { geometry?: { coordinates?: [number, number] } }[] }
    const c = j?.features?.[0]?.geometry?.coordinates
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) {
      await setSetting(key, '-')
      return null
    }
    const pt = { lat: Number(c[1]), lng: Number(c[0]) } // GeoJSON is [lng, lat]
    await setSetting(key, `${pt.lat},${pt.lng}`)
    return pt
  } catch {
    return null
  }
}

/**
 * US Census geocoder — free, no API key, and it knows a great many warehouse/industrial
 * street addresses Nominatim has no entry for at all. Measured against real rate-con
 * addresses: of 7 that Nominatim missed entirely (freeform AND structured), Census
 * resolved 4 to the exact door, including one with a suite number ("2471 Palumbo Dr STE
 * 150"). US-only, which is all this app hauls.
 *
 * Misses are cached as '-' too: three of those addresses resolve nowhere, and without a
 * negative cache every render of that load would re-hit two geocoders and block on them.
 */
async function geocodeCensus(address: string): Promise<LatLng | null> {
  const key = `geo:census:${address.toLowerCase().trim()}`
  const hit = await getSetting(key)
  if (hit === '-') return null
  if (hit) {
    const [lat, lng] = hit.split(',').map(Number)
    return lat && lng ? { lat, lng } : null
  }
  try {
    const url =
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress` +
      `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`
    const res = await fetch(url)
    if (!res.ok) return null
    const j = (await res.json()) as {
      result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] }
    }
    const c = j?.result?.addressMatches?.[0]?.coordinates
    if (!c || !Number.isFinite(c.y) || !Number.isFinite(c.x)) {
      await setSetting(key, '-')
      return null
    }
    const pt = { lat: Number(c.y), lng: Number(c.x) }
    await setSetting(key, `${pt.lat},${pt.lng}`)
    return pt
  } catch {
    return null
  }
}

/** ZIP → coords via Nominatim's structured postalcode query — a tighter area (a few
 * square miles) than a whole city, and resolves for plenty of addresses Nominatim's
 * freeform search can't match at all (see cityCoordsBest). Cached like geocode(). */
async function geocodeZip(zip: string): Promise<LatLng | null> {
  const key = `geo:zip:${zip}`
  const hit = await getSetting(key)
  if (hit) {
    const [lat, lng] = hit.split(',').map(Number)
    return lat && lng ? { lat, lng } : null
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&postalcode=${encodeURIComponent(zip)}&country=us`
    const res = await fetch(url, { headers: { 'User-Agent': 'DispatchApp/1.0 (fleet tool)' } })
    if (!res.ok) return null
    const arr = (await res.json()) as { lat: string; lon: string }[]
    if (!arr[0]) return null
    const pt = { lat: Number(arr[0].lat), lng: Number(arr[0].lon) }
    await setSetting(key, `${pt.lat},${pt.lng}`)
    return pt
  } catch {
    return null
  }
}

/**
 * Exact street address when we have one, else its ZIP code, else the city — for
 * placing a marker. Nominatim's free US coverage is house-number-complete in
 * well-mapped urban areas but often has NO entry at all for rural/industrial/
 * warehouse addresses (verified: a real "160 Smith Farms Pkwy, Greer, SC" rate-con
 * address returned zero results) — the ZIP almost always still resolves, and pins a
 * few-square-mile area instead of an entire city, so it's a much closer landing spot
 * than falling straight to the city. City stays the last-resort net so the pin never
 * silently disappears.
 */
/** A real street address sits within commuting distance of the city named next to it on
 * the rate con. Anything further is the geocoder having matched a same-named street in
 * another state — seen live: "12907 Comfort Wy, ALBUQUERQUE, NM" resolved to Yuma,
 * Arizona, ~600 mi away, and the delivery pin landed there. Generous enough for sprawling
 * metros, tight enough to catch a cross-country mismatch. */
const MAX_ADDR_DRIFT_MI = 75

export async function cityCoordsBest(
  address: string | null | undefined,
  city: string | null | undefined,
): Promise<LatLng | null> {
  // The city is the sanity reference for every address hit below (and the last resort).
  const cityPt = city ? await geocode(city) : null
  const trust = (p: LatLng | null): p is LatLng =>
    !!p && (!cityPt || haversineMiles(p, cityPt) <= MAX_ADDR_DRIFT_MI)

  if (address) {
    // Best first: Mapbox (rooftop-accurate, free tier) when a token is configured.
    const mb = await geocodeMapbox(address)
    if (trust(mb)) return mb
    const exact = await geocode(address)
    if (trust(exact)) return exact
    // Nominatim has no entry for most warehouse/industrial addresses; Census usually does.
    const census = await geocodeCensus(address)
    if (trust(census)) return census
    const zip = extractZip(address)
    if (zip) {
      const byZip = await geocodeZip(zip)
      if (trust(byZip)) return byZip
    }
  }
  return cityPt
}

type RoadPath = { miles: number; minutes: number; coords?: [number, number][] }

/**
 * The ORIGIN half of a route cache key is snapped to a ~3.5 mi cell (see cacheCell —
 * the old 0.01° key meant a moving truck never hit this cache at all; measured
 * before the fix: 231 cached routes for just 24 destinations, 17.4 MB, 4 of them
 * live). That snapping is also the accuracy ceiling here: "miles to delivery" can
 * lag the truck's true position by up to ~3.5 mi. Invisible on a 200-mile haul,
 * noticeable on the last few miles.
 */
const ROUTE_TTL_MS = 30 * 60 * 1000

/**
 * Drop route entries whose TTL has run out. The TTL used to gate READS only — an
 * expired route was ignored but never removed, and each miss wrote another ~78 KB
 * row, so `settings` grew 4.7 MB/day (measured: 237 rows / 18 MB in under four days,
 * of which 4 were live). Called on a fraction of writes, which is enough to hold the
 * table flat without a cron job, an extra table, or a schema change.
 *
 * The regex pulls `at` straight out of the stored JSON: a row whose value doesn't
 * match yields NULL, and `NULL < cutoff` is NULL, so anything unparseable is left
 * alone rather than blowing up the whole statement on one bad row.
 */
async function sweepExpiredRoutes(): Promise<void> {
  const cutoff = Date.now() - ROUTE_TTL_MS
  try {
    await sql`
      DELETE FROM settings
      WHERE key LIKE 'osrm%'
        AND substring(value from '"at":([0-9]+)')::bigint < ${cutoff}`
  } catch {
    // Eviction is housekeeping — never fail a dispatcher's page over it.
  }
}

/**
 * Real driving route via the public OSRM demo server — no key, free. Returns true
 * road miles and drive minutes, plus the road polyline when `geometry` is on.
 *
 * `geometry: false` asks OSRM for overview=false and caches under its own key. The
 * map needs the polyline; the dashboard needs two integers. Sharing one cache entry
 * meant every dashboard truck dragged a ~75 KB coordinate array out of Postgres just
 * to read `miles` and throw the rest away.
 *
 * ponytail: OSRM demo server has no SLA and light rate limits. Fine for a handful
 * of trucks with this cache; self-host OSRM or add an ORS key if it starts flaking.
 */
async function roadRoute(from: LatLng, to: LatLng, geometry = true): Promise<RoadPath | null> {
  const key =
    `${geometry ? 'osrm' : 'osrmsum'}:${cacheCell(from.lat)},${cacheCell(from.lng)}` +
    `->${to.lat.toFixed(3)},${to.lng.toFixed(3)}`
  const hit = await getSetting(key)
  if (hit) {
    try {
      const c = JSON.parse(hit) as { at: number; path: RoadPath }
      if (Date.now() - c.at < ROUTE_TTL_MS) return c.path
    } catch {
      // fall through and re-fetch
    }
  }
  try {
    // overview=full, not simplified — simplified was Douglas-Peucker'd down to ~20
    // points for a 200mi route (~9mi gaps), which drew as straight chords cutting
    // across lakes/terrain instead of hugging the actual road. full gives every
    // shape point OSRM has (thousands, for the same route) — the line now traces
    // the real highway curve. ponytail: fine at regional trucking distances; if a
    // route ever spans 1000+ miles this payload gets big enough to worth trimming.
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=${geometry ? 'full' : 'false'}&geometries=geojson`
    const res = await fetch(url, { headers: { 'User-Agent': 'DispatchApp/1.0 (fleet tool)' } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[]
    }
    const r = data.routes?.[0]
    // Distance is the thing every caller needs; geometry only comes back when asked
    // for, so a missing polyline is no longer grounds to call the whole route a miss.
    if (typeof r?.distance !== 'number') return null
    const coords = r.geometry?.coordinates
    if (geometry && !coords?.length) return null
    const path: RoadPath = {
      miles: Math.round(r.distance * 0.000621371),
      minutes: Math.round(r.duration / 60),
      ...(coords?.length ? { coords: coords.map(([lng, lat]) => [lat, lng] as [number, number]) } : {}),
    }
    await setSetting(key, JSON.stringify({ at: Date.now(), path }))
    // ponytail: sweep on ~1 write in 20 rather than every write — a cache miss already
    // costs an OSRM round trip, and the table only needs to stay flat on average.
    if (Math.random() < 0.05) await sweepExpiredRoutes()
    return path
  } catch {
    return null
  }
}

type DeliveryPoint = {
  lat: number
  lng: number
  miles: number
  etaMin: number
  coords?: [number, number][]
}

/** Real road route from `from` to an already-resolved point; straight-line ×1.2 at 55mph if routing fails. */
async function routeTo(from: LatLng, pt: LatLng | null, geometry = true): Promise<DeliveryPoint | null> {
  if (!pt) return null
  const road = await roadRoute(from, pt, geometry)
  if (road) return { lat: pt.lat, lng: pt.lng, miles: road.miles, etaMin: road.minutes, coords: road.coords }
  const miles = Math.round(haversineMiles(from, pt) * 1.2)
  return { lat: pt.lat, lng: pt.lng, miles, etaMin: Math.round((miles / 55) * 60) }
}

/**
 * Delivery point for a live truck: geocode the destination city, then the real road
 * route from the truck's current GPS (miles and drive time). If routing is
 * unavailable it falls back to straight-line ×1.2 miles at 55 mph.
 *
 * No polyline — both callers (the dashboard fleet cards and the "miles left" server
 * action) render text only. Use deliveryInfoBest for the map, which needs the line.
 */
export async function deliveryInfo(
  from: LatLng,
  destCity: string | null | undefined,
): Promise<DeliveryPoint | null> {
  if (!destCity?.trim()) return null
  return routeTo(from, await geocode(destCity), false)
}

/** Same address → ZIP → city fallback as cityCoordsBest, for the delivery pin + route. */
export async function deliveryInfoBest(
  from: LatLng,
  address: string | null | undefined,
  city: string | null | undefined,
): Promise<DeliveryPoint | null> {
  return routeTo(from, await cityCoordsBest(address, city))
}

/**
 * Real road miles between two "City, ST" strings. Free by default via OSRM (no key);
 * if an ORS key is set it's preferred (driving-hgv = truck-legal routing). Either way
 * the answer follows roads, not a straight line.
 */
export async function routeMiles(
  origin: string,
  destination: string,
  locale: Locale = 'ru',
): Promise<{ miles: number } | { error: string }> {
  const [a, b] = await Promise.all([geocode(origin), geocode(destination)])
  if (!a || !b) return { error: t(locale, 'tracking.geoNoCoords') }

  // Truck-legal routing when a key exists; fall through to free OSRM on any failure.
  const key = process.env.ORS_API_KEY
  if (key) {
    try {
      const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv', {
        method: 'POST',
        headers: { Authorization: key, 'content-type': 'application/json' },
        body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }),
      })
      if (res.ok) {
        const data = (await res.json()) as { routes?: { summary?: { distance?: number } }[] }
        const meters = data.routes?.[0]?.summary?.distance
        if (meters) return { miles: Math.round(meters * 0.000621371) }
      }
    } catch {
      // fall through to OSRM
    }
  }

  // Free path — OSRM demo, real driving miles, no key. Miles only, no polyline.
  const road = await roadRoute(a, b, false)
  if (road) return { miles: road.miles }
  return { error: t(locale, 'tracking.geoNoRoute') }
}

/**
 * IP → "City, Region, Country" for the login audit. Free, no key (ipwho.is),
 * cached forever in settings. Localhost / private ranges return null (nothing to
 * geolocate) — real cities only show once the app is deployed behind a public IP.
 */
export async function ipCity(ip: string | null): Promise<string | null> {
  if (!ip) return null
  if (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
    return null

  const key = `ipgeo:${ip}`
  const hit = await getSetting(key)
  if (hit) return hit || null
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      headers: { 'User-Agent': 'DispatchApp/1.0 (fleet tool)' },
    })
    if (!res.ok) return null
    const d = (await res.json()) as {
      success?: boolean
      city?: string
      region?: string
      country?: string
    }
    if (!d.success) return null
    const label = [d.city, d.region, d.country].filter(Boolean).join(', ')
    await setSetting(key, label)
    return label || null
  } catch {
    return null
  }
}

/** Latest US retail diesel $/gal (EIA weekly), cached 24h. null without key. */
export async function dieselPrice(
  locale: Locale = 'ru',
): Promise<{ price: number; asOf: string } | { error: string }> {
  const key = process.env.EIA_API_KEY
  if (!key) return { error: 'no_key' }

  const cached = await getSetting('diesel_cache')
  if (cached) {
    const { price, asOf, at } = JSON.parse(cached) as { price: number; asOf: string; at: number }
    if (Date.now() - at < 24 * 60 * 60 * 1000) return { price, asOf }
  }
  try {
    const url =
      `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${key}` +
      `&frequency=weekly&data[0]=value&facets[product][]=EPD2D&facets[duoarea][]=NUS` +
      `&sort[0][column]=period&sort[0][direction]=desc&length=1`
    const res = await fetch(url)
    if (!res.ok) return { error: `EIA HTTP ${res.status}` }
    const data = (await res.json()) as { response?: { data?: { period: string; value: number }[] } }
    const row = data.response?.data?.[0]
    if (!row) return { error: t(locale, 'tracking.eiaNoPrice') }
    await setSetting('diesel_cache', JSON.stringify({ price: row.value, asOf: row.period, at: Date.now() }))
    return { price: row.value, asOf: row.period }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
