// Рейсы Amazon Relay из базы (таблица amazon_trips). Разбор текста и всё чистое —
// lib/amazon-relay.ts.

import { sql } from './db.ts'
import type { CompanyId } from './company.ts'
import { stopsFromJson, type AmazonStatus, type AmazonStop, type LoadKind, type TrailerOwner } from './amazon-relay.ts'

export type AmazonTrip = {
  id: number
  truckId: number | null
  status: AmazonStatus
  vrid: string | null
  tourId: string | null
  stops: AmazonStop[]
  /** yyyy-mm-dd — день первой остановки, по нему рейсы раскладываются по дням. */
  startDate: string | null
  rate: number | null
  miles: number | null
  trailerNo: string | null
  trailerOwner: TrailerOwner | null
  loadKind: LoadKind | null
  notes: string | null
  createdAt: string
}

const iso = (v: unknown): string | null => {
  if (!v) return null
  if (v instanceof Date) {
    // DATE приходит полночью по местному времени сервера (lib/db.ts) — берём местные поля.
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return String(v).slice(0, 10)
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

function rowToTrip(r: Record<string, any>): AmazonTrip {
  return {
    id: Number(r.id),
    truckId: r.truck_id == null ? null : Number(r.truck_id),
    status: r.status as AmazonStatus,
    vrid: r.vrid ?? null,
    tourId: r.tour_id ?? null,
    stops: stopsFromJson(r.stops),
    startDate: iso(r.start_date),
    rate: num(r.rate),
    miles: num(r.miles),
    trailerNo: r.trailer_no ?? null,
    trailerOwner: r.trailer_owner === 'amazon' || r.trailer_owner === 'own' ? r.trailer_owner : null,
    loadKind: r.load_kind === 'drop' || r.load_kind === 'live' ? r.load_kind : null,
    notes: r.notes ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }
}

/** Рейсы компании с `from` (yyyy-mm-dd) и вперёд, плюс все без даты и всё ещё в пути. */
export async function listAmazonTrips(companyId: CompanyId, from: string): Promise<AmazonTrip[]> {
  const q = () => sql`
    SELECT * FROM amazon_trips
    WHERE company_id = ${companyId}
      AND (start_date IS NULL OR start_date >= ${from} OR status = 'in_transit')
    ORDER BY start_date IS NULL, start_date, id
    LIMIT 500`
  let rows
  try {
    rows = await q()
  } catch (e) {
    // Таблица приезжает с кодом, а схему дотягивает экран входа — вошедший туда не
    // заходит. Первый заход в раздел после выкладки дотягивает её сам (как lib/auth.ts).
    if ((e as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw e
    const { ensureSchema } = await import('./install.ts')
    await ensureSchema()
    rows = await q()
  }
  return rows.map(rowToTrip)
}

export async function amazonTripBelongs(companyId: CompanyId, id: number): Promise<AmazonTrip | null> {
  const rows = await sql`SELECT * FROM amazon_trips WHERE id = ${id} AND company_id = ${companyId}`
  return rows[0] ? rowToTrip(rows[0]) : null
}
