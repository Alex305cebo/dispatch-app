// Severe weather where a truck actually is — free, no key: api.weather.gov (NOAA/NWS,
// US only). Cached ~30 min per rounded point in settings, same pattern as roadRoute.
// SERVER ONLY.

import { getSetting, setSetting } from './settings.ts'

export type WeatherAlert = { event: string; severity: 'Extreme' | 'Severe'; headline: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The single worst active alert covering this point, or null (no alert / outside
 * NWS coverage / request failed — this must never block the tracking page). Only
 * Extreme/Severe surface — advisories (frost, small craft…) would just be noise. */
export async function activeAlert(lat: number, lng: number): Promise<WeatherAlert | null> {
  const key = `wx:${lat.toFixed(2)},${lng.toFixed(2)}`
  const hit = await getSetting(key)
  if (hit) {
    try {
      const c = JSON.parse(hit) as { at: number; alert: WeatherAlert | null }
      if (Date.now() - c.at < 30 * 60 * 1000) return c.alert
    } catch {
      // fall through and re-fetch
    }
  }

  let alert: WeatherAlert | null = null
  try {
    const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}&status=actual`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DispatchApp/1.0 (internal fleet tool)', Accept: 'application/geo+json' },
    })
    if (res.ok) {
      const data = (await res.json()) as { features?: { properties: any }[] }
      const top = (data.features ?? [])
        .map((f) => f.properties)
        .find((p) => p.severity === 'Extreme' || p.severity === 'Severe')
      if (top) alert = { event: top.event, severity: top.severity, headline: top.headline }
    }
  } catch {
    // network hiccup — no alert, not an error the page needs to know about
  }

  await setSetting(key, JSON.stringify({ at: Date.now(), alert }))
  return alert
}
