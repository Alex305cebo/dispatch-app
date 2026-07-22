// The public "Попробовать демо" sandbox: a real login (one shared seeded user, see
// lib/schema.sql) whose trucks/loads/documents all live under company_id='demo' —
// completely isolated from the real fleet (lib/loads.ts filters everything by it).
// SERVER ONLY.

import 'server-only'
import { sql } from './db.ts'
import { getSetting, setSetting } from './settings.ts'
import { createSession } from './auth.ts'

const DEMO_EMAIL = 'demo@dispatch4you.pro'
const RESET_KEY = 'demo_last_reset'
const RESET_AFTER_MS = 24 * 60 * 60 * 1000

// Flat-illustration portraits for the demo drivers. Real photos aren't available to
// seed, and a plain-initials avatar everywhere reads as "empty demo" — a distinct
// generated face per driver makes the sandbox feel like a real, populated fleet.
// Stored as SVG bytes in driver_photo, served by /api/driver-photo like any upload.
const AVATARS = [
  { bg: ['#5b8def', '#2f5fd0'], skin: '#f1c8a0', hair: '#3a2a1c' },
  { bg: ['#ff9a62', '#e35d3b'], skin: '#dca878', hair: '#171310' },
  { bg: ['#45c8a0', '#2a9d78'], skin: '#f4d2b2', hair: '#5c3c20' },
  { bg: ['#b483ff', '#8a4fd0'], skin: '#c99f79', hair: '#2b2b2b' },
]

