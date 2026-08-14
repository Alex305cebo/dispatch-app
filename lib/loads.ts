import { sql } from './db.ts'
import {
  rowToLoad,
  rowToTruck,
  type LoadRecord,
  type LoadRow,
  type LoadStatus,
  type TruckRecord,
  type TruckRow,
} from './map.ts'
import type { DocMeta, DocLibRow } from './docs.ts'

// Every function below takes companyId ('default' = the real fleet, 'demo' = the
// public sandbox — lib/demo.ts) and filters by it directly, rather than trusting
// callers to only ever pass already-scoped ids. That's what keeps the public demo
// account from ever seeing or touching real company data, and vice versa.
type CompanyId = 'default' | 'demo'

/** Document metadata (the bytea itself only leaves the DB via /api/docs/[id]). */
export async function listDocs(
  companyId: CompanyId,
  filter?: { truckId?: number; loadId?: number },
): Promise<DocMeta[]> {
  const rows = filter?.loadId
    ? await sql`SELECT id, truck_id, load_id, maintenance_id, kind, title, mime, size_bytes, uploaded_at, deleted_at
                FROM documents WHERE load_id = ${filter.loadId} AND company_id = ${companyId} AND deleted_at IS NULL
                ORDER BY uploaded_at DESC`
    : filter?.truckId
      ? await sql`SELECT id, truck_id, load_id, maintenance_id, kind, title, mime, size_bytes, uploaded_at, deleted_at
                  FROM documents WHERE truck_id = ${filter.truckId} AND company_id = ${companyId} AND deleted_at IS NULL
                  ORDER BY uploaded_at DESC`
      : await sql`SELECT id, truck_id, load_id, maintenance_id, kind, title, mime, size_bytes, uploaded_at, deleted_at
                  FROM documents WHERE company_id = ${companyId} AND deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT 200`
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return rows.map((r: any) => ({
    id: r.id,
    truckId: r.truck_id,
    loadId: r.load_id,
    maintenanceId: r.maintenance_id,
    kind: r.kind,
    title: r.title,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    uploadedAt: new Date(r.uploaded_at).toISOString(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
  }))
}

/** Every (non-trashed) document enriched with its truck/driver and load route, for
 *  the library. A rate con attached to a load files under that load's truck even
 *  when the doc itself has no truck_id (COALESCE). */
export async function listDocsForLibrary(companyId: CompanyId): Promise<DocLibRow[]> {
  const rows = await sql`
    SELECT d.id, d.truck_id, d.load_id, d.maintenance_id, d.kind, d.title, d.mime, d.size_bytes,
           d.uploaded_at, d.deleted_at,
           COALESCE(d.truck_id, l.truck_id) AS group_truck_id,
           tt.number AS truck_number, tt.driver_name,
           l.origin, l.destination
    FROM documents d
    LEFT JOIN loads  l  ON l.id = d.load_id
    LEFT JOIN trucks tt ON tt.id = COALESCE(d.truck_id, l.truck_id)
    WHERE d.company_id = ${companyId} AND d.deleted_at IS NULL
    ORDER BY d.uploaded_at DESC
    LIMIT 500`
  return rows.map(rowToDocLibRow)
}

/** Trashed documents, most-recently-deleted first — restore or purge for good. */
export async function listTrashedDocs(companyId: CompanyId): Promise<DocLibRow[]> {
  const rows = await sql`
    SELECT d.id, d.truck_id, d.load_id, d.maintenance_id, d.kind, d.title, d.mime, d.size_bytes,
           d.uploaded_at, d.deleted_at,
           COALESCE(d.truck_id, l.truck_id) AS group_truck_id,
           tt.number AS truck_number, tt.driver_name,
           l.origin, l.destination
    FROM documents d
    LEFT JOIN loads  l  ON l.id = d.load_id
    LEFT JOIN trucks tt ON tt.id = COALESCE(d.truck_id, l.truck_id)
    WHERE d.company_id = ${companyId} AND d.deleted_at IS NOT NULL
    ORDER BY d.deleted_at DESC
    LIMIT 500`
  return rows.map(rowToDocLibRow)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToDocLibRow(r: any): DocLibRow {
  return {
    id: r.id,
    truckId: r.truck_id,
    loadId: r.load_id,
    maintenanceId: r.maintenance_id,
    kind: r.kind,
    title: r.title,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    uploadedAt: new Date(r.uploaded_at).toISOString(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
    groupTruckId: r.group_truck_id,
    truckNumber: r.truck_number,
    driverName: r.driver_name,
    origin: r.origin,
    destination: r.destination,
  }
}

export async function listLoads(
  companyId: CompanyId,
  opts: { truckId?: number; status?: LoadStatus } = {},
): Promise<LoadRecord[]> {
  // Three filters, all optional — small enough to branch by hand rather than build
  // a query string. tagged-template params keep it injection-safe either way.
  const rows =
    opts.truckId !== undefined && opts.status
      ? await sql`SELECT * FROM loads WHERE company_id = ${companyId} AND truck_id = ${opts.truckId} AND status = ${opts.status} ORDER BY created_at DESC`
      : opts.truckId !== undefined
        ? await sql`SELECT * FROM loads WHERE company_id = ${companyId} AND truck_id = ${opts.truckId} ORDER BY created_at DESC`
        : opts.status
          ? await sql`SELECT * FROM loads WHERE company_id = ${companyId} AND status = ${opts.status} ORDER BY created_at DESC`
          : await sql`SELECT * FROM loads WHERE company_id = ${companyId} ORDER BY created_at DESC`
  return (rows as LoadRow[]).map(rowToLoad)
}

export type Receivable = {
  load: LoadRecord
  daysOut: number
  overdue: boolean
  bucket: '0-30' | '31-45' | '45+'
}

/** Invoiced-but-unpaid loads with aging. Feeds the AR page and the dashboard. */
export async function listReceivables(companyId: CompanyId): Promise<Receivable[]> {
  const rows = (await sql`
    SELECT * FROM loads WHERE company_id = ${companyId} AND invoiced_at IS NOT NULL AND paid_at IS NULL
    ORDER BY invoiced_at ASC`) as LoadRow[]
  const now = Date.now()
  return rows.map(rowToLoad).map((load) => {
    const daysOut = Math.floor((now - new Date(load.invoicedAt!).getTime()) / 86_400_000)
    return {
      load,
      daysOut,
      overdue: daysOut > load.paymentTermsDays,
      bucket: daysOut <= 30 ? '0-30' : daysOut <= 45 ? '31-45' : '45+',
    }
  })
}

/** Delivered but never invoiced — these were falling through the cracks entirely:
 * invisible on the AR page until someone remembered to generate an invoice first,
 * even though the money is just as owed the moment the load is delivered. */
export async function listUninvoicedDelivered(companyId: CompanyId): Promise<LoadRecord[]> {
  const rows = (await sql`
    SELECT * FROM loads WHERE company_id = ${companyId} AND status = 'delivered' AND invoiced_at IS NULL
    ORDER BY created_at DESC`) as LoadRow[]
  return rows.map(rowToLoad)
}

export type LoadWithDispatcher = LoadRecord & { dispatcherName: string | null }

/** Every committed (booked or further) load with who dispatched it (by name) — feeds
 * the weekly per-dispatcher/driver "who earned what" report on Финансы. Excludes
 * 'quoted' on purpose: a quote nobody's confirmed yet isn't earned money, and
 * 'cancelled' since it never happened. Grouping by week/dispatcher/truck happens in
 * the page itself (same JS-side pattern as the other weekly stats in this app), not
 * in SQL — the report needs calcLoad() per load anyway, which is a JS function. */
export async function listLoadsByDispatcher(companyId: CompanyId): Promise<LoadWithDispatcher[]> {
  const rows = await sql`
    SELECT l.*, u.name AS dispatcher_name
    FROM loads l
    LEFT JOIN users u ON u.id = l.dispatcher_id
    WHERE l.company_id = ${companyId} AND l.status IN ('booked', 'in_transit', 'delivered', 'paid')
    ORDER BY l.created_at DESC`
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (rows as any[]).map((r) => ({ ...rowToLoad(r as LoadRow), dispatcherName: r.dispatcher_name ?? null }))
}

/** Paid loads, newest first — feeds the "Оплачено" tab on the AR page. */
export async function listPaidLoads(companyId: CompanyId): Promise<LoadRecord[]> {
  const rows = (await sql`
    SELECT * FROM loads WHERE company_id = ${companyId} AND paid_at IS NOT NULL ORDER BY paid_at DESC`) as LoadRow[]
  return rows.map(rowToLoad)
}

/**
 * loadId → id of that load's rate con document (newest one, if it has several).
 * Lets every load list show an "open the rate con" button without an N+1 query.
 */
export async function rateConByLoad(companyId: CompanyId): Promise<Map<number, number>> {
  const rows = await sql`
    SELECT DISTINCT ON (load_id) load_id, id FROM documents
    WHERE company_id = ${companyId} AND kind = 'ratecon' AND load_id IS NOT NULL
    ORDER BY load_id, uploaded_at DESC`
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new Map(rows.map((r: any) => [r.load_id as number, r.id as number]))
}

/** The truck's current live load — newest not-yet-paid/cancelled. For Telegram intake
 * (always companyId 'default' — see lib/tg-intake.ts). */
export async function activeLoadForTruck(companyId: CompanyId, truckId: number): Promise<LoadRecord | null> {
  const rows = (await sql`
    SELECT * FROM loads WHERE company_id = ${companyId} AND truck_id = ${truckId}
      AND status IN ('booked','in_transit','delivered')
    ORDER BY created_at DESC LIMIT 1`) as LoadRow[]
  return rows[0] ? rowToLoad(rows[0]) : null
}

/**
 * The load a truck is actually hauling RIGHT NOW — drives the map's delivery pin,
 * the route line and every "до выгрузки · N mi" figure.
 *
 * Only in_transit/booked count. It used to fall through to 'delivered' (and any
 * other non-cancelled status), which meant a truck that had already unloaded still
 * showed a delivery pin and a route to a city it had left — the map claiming a trip
 * that was over. A finished load is history, not a destination.
 *
 * Newest wins, full stop — no in_transit-over-booked preference. That preference
 * used to mean an old in_transit load a dispatcher forgot to close out would keep
 * beating a brand new load added for the same truck, so the map and "Текущее
 * задание" silently kept pointing at the trip that was actually over instead of
 * the one just added. The next load added for a truck IS the current one; closing
 * out the old one is a separate, later step, not a precondition for this to update.
 */
export async function currentLoadForTruck(companyId: CompanyId, truckId: number): Promise<LoadRecord | null> {
  const rows = (await sql`
    SELECT * FROM loads
    WHERE company_id = ${companyId} AND truck_id = ${truckId} AND status IN ('in_transit', 'booked')
    ORDER BY created_at DESC
    LIMIT 1`) as LoadRow[]
  return rows[0] ? rowToLoad(rows[0]) : null
}

export async function getLoad(companyId: CompanyId, id: number): Promise<LoadRecord | null> {
  const rows = (await sql`SELECT * FROM loads WHERE id = ${id} AND company_id = ${companyId}`) as LoadRow[]
  return rows[0] ? rowToLoad(rows[0]) : null
}

export async function listTrucks(companyId: CompanyId): Promise<TruckRecord[]> {
  const rows = (await sql`SELECT * FROM trucks WHERE company_id = ${companyId} ORDER BY id`) as TruckRow[]
  return rows.map(rowToTruck)
}

export async function getTruck(companyId: CompanyId, id: number): Promise<TruckRecord | null> {
  const rows = (await sql`SELECT * FROM trucks WHERE id = ${id} AND company_id = ${companyId}`) as TruckRow[]
  return rows[0] ? rowToTruck(rows[0]) : null
}

/** A sensible default truck when nothing else picks one (first-created). */
export async function defaultTruck(companyId: CompanyId): Promise<TruckRecord> {
  const rows = (await sql`SELECT * FROM trucks WHERE company_id = ${companyId} ORDER BY id LIMIT 1`) as TruckRow[]
  if (!rows[0]) throw new Error('No truck configured — run: npm run db:init')
  return rowToTruck(rows[0])
}

/** The truck that owns a load, falling back to the default so money always computes. */
export async function truckForLoad(companyId: CompanyId, load: LoadRecord): Promise<TruckRecord> {
  if (load.truckId !== null) {
    const t = await getTruck(companyId, load.truckId)
    if (t) return t
  }
  return defaultTruck(companyId)
}

/** True if this truck belongs to the given company — the ownership check every
 * mutating server action uses before touching a truck (or anything hung off its
 * truck_id: truck_meta, truck_maintenance, truck_todos) by a raw id from the client,
 * so a demo session can never edit/delete a real truck by guessing its id. */
export async function truckBelongs(companyId: CompanyId, truckId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM trucks WHERE id = ${truckId} AND company_id = ${companyId}`
  return rows.length > 0
}

/** Same check as truckBelongs, for a load id. */
export async function loadBelongs(companyId: CompanyId, loadId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM loads WHERE id = ${loadId} AND company_id = ${companyId}`
  return rows.length > 0
}

/** Same check as truckBelongs, for a document id. */
export async function docBelongs(companyId: CompanyId, docId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM documents WHERE id = ${docId} AND company_id = ${companyId}`
  return rows.length > 0
}

/** Штат из «EVANSVILLE, IN» → «IN». null, если города в таком виде нет. */
const stateOf = (city: string | null) => city?.trim().match(/,\s*([A-Z]{2})$/)?.[1] ?? null

/**
 * Наш собственный средний $/милю на этом направлении — то, что показывается вместо
 * биржевого спот-рейта. Публичного бесплатного фида спот-рынка не существует
 * (DAT/Truckstop продают его), а вечный прочерк в «Детали» не говорит диспетчеру
 * ничего. Сколько мы сами брали за милю между этими штатами — цифра, которая у нас
 * уже есть и по которой ставку действительно можно сравнить.
 *
 * Считаем по паре ШТАТОВ, а не городов: город-в-город у маленького парка почти
 * никогда не повторится, а IN→CA повторяется. Отменённые и сам этот груз исключены.
 */
export async function laneAvgRpmFor(
  companyId: CompanyId,
  origin: string | null,
  destination: string | null,
  exceptLoadId: number,
): Promise<number | null> {
  const from = stateOf(origin)
  const to = stateOf(destination)
  if (!from || !to) return null
  const rows = (await sql`
    SELECT AVG(rate / NULLIF(loaded_miles, 0)) AS rpm, COUNT(*) AS n
    FROM loads
    WHERE company_id = ${companyId} AND id <> ${exceptLoadId}
      AND status <> 'cancelled' AND loaded_miles > 0
      AND origin ILIKE ${'%, ' + from} AND destination ILIKE ${'%, ' + to}`) as {
    rpm: string | number | null
    n: string | number
  }[]
  const rpm = rows[0]?.rpm == null ? null : Number(rows[0].rpm)
  return rpm && Number.isFinite(rpm) && rpm > 0 ? rpm : null
}
