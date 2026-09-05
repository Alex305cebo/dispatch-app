import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { fleetExpiryAlerts } from '@/lib/maintenance'
import { listLoads, listReceivables } from '@/lib/loads'
import { can } from '@/lib/capabilities-server'

export const dynamic = 'force-dynamic'

export type AlertItem = { id: string; kind: 'warn' | 'error'; text: string; href: string }

/**
 * Что требует внимания прямо сейчас — для уведомлений в браузере
 * (components/alert-watch.tsx). Только дешёвые сигналы из базы, без маршрутизатора:
 * трак без GPS дольше трёх часов, стоит дольше трёх часов, непрочитанное «важное от
 * брокера», счёт просрочен, документ трака истекает на неделе, POD не загружен
 * сутки после выгрузки. Идентификатор стабилен — по нему клиент понимает, что уже
 * показывал.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ items: [] }, { status: 401 })
  const companyId = await companyScope()
  const locale = await getLocale()
  const items: AlertItem[] = []

  const [loads, expiry, fleet, receivables, showFinances] = await Promise.all([
    listLoads(companyId),
    fleetExpiryAlerts(companyId, locale),
    sql`SELECT t.id, t.number, fs.drive_status, fs.updated_at
        FROM trucks t JOIN fleet_status fs ON fs.unit = t.number
        WHERE t.company_id = ${companyId} AND t.unavailable IS NULL`.then(
      (r) => r as unknown as { id: number; number: string; drive_status: string | null; updated_at: string }[],
    ),
    can(user, 'finances').then((ok) => (ok ? listReceivables(companyId) : [])),
    can(user, 'finances'),
  ])
  const live = loads.filter((l) => l.status !== 'cancelled')
  const busy = new Set(live.filter((l) => l.status === 'booked' || l.status === 'in_transit').map((l) => l.truckId))
  const now = Date.now()

  for (const f of fleet) {
    const ageH = (now - Date.parse(f.updated_at)) / 3_600_000
    if (ageH > 3 && busy.has(f.id))
      items.push({ id: `nogps:${f.id}:${Math.floor(ageH / 6)}`, kind: 'warn', text: t(locale, 'alerts.noGps').replace('{truck}', f.number), href: `/trucks/${f.id}` })
  }

  for (const l of live) {
    if (l.brokerNotes && !l.notesReadAt)
      items.push({ id: `notes:${l.id}`, kind: 'warn', text: t(locale, 'alerts.brokerNotes').replace('{route}', `${l.origin ?? '—'} → ${l.destination ?? '—'}`), href: `/loads/${l.id}` })
  }

  for (const a of expiry) {
    if (a.item.tone === 'bad' || (a.item.tone === 'warn' && a.item.daysLeft <= 7))
      items.push({
        id: `doc:${a.truckId}:${a.item.label}:${a.item.date}`,
        kind: a.item.tone === 'bad' ? 'error' : 'warn',
        text: t(locale, 'alerts.docExpiry').replace('{truck}', a.number).replace('{doc}', a.item.label).replace('{days}', String(a.item.daysLeft)),
        href: `/trucks/${a.truckId}#care`,
      })
  }

  if (showFinances)
    for (const r of receivables) {
      if (r.overdue)
        items.push({
          id: `overdue:${r.load.id}:${Math.floor(r.daysOut / 7)}`,
          kind: 'error',
          text: t(locale, 'alerts.overdue').replace('{route}', `${r.load.origin ?? '—'} → ${r.load.destination ?? '—'}`).replace('{days}', String(r.daysOut)),
          href: `/loads/${r.load.id}`,
        })
    }

  // POD не загружен сутки после выгрузки: без него не выставить счёт.
  const delivered = live.filter((l) => l.status === 'delivered')
  if (delivered.length) {
    const pods = (await sql`SELECT DISTINCT load_id FROM documents WHERE kind = 'pod' AND deleted_at IS NULL AND company_id = ${companyId} AND load_id = ANY(${delivered.map((l) => l.id)})`) as { load_id: number }[]
    const hasPod = new Set(pods.map((p) => p.load_id))
    for (const l of delivered) {
      const since = l.deliveryDate ? Date.parse(l.deliveryDate) : NaN
      if (!hasPod.has(l.id) && Number.isFinite(since) && now - since > 36 * 3_600_000)
        items.push({ id: `pod:${l.id}`, kind: 'warn', text: t(locale, 'alerts.noPod').replace('{route}', `${l.origin ?? '—'} → ${l.destination ?? '—'}`), href: `/loads/${l.id}` })
    }
  }

  return NextResponse.json({ items })
}
