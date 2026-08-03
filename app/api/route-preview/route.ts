import { NextResponse, type NextRequest } from 'next/server'
import { cityCoords, routePath } from '@/lib/geo-routing'

export const dynamic = 'force-dynamic'

// Coordinates + road miles for the load card's map. The card lives entirely in the
// URL hash (the rate never touches a server), so the page can only geocode after
// hydration — hence an endpoint instead of doing it in the server component.
//
// Only place names cross the wire here: no rate, no broker, no reference numbers.
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  const from = q.get('from')?.trim()
  const to = q.get('to')?.trim()
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })

  const [a, b] = await Promise.all([cityCoords(from), cityCoords(to)])
  if (!a || !b) return NextResponse.json({ from: a, to: b, miles: null, coords: null })

  // Road miles AND the polyline — without coords the map drew a straight dashed
  // line between the two pins instead of the actual highway route.
  const r = await routePath(from, to).catch(() => null)
  const miles = r && 'miles' in r ? r.miles : null
  const coords = r && 'coords' in r ? (r.coords ?? null) : null
  return NextResponse.json({ from: a, to: b, miles, coords })
}
