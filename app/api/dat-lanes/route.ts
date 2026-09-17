import { NextResponse, type NextRequest } from 'next/server'
import { sql } from '@/lib/db'
import { companyScope, getCurrentUser } from '@/lib/session'
import { stateOfCity } from '@/lib/toll-spend'

export const dynamic = 'force-dynamic'

/**
 * Расширение DispatchPro присылает сюда спот-ставки DAT RateView, которые диспетчер
 * видит на доске DAT One (блок SPOT RATE у раскрытого груза): направление, мили,
 * ставка, $/mi, диапазон. Это настоящие цифры DAT с аккаунта пользователя — не оценка.
 * Вход — по обычной сессии TMS в том же Chrome (расширение шлёт с cookie), поэтому
 * отдельного ключа нет; демо не пишет. Одно направление в день — одна строка.
 */
type Lane = {
  origin?: string
  dest?: string
  miles?: number
  spotRate?: number
  spotRpm?: number
  spotLow?: number
  spotHigh?: number
  equipment?: string
}

const EQUIPMENT = new Set(['VAN', 'REEFER', 'FLATBED'])

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.isDemo) return NextResponse.json({ error: 'demo' }, { status: 403 })
  const companyId = await companyScope()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const list = (Array.isArray(body) ? body : []) as Lane[]
  let saved = 0
  for (const l of list.slice(0, 50)) {
    const origin = String(l.origin ?? '').trim().slice(0, 120)
    const dest = String(l.dest ?? '').trim().slice(0, 120)
    const miles = Math.round(Number(l.miles))
    const rate = Math.round(Number(l.spotRate))
    const rpm = Number(l.spotRpm)
    if (!origin || !dest || !(miles > 0) || !(rate > 0) || !(rpm > 0) || rpm > 20) continue
    const eq = String(l.equipment ?? 'VAN').toUpperCase()
    const equipment = EQUIPMENT.has(eq) ? eq : 'VAN'
    const low = Number(l.spotLow) > 0 ? Math.round(Number(l.spotLow)) : null
    const high = Number(l.spotHigh) > 0 ? Math.round(Number(l.spotHigh)) : null
    await sql`
      INSERT INTO dat_lanes
        (company_id, source, origin, dest, origin_state, dest_state, equipment, miles, spot_rate, spot_rpm, spot_low, spot_high, seen_on, seen_at)
      VALUES (${companyId}, 'dat', ${origin}, ${dest}, ${stateOfCity(origin)}, ${stateOfCity(dest)}, ${equipment}, ${miles}, ${rate}, ${rpm},
              ${low}, ${high}, CURDATE(), NOW(6))
      ON DUPLICATE KEY UPDATE
        miles = VALUES(miles), spot_rate = VALUES(spot_rate), spot_rpm = VALUES(spot_rpm),
        spot_low = VALUES(spot_low), spot_high = VALUES(spot_high), seen_at = NOW(6)`
    saved++
  }
  return NextResponse.json({ ok: true, saved })
}
