import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getCurrentUser } from '@/lib/session'
import { getSetting } from '@/lib/settings'
import { rateCheck, type RateCheckInput } from '@/lib/rate-check'

export const dynamic = 'force-dynamic'

/**
 * Проверка ставки груза снаружи TMS: цель торга, цена грузоотправителя и доля брокера,
 * рынок DAT на погрузке и выгрузке, своя история по штатам (lib/rate-check.ts).
 *
 * Кто зовёт:
 * • бот Telegram (сервер dispatch4you.com) — с ключом в заголовке x-rate-key; ключ лежит
 *   в settings.rate_check_key и в файле tms-rate.key рядом с ключами бота. Цифры — рынок
 *   основной компании, можно спросить Warp сейчас. middleware пропускает такой запрос
 *   без сессии, проверка ключа — здесь;
 * • расширение на доске DAT — с cookie TMS того же Chrome (как /api/dat-lanes);
 * • демо смотрит рынок основной компании, но Warp сам не спрашивает.
 *
 * Деньги груза сюда приходят, но нигде не сохраняются: ответ собирается и уходит.
 */
async function keyOk(given: string): Promise<boolean> {
  const want = await getSetting('rate_check_key').catch(() => null)
  if (!want || want.length < 32 || given.length !== want.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}
const str = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-rate-key')
  // Рынок — всегда основной компании: у демо своих котировок почти нет, а цифры рынка
  // не секрет. Спросить Warp сейчас — только с ключом или под настоящим входом.
  const market = 'default' as const
  let live = false
  if (key !== null) {
    if (!(await keyOk(key))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    live = true
  } else {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    live = !user.isDemo
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const input: RateCheckInput = {
    origin: str(body.origin),
    dest: str(body.dest),
    originZip: str(body.originZip, 10),
    destZip: str(body.destZip, 10),
    miles: num(body.miles),
    rate: num(body.rate),
    equipment: str(body.equipment, 40),
    broker: str(body.broker),
    deadhead: num(body.deadhead),
  }
  if (!input.origin || !input.dest) return NextResponse.json({ error: 'origin and dest required' }, { status: 400 })
  // В рейт-конах миль часто нет вовсе — без них нет ни ставки за милю, ни «ниже цели на $X».
  // Считаем по дороге (тот же маршрутизатор, что у кнопки «Мили по карте»); индекс, если
  // пришёл, точнее названия города. milesByRoute — подпись «по дороге» у бота.
  let milesByRoute = false
  if (!input.miles) {
    const { routeMiles } = await import('@/lib/geo-routing')
    const r = await routeMiles(input.origin, input.dest, 'ru', {
      origin: input.originZip ? `${input.origin} ${input.originZip}` : null,
      destination: input.destZip ? `${input.dest} ${input.destZip}` : null,
    }).catch(() => null)
    if (r && 'miles' in r && r.miles > 0 && !r.estimated) {
      input.miles = r.miles
      milesByRoute = true
    }
  }
  try {
    return NextResponse.json({ ...(await rateCheck(input, { market, live })), milesByRoute })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
