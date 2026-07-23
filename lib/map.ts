// DB rows → the shapes calcLoad already understands.
//
// No side effects and no db import on purpose: these are the money path, and they
// must be testable without a database (see map.test.ts).

import type { Load, TruckSettings } from './profit.ts'
import { t, type Locale } from './i18n.ts'
import { normalizeApptTime } from './fmt.ts'

export type LoadStatus = 'quoted' | 'booked' | 'in_transit' | 'delivered' | 'paid' | 'cancelled'

export const STATUSES: LoadStatus[] = [
  'quoted',
  'booked',
  'in_transit',
  'delivered',
  'paid',
  'cancelled',
]

// LoadRecord is a SUPERSET of Load, so calcLoad(record, truck) type-checks with no
// adapter. rate/loadedMiles/deadheadMiles/transitDays stay declared once, in profit.ts.
export type LoadRecord = Load & {
  id: number
  truckId: number | null
  status: LoadStatus
  origin: string | null
  destination: string | null
  truckLocation: string | null
  spotRpm: number | null
  brokerMc: string | null
  brokerEmail: string | null
  brokerPhone: string | null
  brokerNotes: string | null
  notesReadAt: string | null
  referenceId: string | null
  pickupDate: string | null
  deliveryDate: string | null
  pickupTime: string | null
  deliveryTime: string | null
  pickupAddress: string | null
  deliveryAddress: string | null
  source: 'manual' | 'qr'
  createdAt: string
  invoiceNumber: string | null
  invoicedAt: string | null
  paidAt: string | null
  paymentTermsDays: number
  /** Which app user created this load — auto-set, null for loads predating this. */
  dispatcherId: number | null
  /** 'default' = the real fleet, 'demo' = the public sandbox (lib/demo.ts) — carried
   * along so anything holding a LoadRecord (e.g. buildInvoicePacket) can stamp the
   * same scope on documents it creates, without a second parameter everywhere. */
  companyId: 'default' | 'demo'
  /** Pre-rendered "Driver Information" text (lib/ratecon.ts formatDriverInfo) — set
   * once when the load is sourced from a rate con, null for manual entries. */
  driverInfo: string | null
}

export type TruckRecord = TruckSettings & {
  id: number
  name: string
  number: string | null
  driverName: string | null
  /** Manual flag: null = active, 'repair' = в ремонте, 'vacation' = отпуск. */
  unavailable: 'repair' | 'vacation' | null
}

/**
 * The load each truck is running right now — newest booked/in_transit — picked out of
 * a list the caller already has, keyed by truck id.
 *
 * Same rule as the currentLoadForTruck() query in lib/loads.ts, but free. Every fleet
 * page was running that query once PER TRUCK on top of loads it had already fetched
 * (/trucks paid for it twice per truck: the truck's loads AND this). Reach for the
 * query only when a page genuinely holds no load list, e.g. a single truck's page.
 *
 * Recency is compared explicitly rather than trusting the caller to hand over a
 * newest-first list — the callers' orderings are an implementation detail of their
 * own queries, not a contract this helper should silently depend on.
 */
export function currentLoadsByTruck(loads: LoadRecord[]): Map<number, LoadRecord> {
  const out = new Map<number, LoadRecord>()
  for (const l of loads) {
    if (l.truckId === null || (l.status !== 'booked' && l.status !== 'in_transit')) continue
    const held = out.get(l.truckId)
    if (!held || Date.parse(l.createdAt) > Date.parse(held.createdAt)) out.set(l.truckId, l)
  }
  return out
}

/** "425 · Ravil" for the fleet UI — number first, driver second. */
export function truckLabel(t: TruckRecord): string {
  const num = t.number?.trim() || t.name
  const drv = t.driverName?.trim()
  return drv ? `${num} · ${drv}` : num
}

/** ZigZag duty codes → a plain label + a colour bucket. Shared between /tracking
 * and the public /track/[id] link so both read a truck's status the same way.
 *
 * `idleHours`, when given, is the REAL time-in-one-spot from the GPS breadcrumb
 * trail (lib/eld.ts idleSince) — it wins over a self-reported speed. Live Share's
 * "speed" field can get stuck on an old non-zero value while the truck is parked
 * (seen live: "59 mi/h" shown 7 hours after the truck actually stopped), so past a
 * few hours of measured zero movement, trust the trail over the label. */
export function eldStatus(
  s: string | null,
  idleHours: number | null = null,
  locale: Locale = 'ru',
): { text: string; tone: 'move' | 'on' | 'rest' } {
  if (idleHours !== null && idleHours >= 3) {
    return {
      text: `${t(locale, 'tracking.idleNoGpsPrefix')}${idleHours}${t(locale, 'tracking.idleNoGpsSuffix')}`,
      tone: 'rest',
    }
  }
  if (!s) return { text: '—', tone: 'rest' }
  if (/mi\/h/.test(s)) return { text: `${t(locale, 'tracking.movingPrefix')}${s}`, tone: 'move' }
  if (s === 'D') return { text: t(locale, 'tracking.movingText'), tone: 'move' }
  if (s === 'ON') return { text: 'On Duty', tone: 'on' }
  if (s === 'SB') return { text: 'Sleeper', tone: 'rest' }
  if (s === 'OFF') return { text: 'Off Duty', tone: 'rest' }
  return { text: s, tone: 'on' }
}