function avatarSvg(i: number, id: string): string {
  const a = AVATARS[i % AVATARS.length]!
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/>
  </linearGradient></defs>
  <rect width="100" height="100" fill="url(#bg${id})"/>
  <path d="M18 100c0-19 14-31 32-31s32 12 32 31z" fill="${a.skin}"/>
  <circle cx="50" cy="44" r="21" fill="${a.skin}"/>
  <path d="M29 45a21 21 0 0 1 42 0c3-6 1-25-21-25S26 39 29 45z" fill="${a.hair}"/>
  <circle cx="43" cy="45" r="2.4" fill="#2a1e14"/>
  <circle cx="57" cy="45" r="2.4" fill="#2a1e14"/>
  <path d="M45 53q5 4 10 0" fill="none" stroke="#a86f4a" stroke-width="2" stroke-linecap="round"/>
</svg>`
}

async function demoUserId(): Promise<number> {
  const rows = (await sql`SELECT id FROM users WHERE email = ${DEMO_EMAIL}`) as { id: number }[]
  if (rows[0]) return rows[0].id
  // Belt and suspenders — schema.sql already seeds this row, but a DB that hasn't
  // been migrated yet shouldn't leave the demo link dead.
  const created = await sql`
    INSERT INTO users (name, email, password_hash, role, is_demo)
    VALUES ('Демо', ${DEMO_EMAIL}, '', 'dispatcher', TRUE)
    ON CONFLICT (email) DO UPDATE SET is_demo = TRUE
    RETURNING id`
  return (created[0] as { id: number }).id
}

/** Wipe every company_id='demo' row (FK-safe order) and reseed a fresh, varied
 * little fleet — same shape as the real app, entirely made up. */
async function resetDemoData(dispatcherId: number): Promise<void> {
  // Children first — trucks/loads have no ON DELETE CASCADE, so deleting a truck
  // while its maintenance/todos/meta still reference it would just fail the delete.
  await sql`DELETE FROM documents WHERE company_id = 'demo'`
  await sql`DELETE FROM truck_maintenance WHERE truck_id IN (SELECT id FROM trucks WHERE company_id = 'demo')`
  await sql`DELETE FROM truck_todos WHERE truck_id IN (SELECT id FROM trucks WHERE company_id = 'demo')`
  await sql`DELETE FROM truck_meta WHERE truck_id IN (SELECT id FROM trucks WHERE company_id = 'demo')`
  // fleet_status is keyed by unit (TEXT), not truck_id — it survives a truck delete/
  // recreate cycle untouched, so without this a second reset would hit a duplicate
  // primary key on the same "DEMO-101" etc. unit names.
  await sql`DELETE FROM fleet_status WHERE unit LIKE 'DEMO-%'`
  await sql`DELETE FROM loads WHERE company_id = 'demo'`
  await sql`DELETE FROM trucks WHERE company_id = 'demo'`

  const DAY = 86_400_000
  const dateAt = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10)
  // "As printed on the RC" — raw text, not a DB date, same field the AI parser fills.
  const rcTime = (offsetDays: number, hhmm: string, note: string) => {
    const [y, m, d] = dateAt(offsetDays).split('-')
    return `${m}/${d}/${y!.slice(2)} ${hhmm} ${note}`
  }

  // Numbers prefixed "DEMO-" on purpose — they can never collide with a real ELD
  // unit number, so fleet_status stays a demo-only row and never shadows a real
  // truck's live position (lib/maintenance.ts). Full passport + a live-looking GPS
  // fix per truck — this is meant to show off every screen, not just the money math:
  // oil countdown (needs BOTH oilLastOdometer and a current odometer from fleet_status),
  // the compliance-expiry panel (all five dates, spread across expired/soon/fine so
  // every tone shows up), and the map/tracking pin.
  const trucks = [
    {
      number: 'DEMO-101',
      driver: 'Алекс Морган',
      phone: '+1 555-010-1101',
      vin: '1FUJGHDV8CLBP1101',
      plate: 'TX-DEMO1',
      year: 2021,
      make: 'Freightliner',
      model: 'Cascadia',
      oilLastOdometer: 38_000,
      odometer: 60_500, // → 2,500 mi left · warn
      registrationExpiry: dateAt(200),
      inspectionExpiry: dateAt(45), // warn
      insuranceExpiry: dateAt(300),
      cdlExpiry: dateAt(-5), // already expired · demonstrates "просрочено"
      medcardExpiry: dateAt(400),
      driveStatus: 'ON',
      location: '2 mi N from Dallas, TX',
      lat: 32.8,
      lng: -96.79,
    },
    {
      number: 'DEMO-204',
      driver: 'Сэм Ривера',
      phone: '+1 555-020-2204',
      vin: '3AKJHHDR5LSLU2204',
      plate: 'IL-DEMO2',
      year: 2020,
      make: 'Peterbilt',
      model: '579',
      oilLastOdometer: 15_000,
      odometer: 22_000, // → 18,000 mi left · good
      registrationExpiry: dateAt(15), // bad · urgent
      inspectionExpiry: dateAt(250),
      insuranceExpiry: dateAt(50), // warn
      cdlExpiry: dateAt(180),
      medcardExpiry: dateAt(90),
      driveStatus: 'ON',
      location: '5 mi S from Chicago, IL',
      lat: 41.79,
      lng: -87.65,
    },
    {
      number: 'DEMO-317',
      driver: 'Джордан Ли',
      phone: '+1 555-030-3317',
      vin: '1XKYDP9X5MJ317317',
      plate: 'GA-DEMO3',
      year: 2022,
      make: 'Kenworth',
      model: 'T680',
      oilLastOdometer: 52_000,
      odometer: 76_800, // → 200 mi left · bad
      registrationExpiry: dateAt(120),
      inspectionExpiry: dateAt(10), // bad · urgent
      insuranceExpiry: dateAt(220),
      cdlExpiry: dateAt(55), // warn
      medcardExpiry: dateAt(365),
      driveStatus: '58 mi/h',
      location: '45 mi W from Birmingham, AL',
      lat: 33.52,
      lng: -87.5,
    },
    {
      number: 'DEMO-428',
      driver: 'Кейси Брукс',
      phone: '+1 555-040-4428',
      vin: '4V4NC9EJXEN428428',
      plate: 'AZ-DEMO4',
      year: 2019,
      make: 'Volvo',
      model: 'VNL',
      oilLastOdometer: 28_000,
      odometer: 49_500, // → 3,500 mi left · warn
      registrationExpiry: dateAt(90),
      inspectionExpiry: dateAt(170),
      insuranceExpiry: dateAt(28), // bad · urgent
      cdlExpiry: dateAt(100),
      medcardExpiry: dateAt(40), // warn
      driveStatus: 'SB',
      location: '1 mi E from Los Angeles, CA',
      lat: 34.05,
      lng: -118.24,
      unavailable: 'repair',
    },
  ] as const
  const truckIds: number[] = []
  for (const [i, t] of trucks.entries()) {
    const rows = await sql`
      INSERT INTO trucks (name, number, driver_name, mpg, fuel_price_per_gallon,
                          driver_pay_mode, driver_cents_per_mile,
                          truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                          maintenance_cost_per_mile, factoring_percent, dispatch_percent, company_id, unavailable)
      VALUES (${t.number}, ${t.number}, ${t.driver}, 6.5, 3.85, 'cpm', 60, 60, 40, 8, 0.18, 2, 0, 'demo',
              ${'unavailable' in t ? t.unavailable : null})
      RETURNING id`
    const id = (rows[0] as { id: number }).id
    truckIds.push(id)
    const photoHex = Buffer.from(avatarSvg(i, t.number.slice(-3)), 'utf8').toString('hex')
    await sql`
      INSERT INTO truck_meta (truck_id, driver_phone, trailer_number, vin, plate, year, make, model,
                              oil_last_odometer, registration_expiry, inspection_expiry,
                              insurance_expiry, cdl_expiry, medcard_expiry, driver_photo, driver_photo_mime)
      VALUES (${id}, ${t.phone}, ${'TR-' + t.number.slice(-3)}, ${t.vin}, ${t.plate}, ${t.year},
              ${t.make}, ${t.model}, ${t.oilLastOdometer}, ${t.registrationExpiry}, ${t.inspectionExpiry},
              ${t.insuranceExpiry}, ${t.cdlExpiry}, ${t.medcardExpiry},
              decode(${photoHex}, 'hex'), 'image/svg+xml')`
    // fleet_status is normally filled by the ELD poller (lib/eld.ts) — faking one row
    // per demo truck is what makes the map pin, live location and oil countdown (it
    // needs a CURRENT odometer, not just the last-change one) show up at all.
    await sql`
      INSERT INTO fleet_status (unit, driver_name, drive_status, location, lat, lng, odometer, updated_at)
      VALUES (${t.number}, ${t.driver}, ${t.driveStatus}, ${t.location}, ${t.lat}, ${t.lng}, ${t.odometer}, now())`
  }
  const [t1, t2, t3, t4] = truckIds as [number, number, number, number]

  // One load per stage of the pipeline — quoted → booked → in_transit → delivered
  // (unpaid, so "Собрать инвойс" has something real to do) → paid. Each one carries
  // full broker paperwork (MC/contact, ref numbers, market rate, pickup/delivery
  // windows, and a tagged "Важное от брокера" block) — this is a showcase, not just
  // a stats screen, so it needs to look like a real rate con came in.
  const loads = [
    {
      truckId: t1,
      status: 'quoted',
      rate: 2400,
      spotRpm: 3.1, // above rate/mi — flagged as below-market on purpose
      milesL: 780,
      milesD: 40,
      origin: 'Dallas, TX',
      destination: 'Denver, CO',
      mc: '123456',
      broker: 'Apex Freight Brokers',
      phone: '(555) 010-0142',
      refId: 'DAL-88213',
      pickup: dateAt(3),
      delivery: dateAt(5),
      pickupTime: rcTime(3, '08:00', 'FCFS'),
      deliveryTime: rcTime(5, '14:00', 'Appt'),
      notes:
        '[SAFETY] Средства защиты обязательны на площадке — каска и жилет.\n' +
        '[LOAD] Твёрдая палета, не превышать 44,000 lbs, задняя загрузка.\n' +
        '[REF] PO# 88213-DAL, BOL# 55210\n' +
        '[CONTACT] Диспетчер площадки: Мария, (555) 010-0142',
      unread: true,
    },
    {
      truckId: t2,
      status: 'booked',
      rate: 3050,
      spotRpm: 2.95,
      milesL: 960,
      milesD: 0,
      origin: 'Chicago, IL',
      destination: 'Dallas, TX',
      mc: '654321',
      broker: 'Summit Logistics Group',
      phone: '(555) 020-4471',
      refId: 'CHI-4471',
      pickup: dateAt(1),
      delivery: dateAt(3),
      pickupTime: rcTime(1, '06:30', 'FCFS'),
      deliveryTime: rcTime(3, '10:00', 'Appt'),
      notes:
        '[SCHEDULE] Appointment строго FCFS, окно 08:00–10:00, не опаздывать.\n' +
        '[DOCS] Rate con и BOL обязательны при выгрузке — без них груз не принимают.\n' +
        '[REF] Load# CHI-4471, Ref# 90042',
      unread: true,
    },
    {
      truckId: t3,
      status: 'in_transit',
      rate: 2150,
      spotRpm: 3.2,
      milesL: 610,
      milesD: 25,
      origin: 'Atlanta, GA',
      destination: 'Phoenix, AZ',
      mc: '789012',
      broker: 'TransWest Brokerage',
      phone: '(555) 030-2290',
      refId: 'ATL-2290',
      pickup: dateAt(-1),
      delivery: dateAt(1),
      pickupTime: rcTime(-1, '07:00', 'FCFS'),
      deliveryTime: rcTime(1, '16:00', 'Appt'),
      notes:
        '[PENALTY] Детеншн $75/час после 2 часов простоя, лампер оплачивает водитель, компенсация по чеку.\n' +
        '[WARNING] TWIC-карта обязательна для входа на территорию порта.\n' +
        '[REF] Order# ATL-2290',
      unread: true,
    },
    {
      truckId: t4,
      status: 'delivered',
      rate: 1980,
      spotRpm: 3.75,
      milesL: 540,
      milesD: 10,
      origin: 'Phoenix, AZ',
      destination: 'Los Angeles, CA',
      mc: '210987',
      broker: 'BlueLine Freight',
      phone: '(555) 010-0199',
      refId: 'PHX-5561',
      pickup: dateAt(-3),
      delivery: dateAt(-1),
      pickupTime: rcTime(-3, '09:00', 'FCFS'),
      deliveryTime: rcTime(-1, '13:00', 'Appt'),
      notes:
        '[INSURANCE] Требуется Certificate of Insurance с limits $1,000,000, отправить брокеру до пикапа.\n' +
        '[DOCS] POD обязателен в течение 24 часов после выгрузки.\n' +
        '[CONTACT] Broker after-hours: (555) 010-0199',
      unread: false,
    },
    {
      truckId: t1,
      status: 'paid',
      rate: 2600,
      spotRpm: 3.3,
      milesL: 700,
      milesD: 15,
      origin: 'Denver, CO',
      destination: 'Kansas City, MO',
      mc: '345678',
      broker: 'Prairie Route Logistics',
      phone: '(555) 040-1187',
      refId: 'DEN-1187',
      pickup: dateAt(-13),
      delivery: dateAt(-11),
      pickupTime: rcTime(-13, '07:00', 'FCFS'),
      deliveryTime: rcTime(-11, '15:00', 'No live unload'),
      notes: '[SCHEDULE] Pickup FCFS 07:00–15:00, no live unload.\n[REF] PO# DEN-1187',
      unread: false,
      paid: true,
    },
  ] as const

  for (const l of loads) {
    const paid = 'paid' in l && l.paid
    const invoicedAt = paid ? new Date(Date.now() - 10 * DAY).toISOString() : null
    const paidAt = paid ? new Date(Date.now() - 3 * DAY).toISOString() : null
    const brokerEmail = `ops@${l.broker.toLowerCase().replace(/[^a-z]+/g, '')}-demo.com`
    const notesReadAt = l.unread ? null : new Date(Date.now() - 2 * DAY).toISOString()
    await sql`
      INSERT INTO loads (rate, spot_rpm, loaded_miles, deadhead_miles, transit_days, origin, destination,
                         broker_mc, broker_email, broker_phone, reference_id, broker_notes, notes_read_at,
                         pickup_date, delivery_date, pickup_time, delivery_time,
                         source, truck_id, status, dispatcher_id, company_id, invoiced_at, paid_at)
      VALUES (${l.rate}, ${l.spotRpm}, ${l.milesL}, ${l.milesD}, 2, ${l.origin}, ${l.destination},
              ${l.mc}, ${brokerEmail}, ${l.phone}, ${l.refId}, ${l.notes}, ${notesReadAt},
              ${l.pickup}, ${l.delivery}, ${l.pickupTime}, ${l.deliveryTime},
              'manual', ${l.truckId}, ${l.status}, ${dispatcherId}, 'demo', ${invoicedAt}, ${paidAt})`
  }

  await setSetting(RESET_KEY, new Date().toISOString())
}

async function demoDataIsStale(): Promise<boolean> {
  const last = await getSetting(RESET_KEY)
  return !last || Date.now() - new Date(last).getTime() > RESET_AFTER_MS
}

/**
 * Entry point for the public "Попробовать демо" link (app/demo/route.ts). Refreshes
 * the sandbox if it's gone stale (>24h since the last visitor's reset — nightly in
 * spirit, without needing an external cron), then returns a session token for the
 * shared demo account. The route sets it as a cookie ON the redirect response — not
 * via next/headers here — so it reliably attaches behind the reverse proxy. Every
 * dispatcher who clicks the link sees the same fleet.
 */
export async function startDemoSession(): Promise<string> {
  const userId = await demoUserId()
  if (await demoDataIsStale()) await resetDemoData(userId)
  return createSession(userId)
}
