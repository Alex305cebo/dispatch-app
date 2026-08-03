import { NextResponse, type NextRequest } from 'next/server'
import { cityCoords, routeMiles } from '@/lib/geo-routing'

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
  if (!a || !b) return NextResponse.json({ from: a, to: b, miles: null })

  // Road miles, not straight-line: a dispatcher compares this against the rate con's
  // own mileage, and the gap between the two is exactly what they need to see.
  const r = await routeMiles(from, to).catch(() => null)
  const miles = r && 'miles' in r ? r.miles : null
  return NextResponse.json({ from: a, to: b, miles })
}
