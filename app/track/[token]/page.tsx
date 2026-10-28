import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { brokerMapFor } from '@/lib/broker-map'
import { requestIp as clientIp } from '@/lib/broker-map-token'
import { BrokerMap } from './broker-map'

// Карта траков для брокеров — одна ссылка на всех, без входа (Alex, 10/28/26).
// Где траки сейчас (огрублённо, ~10 миль), куда едут (город, штат) и ETA по ET.
// Всё, что видно здесь, — BrokerMapView из lib/broker-map-core.ts, белый список:
// ни водителя, ни номеров, ни ставок, ни брокеров, ни адресов. Публичный адрес —
// middleware.ts; ссылку выдаёт и выключает админ.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Fleet map',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await brokerMapFor(token, clientIp(await headers()))
  if (!view) notFound()
  return <BrokerMap token={token} initial={view} />
}
