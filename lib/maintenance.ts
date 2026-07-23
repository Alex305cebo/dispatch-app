// Truck care QUERIES (server only — imports lib/db). Types + pure helpers live in
// lib/maintenance-core.ts; re-exported here so server callers can import both from
// one place. Client components must import from maintenance-core, never from here.

import { cache } from 'react'
import { sql } from './db'
import {
  expiries,
  type ExpiryItem,
  type FleetStatus,
  type MaintenanceRecord,
  type TruckMeta,
  type TruckTodo,
} from './maintenance-core'
import type { Locale } from './i18n.ts'

export * from './maintenance-core'

type CompanyId = 'default' | 'demo'

// neon returns DATE columns as JS Date objects — String(date) is a long words form
// ("Fri Aug 07 2026…") whose slice(0,10) is garbage. Go through ISO to get YYYY-MM-DD.
const asDate = (v: unknown): string | null =>
  !v ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)

/* eslint-disable @typescript-eslint/no-explicit-any */
const metaOf = (r: any): TruckMeta => ({
  truckId: r.truck_id,
  vin: r.vin,
  plate: r.plate,
  trailerNumber: r.trailer_number,
  year: r.year,
  make: r.make,
  model: r.model,
  oilIntervalMi: r.oil_interval_mi,
  oilLastOdometer: r.oil_last_odometer,
  driverPhone: r.driver_phone,
  notes: r.notes,
  registrationExpiry: asDate(r.registration_expiry),
  inspectionExpiry: asDate(r.inspection_expiry),
  insuranceExpiry: asDate(r.insurance_expiry),
  cdlExpiry: asDate(r.cdl_expiry),
  medcardExpiry: asDate(r.medcard_expiry),
  hasPhoto: r.driver_photo_mime != null,
})

// Named columns, not SELECT * — driver_photo is a multi-hundred-KB bytea that would
// otherwise ride along on every truck-meta fetch, including the dashboard's
// fleet-wide alerts query. driver_photo_mime alone is enough to know it exists.
//
// getTruckMeta/listMaintenance/listTodos below take a bare truckId with no company
// filter of their own — safe ONLY because every caller reaches them by first calling
// the company-scoped getTruck()/listTrucks() (lib/loads.ts), which 404s a cross-
// company id before any of these ever run. Don't call these directly from a raw,
// unvalidated id (e.g. straight off a URL param) without that gate in front of it.
export async function getTruckMeta(truckId: number): Promise<TruckMeta | null> {
  const rows = await sql`
    SELECT truck_id, vin, plate, trailer_number, year, make, model, oil_interval_mi,
      oil_last_odometer, driver_phone, notes, registration_expiry, inspection_expiry,
      insurance_expiry, cdl_expiry, medcard_expiry, driver_photo_mime
    FROM truck_meta WHERE truck_id = ${truckId}`
  return rows[0] ? metaOf(rows[0]) : null
}

/** Trailer number per truck, for list/card views that show the truck number
 * alongside it — a lighter query than getTruckMeta (no photo/dates/notes). Joined to
 * trucks to scope by company — these three functions are fleet-WIDE (no single
 * truckId to gate on upstream), unlike getTruckMeta/listMaintenance/listTodos below,
 * which take a specific truckId already vetted by the caller's own getTruck(). */
export async function truckTrailerNumbers(companyId: CompanyId): Promise<Map<number, string>> {
  const rows = await sql`
    SELECT m.truck_id, m.trailer_number FROM truck_meta m
    JOIN trucks t ON t.id = m.truck_id
    WHERE t.company_id = ${companyId} AND m.trailer_number IS NOT NULL`
  return new Map((rows as { truck_id: number; trailer_number: string }[]).map((r) => [r.truck_id, r.trailer_number]))
}

/** Fleet-wide compliance: soonest-expiring doc per truck that's within 60 days. */
/** cache(): the root layout asks for this on EVERY page (the badge on the Траки nav
 * item) and the dashboard asks again for its own banner — the same query, twice per
 * dashboard request. Per-request only, so an expiry edited on the truck page shows up
 * on the next render. */
