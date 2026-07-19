// Deadhead math — distance from where the truck sits (ELD GPS) to a load's pickup.
// Pure and offline: no API, no key. Needed by every ELD path (official API,
// TrackEnsure, or extension), so it's built first and independently.

export type LatLng = { lat: number; lng: number }

const EARTH_MILES = 3958.8

/** Great-circle (straight-line) distance between two points, in miles. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Roads aren't straight lines. US road distance runs ~1.15–1.25× the great-circle
// distance on average, so a bare haversine underestimates deadhead. This factor is
// the deliberate approximation.
// ponytail: fixed 1.2 circuity factor. Swap for a real routing API (OSRM/Mapbox)
// only if the dispatcher's confirmed corrections show it's consistently off.
const CIRCUITY = 1.2

/**
 * Estimated deadhead miles from the truck to the load origin. This is a PROPOSAL —
 * the dispatcher sees it and confirms (same as the amber fields today), so a
 * straight-line×circuity estimate is fine; it doesn't silently drive the money.
 */
export function deadheadEstimate(truck: LatLng, origin: LatLng): number {
  return Math.round(haversineMiles(truck, origin) * CIRCUITY)
}

/** Compass bearing (0-360, 0=north, clockwise) from `a` to `b` — points the moving-
 * truck arrow at its actual direction of travel instead of a fixed "up". */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}
