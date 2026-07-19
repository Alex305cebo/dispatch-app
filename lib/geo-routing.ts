// Real truck miles + diesel price — free tiers, degrade to null without keys.
// SERVER ONLY. Geocode cache lives in the settings table (no new table needed).
//
// Env: ORS_API_KEY (openrouteservice.org, driving-hgv), EIA_API_KEY (eia.gov).

import { getSetting, setSetting } from './settings.ts'
import { haversineMiles } from './geo.ts'

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

/**
 * Delivery point for a live truck: geocode the destination city, then the real road
 * route from the truck's current GPS (miles, drive time, and the road polyline). If
 * routing is unavailable it falls back to straight-line ×1.2 miles at 55 mph.
 */
export async function deliveryInfo(
  from: LatLng,
  destCity: string | null | undefined,
): Promise<{
  lat: number
  lng: number
  miles: number
  etaMin: number
  coords?: [number, number][]
} | null> {
  if (!destCity?.trim()) return null
  const pt = await geocode(destCity)
  if (!pt) return null
  const road = await roadRoute(from, pt)
  if (road) return { lat: pt.lat, lng: pt.lng, miles: road.miles, etaMin: road.minutes, coords: road.coords }
  const miles = Math.round(haversineMiles(from, pt) * 1.2)
  return { lat: pt.lat, lng: pt.lng, miles, etaMin: Math.round((miles / 55) * 60) }
}

/**
 * Real road miles between two "City, ST" strings. Free by default via OSRM (no key);
 * if an ORS key is set it's preferred (driving-hgv = truck-legal routing). Either way
 * the answer follows roads, not a straight line.
 */
export async function routeMiles(
  origin: string,
  destination: string,
): Promise<{ miles: number } | { error: string }> {
  const [a, b] = await Promise.all([geocode(origin), geocode(destination)])
  if (!a || !b) return { error: 'Не удалось определить координаты города.' }

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
  return { error: 'Не удалось построить маршрут по дорогам.' }
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
export async function dieselPrice(): Promise<{ price: number; asOf: string } | { error: string }> {
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
    if (!row) return { error: 'EIA не вернул цену.' }
    await setSetting('diesel_cache', JSON.stringify({ price: row.value, asOf: row.period, at: Date.now() }))
    return { price: row.value, asOf: row.period }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