export type LoadRow = {
  id: number
  truck_id: number | null
  status: string
  rate: number
  loaded_miles: number
  deadhead_miles: number
  transit_days: number
  origin: string | null
  destination: string | null
  truck_location: string | null
  spot_rpm: number | null
  broker_mc: string | null
  broker_email: string | null
  broker_phone: string | null
  broker_notes?: string | null
  notes_read_at?: Date | string | null
  reference_id: string | null
  pickup_date: Date | string | null
  delivery_date?: Date | string | null
  pickup_time?: string | null
  delivery_time?: string | null
  pickup_address?: string | null
  delivery_address?: string | null
  source: string
  created_at: Date | string
  invoice_number?: string | null
  invoiced_at?: Date | string | null
  paid_at?: Date | string | null
  payment_terms_days?: number | null
  dispatcher_id?: number | null
  company_id?: string | null
  driver_info?: string | null
}

export type TruckRow = {
  id: number
  name: string
  number: string | null
  driver_name: string | null
  unavailable?: string | null
  mpg: number
  fuel_price_per_gallon: number
  driver_pay_mode: string
  driver_cents_per_mile: number | null
  driver_percent_of_gross: number | null
  truck_payment_per_day: number
  insurance_per_day: number
  eld_permits_per_day: number
  maintenance_cost_per_mile: number
  factoring_percent: number
  dispatch_percent: number
}

// pg returns DATE/TIMESTAMPTZ as Date objects; the UI wants plain ISO strings.
const isoDate = (v: Date | string | null): string | null =>
  v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : v

export function rowToLoad(r: LoadRow): LoadRecord {
  return {
    id: r.id,
    truckId: r.truck_id,
    status: r.status as LoadStatus,
    rate: r.rate,
    loadedMiles: r.loaded_miles,
    deadheadMiles: r.deadhead_miles,
    transitDays: r.transit_days,
    origin: r.origin,
    destination: r.destination,
    truckLocation: r.truck_location,
    spotRpm: r.spot_rpm,
    brokerMc: r.broker_mc,
    brokerEmail: r.broker_email,
    brokerPhone: r.broker_phone,
    brokerNotes: r.broker_notes ?? null,
    notesReadAt: r.notes_read_at ? new Date(r.notes_read_at).toISOString() : null,
    referenceId: r.reference_id,
    pickupDate: isoDate(r.pickup_date),
    deliveryDate: isoDate(r.delivery_date ?? null),
    // Normalised on read so existing rows with a mashed window still display
    // cleanly, not only freshly-parsed ones.
    pickupTime: normalizeApptTime(r.pickup_time),
    deliveryTime: normalizeApptTime(r.delivery_time),
    pickupAddress: r.pickup_address ?? null,
    deliveryAddress: r.delivery_address ?? null,
    source: r.source as 'manual' | 'qr',
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    invoiceNumber: r.invoice_number ?? null,
    invoicedAt: r.invoiced_at ? new Date(r.invoiced_at).toISOString() : null,
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    paymentTermsDays: r.payment_terms_days ?? 30,
    dispatcherId: r.dispatcher_id ?? null,
    companyId: r.company_id === 'demo' ? 'demo' : 'default',
    driverInfo: r.driver_info ?? null,
  }
}

export function rowToTruck(r: TruckRow): TruckRecord {
  return {
    id: r.id,
    name: r.name,
    number: r.number ?? null,
    driverName: r.driver_name ?? null,
    unavailable: r.unavailable === 'repair' || r.unavailable === 'vacation' ? r.unavailable : null,
    mpg: r.mpg,
    fuelPricePerGallon: r.fuel_price_per_gallon,
    // The branch that matters: pick the wrong arm and every number in the app is
    // wrong but plausible. The DB CHECK guarantees the matching column is non-null.
    driverPay:
      r.driver_pay_mode === 'cpm'
        ? { mode: 'cpm', centsPerMile: r.driver_cents_per_mile! }
        : { mode: 'percent', percentOfGross: r.driver_percent_of_gross! },
    truckPaymentPerDay: r.truck_payment_per_day,
    insurancePerDay: r.insurance_per_day,
    eldPermitsPerDay: r.eld_permits_per_day,
    maintenanceCostPerMile: r.maintenance_cost_per_mile,
    factoringPercent: r.factoring_percent,
    dispatchPercent: r.dispatch_percent,
  }
}