export const fleetExpiryAlerts = cache(async function fleetExpiryAlerts(
  companyId: CompanyId,
  locale: Locale = 'en',
): Promise<{ truckId: number; number: string; item: ExpiryItem }[]> {
  const rows = await sql`
    SELECT m.truck_id, m.vin, m.plate, m.trailer_number, m.year, m.make, m.model,
      m.oil_interval_mi, m.oil_last_odometer, m.driver_phone, m.notes,
      m.registration_expiry, m.inspection_expiry, m.insurance_expiry, m.cdl_expiry,
      m.medcard_expiry, m.driver_photo_mime, t.number
    FROM truck_meta m JOIN trucks t ON t.id = m.truck_id
    WHERE t.company_id = ${companyId}`
  const out: { truckId: number; number: string; item: ExpiryItem }[] = []
  for (const r of rows as any[]) {
    const soonest = expiries(metaOf(r), locale).find((e) => e.tone !== 'good')
    if (soonest) out.push({ truckId: r.truck_id, number: r.number, item: soonest })
  }
  return out.sort((a, b) => a.item.daysLeft - b.item.daysLeft)
})

/** Every truck's passport in one query — the /trucks list computes oil status and
 * expiry chips per card from these with the pure helpers (oilStatus/expiries),
 * instead of N getTruckMeta round-trips. */
export async function truckMetas(companyId: CompanyId): Promise<Map<number, TruckMeta>> {
  const rows = await sql`
    SELECT m.truck_id, m.vin, m.plate, m.trailer_number, m.year, m.make, m.model,
      m.oil_interval_mi, m.oil_last_odometer, m.driver_phone, m.notes,
      m.registration_expiry, m.inspection_expiry, m.insurance_expiry, m.cdl_expiry,
      m.medcard_expiry, m.driver_photo_mime
    FROM truck_meta m JOIN trucks t ON t.id = m.truck_id
    WHERE t.company_id = ${companyId}`
  return new Map((rows as any[]).map((r) => [r.truck_id as number, metaOf(r)]))
}

/** Open (not-done) "needs fixing" count per truck, for the list's health chips. */
export async function openTodoCounts(companyId: CompanyId): Promise<Map<number, number>> {
  const rows = await sql`
    SELECT d.truck_id, COUNT(*)::int AS n FROM truck_todos d
    JOIN trucks t ON t.id = d.truck_id
    WHERE t.company_id = ${companyId} AND d.done_at IS NULL
    GROUP BY d.truck_id`
  return new Map((rows as { truck_id: number; n: number }[]).map((r) => [r.truck_id, r.n]))
}

/** Which trucks have a driver photo — for fleet-list avatars, without the bytea. */
export async function truckPhotoFlags(companyId: CompanyId): Promise<Set<number>> {
  const rows = await sql`
    SELECT m.truck_id FROM truck_meta m JOIN trucks t ON t.id = m.truck_id
    WHERE t.company_id = ${companyId} AND m.driver_photo_mime IS NOT NULL`
  return new Set((rows as { truck_id: number }[]).map((r) => r.truck_id))
}

export async function listMaintenance(truckId: number): Promise<MaintenanceRecord[]> {
  const rows = await sql`
    SELECT * FROM truck_maintenance WHERE truck_id = ${truckId} ORDER BY done_at DESC, id DESC`
  return rows.map((r: any) => ({
    id: r.id,
    truckId: r.truck_id,
    kind: r.kind,
    title: r.title,
    notes: r.notes,
    cost: r.cost,
    odometer: r.odometer,
    doneAt: asDate(r.done_at) ?? '',
  }))
}

export async function listTodos(truckId: number): Promise<TruckTodo[]> {
  const rows = await sql`
    SELECT * FROM truck_todos WHERE truck_id = ${truckId}
    ORDER BY done_at NULLS FIRST, created_at DESC`
  return rows.map((r: any) => ({
    id: r.id,
    truckId: r.truck_id,
    title: r.title,
    notes: r.notes,
    priority: r.priority,
    createdAt: String(r.created_at),
    doneAt: r.done_at ? String(r.done_at) : null,
  }))
}

// Unscoped by company on purpose: fleet_status is keyed by trucks.number (a plain
// TEXT unit id from the ELD), not truck_id, and demo trucks are seeded with numbers
// that can never collide with a real unit (lib/demo.ts) — so a demo truck simply never
// finds a match here, same as any truck with no ELD connected.
export async function fleetStatusByUnit(): Promise<Map<string, FleetStatus>> {
  const rows = await sql`SELECT * FROM fleet_status`
  return new Map(
    rows.map((r: any) => [
      r.unit,
      {
        unit: r.unit,
        driverName: r.driver_name,
        hosPercent: r.hos_percent,
        driveStatus: r.drive_status,
        location: r.location,
        lat: r.lat,
        lng: r.lng,
        odometer: r.odometer,
        fuel: r.fuel,
        eldSeen: r.eld_seen,
        updatedAt: String(r.updated_at),
      },
    ]),
  )
}
