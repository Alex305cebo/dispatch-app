// Real truck miles + diesel price — free tiers, degrade to null without keys.
// SERVER ONLY. Geocode cache lives in the settings table (no new table needed).
//
// Env: ORS_API_KEY (openrouteservice.org, driving-hgv), EIA_API_KEY (eia.gov).

import { getSetting, setSetting } from './settings.ts'
import { haversineMiles } from './geo.ts'
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
export async function cityCoordsBest(
  address: string | null | undefined,
  city: string | null | undefined,
): Promise<LatLng | null> {
  if (address) {
    const exact = await geocode(address)
    if (exact) return exact
    const zip = extractZip(address)
    if (zip) {
      const byZip = await geocodeZip(zip)
      if (byZip) return byZip
    }
  }
  return city ? geocode(city) : null
}

type RoadPath = { miles: number; minutes: number; coords: [number, number][] }

/**
 * Real driving route via the public OSRM demo server — no key, free. Returns the
 * road polyline (as [lat,lng] points) plus true road miles and drive minutes.
 * Cached ~30 min keyed by rounded endpoints so a moving fleet doesn't hammer it.
 * ponytail: OSRM demo server has no SLA and light rate limits. Fine for a handful
 * of trucks with this cache; self-host OSRM or add an ORS key if it starts flaking.
 */
async function roadRoute(from: LatLng, to: LatLng): Promise<RoadPath | null> {
  const key = `osrm:${from.lat.toFixed(2)},${from.lng.toFixed(2)}->${to.lat.toFixed(3)},${to.lng.toFixed(3)}`
  const hit = await getSetting(key)
  if (hit) {
    try {
      const c = JSON.parse(hit) as { at: number; path: RoadPath }
      if (Date.now() - c.at < 30 * 60 * 1000) return c.path
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
      `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    const res = await fetch(url, { headers: { 'User-Agent': 'DispatchApp/1.0 (fleet tool)' } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[]
    }
    const r = data.routes?.[0]
    if (!r?.geometry?.coordinates?.length) return null
    const path: RoadPath = {
      miles: Math.round(r.distance * 0.000621371),
      minutes: Math.round(r.duration / 60),
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    }
    await setSetting(key, JSON.stringify({ at: Date.now(), path }))
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
async function routeTo(from: LatLng, pt: LatLng | null): Promise<DeliveryPoint | null> {
  if (!pt) return null
  const road = await roadRoute(from, pt)
  if (road) return { lat: pt.lat, lng: pt.lng, miles: road.miles, etaMin: road.minutes, coords: road.coords }
  const miles = Math.round(haversineMiles(from, pt) * 1.2)
  return { lat: pt.lat, lng: pt.lng, miles, etaMin: Math.round((miles / 55) * 60) }
}

/**
 * Delivery point for a live truck: geocode the destination city, then the real road
 * route from the truck's current GPS (miles, drive time, and the road polyline). If
 * routing is unavailable it falls back to straight-line ×1.2 miles at 55 mph.
 */
export async function deliveryInfo(
  from: LatLng,
  destCity: string | null | undefined,
): Promise<DeliveryPoint | null> {
  if (!destCity?.trim()) return null
  return routeTo(from, await geocode(destCity))
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

  // Free path — OSRM demo, real driving miles, no key.
  const road = await roadRoute(a, b)
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
