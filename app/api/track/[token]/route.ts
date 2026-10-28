import { NextResponse, type NextRequest } from 'next/server'
import { brokerMapFor } from '@/lib/broker-map'
import { requestIp as clientIp } from '@/lib/broker-map-token'

export const dynamic = 'force-dynamic'

/** Не кэшировать нигде и не индексировать: данные живые и только по ссылке. */
const PRIVATE_HEADERS = {
  'cache-control': 'no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
}

/**
 * Карта траков для брокеров (app/track/[token]) обновляется отсюда раз в 2 минуты.
 * Отдаёт ровно BrokerMapView (lib/broker-map-core.ts) — белый список полей, без
 * внутренних записей. Неверный токен, выключенная ссылка и перебор — одна и та же
 * пустая 404: снаружи не отличить «нет такой» от «заметили перебор».
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const view = await brokerMapFor(token, clientIp(req.headers))
  if (!view) return new NextResponse(null, { status: 404, headers: PRIVATE_HEADERS })
  return NextResponse.json(view, { headers: PRIVATE_HEADERS })
}
