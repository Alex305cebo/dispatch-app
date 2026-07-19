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

/** Document metadata (the bytea itself only leaves the DB via /api/docs/[id]). */
export async function listDocs(filter?: { truckId?: number; loadId?: number }): Promise<DocMeta[]> {
  const rows = filter?.loadId
    ? await sql`SELECT id, truck_id, load_id, kind, title, mime, size_bytes, uploaded_at
                FROM documents WHERE load_id = ${filter.loadId} ORDER BY uploaded_at DESC`
    : filter?.truckId
      ? await sql`SELECT id, truck_id, load_id, kind, title, mime, size_bytes, uploaded_at
                  FROM documents WHERE truck_id = ${filter.truckId} ORDER BY uploaded_at DESC`
      : await sql`SELECT id, truck_id, load_id, kind, title, mime, size_bytes, uploaded_at
                  FROM documents ORDER BY uploaded_at DESC LIMIT 200`
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return rows.map((r: any) => ({
    id: r.id,
    truckId: r.truck_id,
    loadId: r.load_id,
    kind: r.kind,
    title: r.title,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    uploadedAt: new Date(r.uploaded_at).toISOString(),
  }))
}

/** Every document enriched with its truck/driver and load route, for the library.
 *  A rate con attached to a load files under that load's truck even when the doc
 *  itself has no truck_id (COALESCE). */
export async function listDocsForLibrary(): Promise<DocLibRow[]> {
  const rows = await sql`
    SELECT d.id, d.truck_id, d.load_id, d.kind, d.title, d.mime, d.size_bytes, d.uploaded_at,
           COALESCE(d.truck_id, l.truck_id) AS group_truck_id,
           tt.number AS truck_number, tt.driver_name,
           l.origin, l.destination
    FROM documents d
    LEFT JOIN loads  l  ON l.id = d.load_id
    LEFT JOIN trucks tt ON tt.id = COALESCE(d.truck_id, l.truck_id)
    ORDER BY d.uploaded_at DESC
    LIMIT 500`
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return rows.map((r: any) => ({
    id: r.id,
    truckId: r.truck_id,
    loadId: r.load_id,
    kind: r.kind,
    title: r.title,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    uploadedAt: new Date(r.uploaded_at).toISOString(),
    groupTruckId: r.group_truck_id,
    truckNumber: r.truck_number,
    driverName: r.driver_name,
    origin: r.origin,
    destination: r.destination,
  }))
}

export async function listLoads(opts: { truckId?: number; status?: LoadStatus } = {}): Promise<
  LoadRecord[]
> {
  // Two filters, both optional — small enough to branch by hand rather than build
  // a query string. tagged-template params keep it injection-safe either way.
  const rows =
    opts.truckId !== undefined && opts.status
      ? await sql`SELECT * FROM loads WHERE truck_id = ${opts.truckId} AND status = ${opts.status} ORDER BY created_at DESC`
      : opts.truckId !== undefined
        ? await sql`SELECT * FROM loads WHERE truck_id = ${opts.truckId} ORDER BY created_at DESC`
        : opts.status
          ? await sql`SELECT * FROM loads WHERE status = ${opts.status} ORDER BY created_at DESC`
          : await sql`SELECT * FROM loads ORDER BY created_at DESC`
  return (rows as LoadRow[]).map(rowToLoad)
}

export type Receivable = {
  load: LoadRecord
  daysOut: number
  overdue: boolean
  bucket: '0-30' | '31-45' | '45+'
}

/** Invoiced-but-unpaid loads with aging. Feeds the AR page and the dashboard. */
export async function listReceivables(): Promise<Receivable[]> {
  const rows = (await sql`
    SELECT * FROM loads WHERE invoiced_at IS NOT NULL AND paid_at IS NULL
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

/**
 * loadId → id of that load's rate con document (newest one, if it has several).
 * Lets every load list show an "open the rate con" button without an N+1 query.
 */
export async function rateConByLoad(): Promise<Map<number, number>> {
  const rows = await sql`
    SELECT DISTINCT ON (load_id) load_id, id FROM documents
    WHERE kind = 'ratecon' AND load_id IS NOT NULL
    ORDER BY load_id, uploaded_at DESC`
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new Map(rows.map((r: any) => [r.load_id as number, r.id as number]))
}

/** The truck's current live load — newest not-yet-paid/cancelled. For Telegram intake. */
export async function activeLoadForTruck(truckId: number): Promise<LoadRecord | null> {
  const rows = (await sql`
    SELECT * FROM loads WHERE truck_id = ${truckId}
      AND status IN ('booked','in_transit','delivered')
    ORDER BY created_at DESC LIMIT 1`) as LoadRow[]
  return rows[0] ? rowToLoad(rows[0]) : null
}

/**
 * The load a truck is "on" for the map/delivery pin: prefer a live one
 * (in_transit → booked → delivered), otherwise fall back to the newest
 * non-cancelled load (e.g. a quote) so its delivery city still shows.
 */
export async function currentLoadForTruck(truckId: number): Promise<LoadRecord | null> {
  const rows = (await sql`
    SELECT * FROM loads WHERE truck_id = ${truckId} AND status <> 'cancelled'
    ORDER BY
      CASE status
        WHEN 'in_transit' THEN 0 WHEN 'booked' THEN 1
        WHEN 'delivered' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 1`) as LoadRow[]
  return rows[0] ? rowToLoad(rows[0]) : null
}

export async function getLoad(id: number): Promise<LoadRecord | null> {
  const rows = (await sql`SELECT * FROM loads WHERE id = ${id}`) as LoadRow[]
  return rows[0] ? rowToLoad(rows[0]) : null
}

export async function listTrucks(): Promise<TruckRecord[]> {
  const rows = (await sql`SELECT * FROM trucks ORDER BY id`) as TruckRow[]
  return rows.map(rowToTruck)
}

export async function getTruck(id: number): Promise<TruckRecord | null> {
  const rows = (await sql`SELECT * FROM trucks WHERE id = ${id}`) as TruckRow[]
  return rows[0] ? rowToTruck(rows[0]) : null
}

/** A sensible default truck when nothing else picks one (first-created). */
export async function defaultTruck(): Promise<TruckRecord> {
  const rows = (await sql`SELECT * FROM trucks ORDER BY id LIMIT 1`) as TruckRow[]
  if (!rows[0]) throw new Error('No truck configured — run: npm run db:init')
  return rowToTruck(rows[0])
}

/** The truck that owns a load, falling back to the default so money always computes. */
export async function truckForLoad(load: LoadRecord): Promise<TruckRecord> {
  if (load.truckId !== null) {
    const t = await getTruck(load.truckId)
    if (t) return t
  }
  return defaultTruck()
}
