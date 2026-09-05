import { NextResponse, type NextRequest } from 'next/server'
import { companyScope, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { listLoads, listTrucks } from '@/lib/loads'
import { calcLoad } from '@/lib/profit'
import { truckLabel } from '@/lib/map'
import { weekAnchorOf } from '@/lib/fmt'

export const dynamic = 'force-dynamic'

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Неделя для бухгалтера одним файлом: все подтверждённые грузы недели (пятница —
 * пятница, по дате пикапа), по строке на груз — дата, трак, водитель, маршрут,
 * брокер, MC, номер груза, мили, ставка, $/милю, статус, счёт, даты счёта и
 * оплаты, зарплата водителя по настройкам трака. CSV с BOM — Excel открывает
 * кириллицу правильно. GET /api/export/week?start=<ms начала недели>
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !(await can(user, 'finances'))) return new NextResponse('Forbidden', { status: 403 })
  const start = Number(req.nextUrl.searchParams.get('start'))
  if (!Number.isFinite(start)) return new NextResponse('start?', { status: 400 })
  const companyId = await companyScope()
  const [loads, trucks] = await Promise.all([listLoads(companyId), listTrucks(companyId)])
  const byId = new Map(trucks.map((t) => [t.id, t]))

  const rows = loads
    .filter((l) => l.status !== 'quoted' && l.status !== 'cancelled')
    .filter((l) => weekAnchorOf(new Date(l.pickupDate ?? l.createdAt).getTime()) === start)
    .sort((a, b) => (a.pickupDate ?? a.createdAt).localeCompare(b.pickupDate ?? b.createdAt))

  const head = ['Pickup', 'Delivery', 'Truck', 'Driver', 'From', 'To', 'Broker', 'MC', 'Ref', 'Loaded mi', 'Deadhead mi', 'Rate', '$/mi', 'Status', 'Invoice', 'Invoiced', 'Paid', 'Driver pay']
  const lines = rows.map((l) => {
    const truck = l.truckId != null ? byId.get(l.truckId) : undefined
    let pay: number | null = null
    if (truck) {
      try {
        pay = calcLoad(l, truck).driver
      } catch {
        pay = null
      }
    }
    const miles = l.loadedMiles + l.deadheadMiles
    return [
      l.pickupDate?.slice(0, 10) ?? '',
      l.deliveryDate?.slice(0, 10) ?? '',
      truck ? truckLabel(truck) : '',
      truck?.driverName ?? '',
      l.origin ?? '',
      l.destination ?? '',
      l.brokerName ?? '',
      l.brokerMc ?? '',
      l.referenceId ?? '',
      l.loadedMiles,
      l.deadheadMiles,
      l.rate.toFixed(2),
      miles > 0 ? (l.rate / miles).toFixed(2) : '',
      l.status,
      l.invoiceNumber ?? '',
      l.invoicedAt?.slice(0, 10) ?? '',
      l.paidAt?.slice(0, 10) ?? '',
      pay != null ? pay.toFixed(2) : '',
    ]
      .map(cell)
      .join(',')
  })
  const gross = rows.reduce((s, l) => s + l.rate, 0)
  lines.push(['TOTAL', '', '', '', '', '', '', '', '', rows.reduce((s, l) => s + l.loadedMiles, 0), rows.reduce((s, l) => s + l.deadheadMiles, 0), gross.toFixed(2)].map(cell).join(','))

  const name = `week-${new Date(start).toISOString().slice(0, 10)}.csv`
  return new NextResponse('﻿' + [head.join(','), ...lines].join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
    },
  })
}
