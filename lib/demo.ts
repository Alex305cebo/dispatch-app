// The public "Попробовать демо" sandbox: a real login (one shared seeded user, see
// lib/schema.sql) whose trucks/loads/documents all live under company_id='demo' —
// completely isolated from the real fleet (lib/loads.ts filters everything by it).
// SERVER ONLY.

import 'server-only'
import { sql } from './db.ts'
import { deleteSetting, setSetting } from './settings.ts'
import { createSession } from './auth.ts'
import { DEMO_AVATARS_JPEG_BASE64 } from './demo-avatars.ts'
import { DEMO_DOC_PDF_BASE64 } from './demo-docs.ts'
import type { Locale } from './i18n.ts'

// Neutral by design: the app is installed per customer, and their database should not
// carry our domain in a user row. Never receives mail and can never be logged into —
// password_hash stays empty, which verifyPassword always rejects.
const DEMO_EMAIL = 'demo@demo.local'
const RESET_KEY = 'demo_last_reset'
const RESET_AFTER_MS = 24 * 60 * 60 * 1000

async function demoUserId(): Promise<number> {
  const rows = (await sql`SELECT id FROM users WHERE email = ${DEMO_EMAIL}`) as { id: number }[]
  if (rows[0]) return rows[0].id
  // This is now the ONLY place the demo account is created — schema.sql no longer
  // seeds it, so a customer's database stays free of it until someone opens /demo.
  const created = await sql`
    INSERT INTO users (name, email, password_hash, role, is_demo)
    VALUES ('Demo', ${DEMO_EMAIL}, '', 'dispatcher', TRUE)
    ON CONFLICT (email) DO UPDATE SET is_demo = TRUE
    RETURNING id`
  return (created[0] as { id: number }).id
}

/** One small, realistic-looking PDF per document kind (lib/demo-docs.ts) — attached
 * to a truck, a load, or a maintenance entry, same shape as a real upload. */
async function attachDoc(
  kind: keyof typeof DEMO_DOC_PDF_BASE64,
  title: string,
  opts: { truckId?: number | null; loadId?: number | null; maintenanceId?: number | null; uploadedAt?: string },
): Promise<void> {
  const bytes = Buffer.from(DEMO_DOC_PDF_BASE64[kind], 'base64')
  const hex = bytes.toString('hex')
  await sql`
    INSERT INTO documents (truck_id, load_id, maintenance_id, kind, title, mime, size_bytes, data, company_id, uploaded_at)
    VALUES (${opts.truckId ?? null}, ${opts.loadId ?? null}, ${opts.maintenanceId ?? null}, ${kind}, ${title},
            'application/pdf', ${bytes.length}, decode(${hex}, 'hex'), 'demo', ${opts.uploadedAt ?? new Date().toISOString()})`
}

/** Wipe every company_id='demo' row (FK-safe order) and reseed a fresh, varied
 * little fleet — same shape as the real app, entirely made up.
 *
 * Driver names are Latin in BOTH locales. They used to come in EN/RU pairs picked by
 * whichever language triggered the reset, which produced "Алекс Морган" for an English
 * visitor and never changed when the language was switched — the name is a plain string
 * in trucks.driver_name, so it cannot follow the UI language, and translating stored
 * data on the fly would be wrong anyway. The drivers are American; Latin reads correctly
 * either way. */
async function resetDemoData(dispatcherId: number, locale: Locale): Promise<void> {
  // Children first — trucks/loads have no ON DELETE CASCADE, so deleting a truck
  // while its maintenance/todos/meta/documents still reference it would just fail.
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
  const isoAt = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()
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
  // every tone shows up), and the map/tracking pin. Eight trucks, not four — a small
  // real fleet, with a couple flagged repair/vacation so those states show up too.
  const trucks = [
    {
      number: 'DEMO-101',
      driverEn: 'Alex Morgan',
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
      cdlExpiry: dateAt(-5), // already expired · demonstrates "overdue"
      medcardExpiry: dateAt(400),
      driveStatus: 'ON',
      fuel: 64,
      bearing: 0,
      location: '2 mi N from Dallas, TX',
      lat: 32.8,
      lng: -96.79,
    },
    {
      number: 'DEMO-204',
      driverEn: 'Sam Rivera',
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
      fuel: 28,
      bearing: 115,
      location: '5 mi S from Chicago, IL',
      lat: 41.79,
      lng: -87.65,
    },
    {
      number: 'DEMO-317',
      driverEn: 'Jordan Lee',
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
      fuel: 81,
      bearing: 262,
      location: '45 mi W from Birmingham, AL',
      lat: 33.52,
      lng: -87.5,
    },
    {
      number: 'DEMO-428',
      driverEn: 'Casey Brooks',
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
      fuel: 12,
      bearing: 180,
      location: '1 mi E from Los Angeles, CA',
      lat: 34.05,
      lng: -118.24,
      unavailable: 'repair',
    },
    {
      number: 'DEMO-512',
      driverEn: 'Morgan Taylor',
      phone: '+1 555-050-5512',
      vin: '3AKJHHDR8PSN90512',
      plate: 'TX-DEMO5',
      year: 2023,
      make: 'Freightliner',
      model: 'Cascadia',
      oilLastOdometer: 8_000,
      odometer: 14_200, // → 18,800 mi left · good
      registrationExpiry: dateAt(250),
      inspectionExpiry: dateAt(180),
      insuranceExpiry: dateAt(150),
      cdlExpiry: dateAt(280),
      medcardExpiry: dateAt(320), // fully healthy truck — not every card needs a flag
      driveStatus: 'D',
      fuel: 47,
      bearing: 44,
      location: '10 mi S from Houston, TX',
      lat: 29.76,
      lng: -95.37,
    },
    {
      number: 'DEMO-633',
      driverEn: 'Riley Bennett',
      phone: '+1 555-060-6633',
      vin: '1XPBD49X9JD633633',
      plate: 'TN-DEMO6',
      year: 2018,
      make: 'Peterbilt',
      model: '389',
      oilLastOdometer: 61_000,
      odometer: 87_500, // → oil overdue · bad
      registrationExpiry: dateAt(60),
      inspectionExpiry: dateAt(300),
      insuranceExpiry: dateAt(180),
      cdlExpiry: dateAt(20), // warn
      medcardExpiry: dateAt(250),
      driveStatus: 'OFF',
      fuel: 93,
      bearing: 330,
      location: '3 mi N from Nashville, TN',
      lat: 36.16,
      lng: -86.78,
    },
    {
      number: 'DEMO-745',
      driverEn: 'Drew Sullivan',
      phone: '+1 555-070-7745',
      vin: '3HSDJAPR8NN745745',
      plate: 'NC-DEMO7',
      year: 2022,
      make: 'International',
      model: 'LT',
      oilLastOdometer: 30_000,
      odometer: 41_000, // → 14,000 mi left · good
      registrationExpiry: dateAt(5), // bad · urgent
      inspectionExpiry: dateAt(90),
      insuranceExpiry: dateAt(365),
      cdlExpiry: dateAt(200),
      medcardExpiry: dateAt(60), // warn
      driveStatus: '52 mi/h',
      fuel: 35,
      bearing: 88,
      location: '20 mi E from Charlotte, NC',
      lat: 35.23,
      lng: -80.84,
    },
    {
      number: 'DEMO-860',
      driverEn: 'Quinn Parker',
      phone: '+1 555-080-8860',
      vin: '1M1AW07Y9LM860860',
      plate: 'FL-DEMO8',
      year: 2020,
      make: 'Mack',
      model: 'Anthem',
      oilLastOdometer: 45_000,
      odometer: 68_000, // → 2,000 mi left · warn
      registrationExpiry: dateAt(400),
      inspectionExpiry: dateAt(400),
      insuranceExpiry: dateAt(400),
      cdlExpiry: dateAt(400),
      medcardExpiry: dateAt(15), // bad · urgent
      driveStatus: 'ON',
      fuel: 58,
      bearing: 205,
      location: '8 mi W from Miami, FL',
      lat: 25.76,
      lng: -80.19,
      unavailable: 'vacation',
    },
  ] as const

  const truckIds: number[] = []
  for (const [i, t] of trucks.entries()) {
    // Имя водителя латиницей в обеих локалях. Оно живёт в trucks.driver_name как
    // обычная строка, поэтому при переключении языка сайта не менялось бы в любом
    // случае — а посев зависел от того, на каком языке зашли ПЕРВЫМ. Отсюда
    // «Алекс Морган» у англоязычного посетителя. Водители американские.
    const driver = t.driverEn
    const rows = await sql`
      INSERT INTO trucks (name, number, driver_name, mpg, fuel_price_per_gallon,
                          driver_pay_mode, driver_cents_per_mile,
                          truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                          maintenance_cost_per_mile, factoring_percent, dispatch_percent, company_id, unavailable)
      VALUES (${t.number}, ${t.number}, ${driver}, 6.5, 3.85, 'cpm', 60, 60, 40, 8, 0.18, 2, 0, 'demo',
              ${'unavailable' in t ? t.unavailable : null})
      RETURNING id`
    const id = (rows[0] as { id: number }).id
    truckIds.push(id)
    const photoHex = Buffer.from(
      DEMO_AVATARS_JPEG_BASE64[i % DEMO_AVATARS_JPEG_BASE64.length]!,
      'base64',
    ).toString('hex')
    await sql`
      INSERT INTO truck_meta (truck_id, driver_phone, trailer_number, vin, plate, year, make, model,
                              oil_last_odometer, registration_expiry, inspection_expiry,
                              insurance_expiry, cdl_expiry, medcard_expiry, driver_photo, driver_photo_mime)
      VALUES (${id}, ${t.phone}, ${'TR-' + t.number.slice(-3)}, ${t.vin}, ${t.plate}, ${t.year},
              ${t.make}, ${t.model}, ${t.oilLastOdometer}, ${t.registrationExpiry}, ${t.inspectionExpiry},
              ${t.insuranceExpiry}, ${t.cdlExpiry}, ${t.medcardExpiry},
              decode(${photoHex}, 'hex'), 'image/jpeg')`
    // fleet_status is normally filled by the ELD poller (lib/eld.ts) — faking one row
    // per demo truck is what makes the map pin, live location and oil countdown (it
    // needs a CURRENT odometer, not just the last-change one) show up at all.
    await sql`
      INSERT INTO fleet_status
        (unit, driver_name, drive_status, location, lat, lng, odometer, fuel, bearing, updated_at)
      VALUES (${t.number}, ${driver}, ${t.driveStatus}, ${t.location}, ${t.lat}, ${t.lng},
              ${t.odometer}, ${t.fuel}, ${t.bearing}, now())`
    // Passport documents every real truck carries — insurance certificate and
    // registration copy, filed under the truck itself (not tied to any one load).
    await attachDoc('insurance', 'Certificate of Insurance.pdf', { truckId: id, uploadedAt: isoAt(-60) })
    await attachDoc('registration', 'Vehicle Registration.pdf', { truckId: id, uploadedAt: isoAt(-90) })
  }
  const [t1, t2, t3, t4, t5] = truckIds as [number, number, number, number, number, ...number[]]

  // The one truck flagged "repair" also gets a maintenance-log entry with its own
  // linked receipt — same as a real repair logged from the Truck Care tab.
  const repairTruckIdx = trucks.findIndex((t) => 'unavailable' in t && t.unavailable === 'repair')
  if (repairTruckIdx >= 0) {
    const repairTruckId = truckIds[repairTruckIdx]!
    const maintRows = await sql`
      INSERT INTO truck_maintenance (truck_id, kind, title, notes, cost, odometer, done_at)
      VALUES (${repairTruckId}, 'repair', 'Brake system repair',
              'Replaced worn brake pads and resurfaced rotors, front axle.', 1130,
              ${trucks[repairTruckIdx]!.odometer}, ${dateAt(-2)})
      RETURNING id`
    const maintId = (maintRows[0] as { id: number }).id
    await attachDoc('repair', 'Brake Repair Receipt.pdf', {
      truckId: repairTruckId,
      maintenanceId: maintId,
      uploadedAt: isoAt(-2),
    })
  }

  // One load per stage of the pipeline — quoted → booked → in_transit → delivered
  // (unpaid, so "Build invoice" has something real to do) → paid. Each one carries
  // full broker paperwork (MC/contact, ref numbers, market rate, pickup/delivery
  // windows, and a tagged "Important from broker" block) — this is a showcase, not
  // just a stats screen, so it needs to look like a real rate con came in. Spread
  // across five different trucks, not just one repeated.
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
        '[SAFETY] PPE required on site — hard hat and vest.\n' +
        '[LOAD] Hard pallet, do not exceed 44,000 lbs, rear load.\n' +
        '[PENALTY] Detention $65/hr after 2 hours free time, billed in 30-min increments.\n' +
        '[REF] PO# 88213-DAL, BOL# 55210\n' +
        '[CONTACT] Yard dispatcher: Maria, (555) 010-0142',
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
        '[SCHEDULE] Appointment strictly FCFS, window 08:00–10:00, do not be late.\n' +
        '[DOCS] Rate con and BOL required at delivery — load will not be accepted without them.\n' +
        '[PENALTY] TONU $250 if load is cancelled after dispatch confirmation.\n' +
        '[INSURANCE] Certificate of Insurance on file, limits $1,000,000 auto / $100,000 cargo.\n' +
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
        '[PENALTY] Detention $75/hr after 2 hours free time, driver pays lumper up to $125, reimbursed by receipt.\n' +
        '[WARNING] TWIC card required for port access.\n' +
        '[SCHEDULE] Delivery appointment 14:00–16:00, call 1 hour ahead.\n' +
        '[DOCS] POD required within 24 hours of delivery, no exceptions.\n' +
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
        '[INSURANCE] Certificate of Insurance required, limits $1,000,000, send to broker before pickup.\n' +
        '[DOCS] POD required within 24 hours of delivery.\n' +
        '[PENALTY] Detention $60/hr after 2 hours free time at both stops.\n' +
        '[LOAD] Do not exceed 43,500 lbs, no double-stacking.\n' +
        '[CONTACT] Broker after-hours: (555) 010-0199',
      unread: false,
    },
    {
      truckId: t5,
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
      notes:
        '[SCHEDULE] Pickup FCFS 07:00–15:00, no live unload.\n' +
        '[PENALTY] Detention $70/hr after 2 hours free time, TONU $300 if cancelled after dispatch.\n' +
        '[DOCS] Signed rate con required before dispatch; POD due within 24 hours.\n' +
        '[INSURANCE] Certificate of Insurance on file, limits $1,000,000.\n' +
        '[REF] PO# DEN-1187, BOL# 41187',
      unread: false,
      paid: true,
    },
  ] as const

  for (const l of loads) {
    const paid = 'paid' in l && l.paid
    const invoicedAt = paid ? isoAt(-10) : null
    const paidAt = paid ? isoAt(-3) : null
    const brokerEmail = `ops@${l.broker.toLowerCase().replace(/[^a-z]+/g, '')}-demo.com`
    const notesReadAt = l.unread ? null : isoAt(-2)
    const rows = await sql`
      INSERT INTO loads (rate, spot_rpm, loaded_miles, deadhead_miles, transit_days, origin, destination,
                         broker_mc, broker_email, broker_phone, reference_id, broker_notes, notes_read_at,
                         pickup_date, delivery_date, pickup_time, delivery_time,
                         source, truck_id, status, dispatcher_id, company_id, invoiced_at, paid_at)
      VALUES (${l.rate}, ${l.spotRpm}, ${l.milesL}, ${l.milesD}, 2, ${l.origin}, ${l.destination},
              ${l.mc}, ${brokerEmail}, ${l.phone}, ${l.refId}, ${l.notes}, ${notesReadAt},
              ${l.pickup}, ${l.delivery}, ${l.pickupTime}, ${l.deliveryTime},
              'manual', ${l.truckId}, ${l.status}, ${dispatcherId}, 'demo', ${invoicedAt}, ${paidAt})
      RETURNING id`
    const loadId = (rows[0] as { id: number }).id
    await attachDoc('ratecon', `Rate Confirmation — ${l.refId}.pdf`, { loadId, uploadedAt: isoAt(-14) })
    if (l.status === 'delivered' || l.status === 'paid') {
      await attachDoc('pod', `POD — ${l.refId}.pdf`, { loadId, uploadedAt: isoAt(-1) })
    }
    if (paid) {
      await attachDoc('invoice', `Invoice — ${l.refId}.pdf`, { loadId, uploadedAt: isoAt(-9) })
    }
  }

  // Load HISTORY — three older, already-paid loads per truck, spread across the
  // past two to ten weeks, so the weekly settlement reports (Финансы → По
  // диспетчерам/Водители), the loads calendar, and the Обзор "recent loads" list
  // all have real depth instead of a five-load snapshot.
  const ROUTE_POOL: readonly (readonly [string, string, number, number])[] = [
    ['Dallas, TX', 'Denver, CO', 780, 40],
    ['Chicago, IL', 'Dallas, TX', 960, 0],
    ['Atlanta, GA', 'Phoenix, AZ', 610, 25],
    ['Phoenix, AZ', 'Los Angeles, CA', 540, 10],
    ['Houston, TX', 'Memphis, TN', 570, 15],
    ['Nashville, TN', 'Charlotte, NC', 330, 20],
    ['Charlotte, NC', 'Miami, FL', 650, 30],
    ['Miami, FL', 'Atlanta, GA', 660, 5],
    ['Denver, CO', 'Kansas City, MO', 600, 15],
    ['Kansas City, MO', 'Chicago, IL', 510, 10],
    ['Los Angeles, CA', 'Phoenix, AZ', 370, 20],
    ['Memphis, TN', 'Nashville, TN', 210, 10],
  ]
  const BROKER_POOL = [
    { mc: '112233', name: 'Prairie Route Logistics', phone: '(555) 040-1187' },
    { mc: '223344', name: 'Summit Logistics Group', phone: '(555) 020-4471' },
    { mc: '334455', name: 'TransWest Brokerage', phone: '(555) 030-2290' },
    { mc: '445566', name: 'BlueLine Freight', phone: '(555) 010-0199' },
    { mc: '556677', name: 'Apex Freight Brokers', phone: '(555) 010-0142' },
    { mc: '667788', name: 'Cardinal Transport Solutions', phone: '(555) 050-3321' },
    { mc: '778899', name: 'Lonestar Freight Partners', phone: '(555) 060-4432' },
  ] as const
  const WEEKS_BACK = [2, 4, 7] // how far back each of the 3 historical loads lands

  // Same "all the broker figures" richness as the five showcase loads above, just
  // generated instead of hand-written — real detention/TONU/lumper dollar amounts,
  // appointment windows, weight caps and a named yard contact, rotating through a
  // handful of profiles so the 24 historical loads don't all read identically.
  const CONTACTS = ['Maria', 'James', 'Priya', 'Diego', 'Emma', 'Noah', 'Layla', 'Owen'] as const
  function historicalNotes(refId: string, idx: number): string {
    const detentionRate = 50 + (idx % 4) * 15 // $50–$95/hr
    const freeHours = 2 + (idx % 3) // 2–4 hrs
    const tonu = 150 + (idx % 5) * 50 // $150–$350
    const lumper = 75 + (idx % 4) * 25 // $75–$150
    const insuranceLimit = idx % 2 === 0 ? '1,000,000' : '2,000,000'
    const apptWindow = idx % 3 === 0 ? '07:00–09:00' : idx % 3 === 1 ? '08:00–10:00' : '06:00–08:00'
    const weightCap = (42_000 + (idx % 4) * 1_000).toLocaleString('en-US')
    const contact = CONTACTS[idx % CONTACTS.length]
    const contactPhone = `(555) 0${(idx % 9) + 10}-${1000 + idx * 7}`

    const PROFILES = [
      [
        `[PENALTY] Detention $${detentionRate}/hr after ${freeHours} hours free time, TONU $${tonu} if load is cancelled after dispatch.`,
        `[SCHEDULE] Appointment window ${apptWindow}, FCFS — no exceptions.`,
        `[DOCS] Rate con and BOL required at delivery; POD due within 24 hours.`,
        `[REF] PO# ${refId}, Load# ${refId}-L`,
      ],
      [
        `[LOAD] Do not exceed ${weightCap} lbs, hard pallet, no double-stacking.`,
        `[INSURANCE] Certificate of Insurance required, limits $${insuranceLimit}, on file before pickup.`,
        `[CONTACT] Yard dispatcher: ${contact}, ${contactPhone}.`,
        `[REF] PO# ${refId}`,
      ],
      [
        `[PENALTY] Lumper fee up to $${lumper}, driver pays and submits receipt for reimbursement.`,
        `[SAFETY] Hard hat and hi-vis vest required on site at all times.`,
        `[WARNING] Scale ticket required at pickup — do not leave without it.`,
        `[REF] Order# ${refId}`,
      ],
      [
        `[SCHEDULE] Strict appointment ${apptWindow}, no live unload — drop and hook only.`,
        `[PENALTY] Detention $${detentionRate}/hr after ${freeHours} hrs, billed in 30-min increments.`,
        `[DOCS] Signed rate con required before dispatch; POD required within 24 hrs of delivery.`,
        `[REF] PO# ${refId}, BOL# ${refId}-B`,
      ],
    ]
    return PROFILES[idx % PROFILES.length]!.join('\n')
  }

  for (const [i, truckId] of truckIds.entries()) {
    for (const [j, weeks] of WEEKS_BACK.entries()) {
      const route = ROUTE_POOL[(i * 3 + j) % ROUTE_POOL.length]!
      const broker = BROKER_POOL[(i + j) % BROKER_POOL.length]!
      const [origin, destination, milesL, milesD] = route
      const idx = i * 3 + j
      const deliverOffset = -(weeks * 7) - (i % 3) // stagger within the week per truck
      const pickupOffset = deliverOffset - 2
      const refId = `${origin.slice(0, 3).toUpperCase()}-${9000 + i * 10 + j}`
      const brokerEmail = `ops@${broker.name.toLowerCase().replace(/[^a-z]+/g, '')}-demo.com`
      const notes = historicalNotes(refId, idx)

      // Every historical load used to be identical in the ways that matter to the
      // dashboards: paid, invoiced, no rate con. The "needs attention" panel therefore
      // listed thirty-nine loads and printed the SAME chip on every one of them — a
      // section that demonstrates one state repeated is worse than no demo at all.
      //
      // So the sandbox now spreads across the four states it can actually be in. One
      // load in eight of each problem kind, the rest clean, which is also roughly what
      // a real fleet looks like: mostly fine, a few things to chase.
      const flaw = idx % 8
      const lateNoInvoice = flaw === 0 // delivered, invoice never raised
      const overdue = flaw === 1 // invoiced weeks ago, still unpaid
      const underwater = flaw === 2 // hauled below cost — the one nobody can fix later
      const noRateCon = flaw === 3 // paperwork missing on an otherwise fine load
      // 1.05/mi is under this fleet's own cost per mile (lib/profit.ts), so calcLoad
      // returns a negative net — the flag is earned by the arithmetic, not hardcoded.
      const rpm = underwater ? 1.05 : 2.6 + ((i + j) % 5) * 0.22
      const rate = Math.round(milesL * rpm)
      const status = lateNoInvoice || overdue ? 'delivered' : 'paid'
      // Delivered weeks ago against 30-day terms, so it reads as genuinely overdue
      // rather than merely unpaid.
      const invoicedAt = lateNoInvoice ? null : isoAt(deliverOffset + 1)
      const paidAt = lateNoInvoice || overdue ? null : isoAt(deliverOffset + 8)

      const rows = await sql`
        INSERT INTO loads (rate, spot_rpm, loaded_miles, deadhead_miles, transit_days, origin, destination,
                           broker_mc, broker_email, broker_phone, reference_id, broker_notes, notes_read_at,
                           pickup_date, delivery_date, pickup_time, delivery_time,
                           source, truck_id, status, dispatcher_id, company_id, invoiced_at, paid_at)
        VALUES (${rate}, ${Math.round((rpm - 0.15) * 100) / 100}, ${milesL}, ${milesD}, 2, ${origin}, ${destination},
                ${broker.mc}, ${brokerEmail}, ${broker.phone}, ${refId}, ${notes}, ${isoAt(deliverOffset)},
                ${dateAt(pickupOffset)}, ${dateAt(deliverOffset)}, ${rcTime(pickupOffset, '08:00', 'FCFS')},
                ${rcTime(deliverOffset, '14:00', 'Appt')},
                'manual', ${truckId}, ${status}, ${dispatcherId}, 'demo',
                ${invoicedAt}, ${paidAt})
        RETURNING id`
      const loadId = (rows[0] as { id: number }).id
      // A real paid load has its rate con on file — attaching it is what makes the
      // missing one mean something when it shows up.
      if (!noRateCon) {
        await attachDoc('ratecon', `Rate Confirmation — ${refId}.pdf`, { loadId, uploadedAt: isoAt(pickupOffset - 1) })
      }
      await attachDoc('pod', `POD — ${refId}.pdf`, { loadId, uploadedAt: isoAt(deliverOffset + 1) })
      if (invoicedAt) {
        await attachDoc('invoice', `Invoice — ${refId}.pdf`, { loadId, uploadedAt: invoicedAt })
      }
    }
  }

  // Recent activity for the utilisation heatmap. The showcase loads sit near today and
  // the historical ones are 2+ weeks back, leaving the last-14-days window — exactly
  // what the heatmap covers — nearly empty. This fills it with a DELIBERATELY VARIED
  // spread so the section shows what it's for: some trucks run hard, some have gaps,
  // one sits idle. Per truck: a list of [daysAgoStart, spanDays] short hauls, fully in
  // the past (delivery never in the future) so they read as completed work.
  const UTIL_PATTERN: readonly (readonly [number, number][])[] = [
    [[13, 3], [8, 3], [3, 2]], // busy
    [[12, 2], [6, 4]], // medium
    [[11, 4], [4, 3]], // busy
    [[13, 2], [7, 2], [2, 2]], // medium
    [[10, 3]], // light
    [[13, 5], [5, 4]], // busy
    [], // idle — the whole point: a truck nobody is loading
    [[3, 2]], // mostly idle
  ]
  let utilRef = 0
  for (let ti = 0; ti < truckIds.length; ti++) {
    const truckId = truckIds[ti]!
    for (const [daysAgo, span] of UTIL_PATTERN[ti] ?? []) {
      const [origin, destination, milesL, milesD] = ROUTE_POOL[utilRef % ROUTE_POOL.length]!
      const broker = BROKER_POOL[utilRef % BROKER_POOL.length]!
      const pickupOffset = -daysAgo
      const deliverOffset = -daysAgo + (span - 1)
      const rate = 1800 + (utilRef % 6) * 220
      const refId = `${origin.slice(0, 3).toUpperCase()}-${7000 + utilRef * 3}`
      const brokerEmail = `ops@${broker.name.toLowerCase().replace(/[^a-z]+/g, '')}-demo.com`
      const rows = await sql`
        INSERT INTO loads (rate, spot_rpm, loaded_miles, deadhead_miles, transit_days, origin, destination,
                           broker_mc, broker_email, broker_phone, reference_id,
                           pickup_date, delivery_date, pickup_time, delivery_time,
                           source, truck_id, status, dispatcher_id, company_id, invoiced_at, paid_at)
        VALUES (${rate}, 2.2, ${milesL}, ${milesD}, ${span}, ${origin}, ${destination},
                ${broker.mc}, ${brokerEmail}, ${broker.phone}, ${refId},
                ${dateAt(pickupOffset)}, ${dateAt(deliverOffset)},
                ${rcTime(pickupOffset, '08:00', 'FCFS')}, ${rcTime(deliverOffset, '14:00', 'Appt')},
                'manual', ${truckId}, 'paid', ${dispatcherId}, 'demo',
                ${isoAt(deliverOffset + 1)}, ${isoAt(deliverOffset + 3)})
        RETURNING id`
      // Paperwork on these too. Without it every filler load reported a missing rate
      // con, and the fifteen of them alone were enough to drown the panel in one
      // repeated chip — the exact thing this pass exists to stop.
      await attachDoc('ratecon', `Rate Confirmation — ${refId}.pdf`, {
        loadId: (rows[0] as { id: number }).id,
        uploadedAt: isoAt(pickupOffset - 1),
      })
      utilRef++
    }
  }

  await setSetting(RESET_KEY, new Date().toISOString())
}

/**
 * Claim the right to reseed BEFORE doing it, not after.
 *
 * The timestamp used to be written on the last line of resetDemoData, so for the ten
 * or so seconds a reseed takes, every other visitor still read the sandbox as stale
 * and kicked off their own. Two runs racing is not harmless: each one opens by
 * DELETEing truck_meta and fleet_status, so the second run wipes the rows the first
 * has already inserted. That is exactly how the demo fleet ended up with eight trucks
 * of which only the last two had a photo and a GPS fix — everything created before
 * the other run's DELETE swept past was gone, and the trucks themselves survived only
 * because they are re-inserted first.
 *
 * The conditional UPDATE is the lock. Only the caller whose WHERE still sees a stale
 * timestamp gets a row back; everyone else falls through to the session with the data
 * that's already there. Postgres serialises the two writers on the same row, so there
 * is no window where both win.
 */
async function claimDemoReset(): Promise<boolean> {
  const now = new Date().toISOString()
  const cutoff = new Date(Date.now() - RESET_AFTER_MS).toISOString()
  const rows = await sql`
    INSERT INTO settings (key, value) VALUES (${RESET_KEY}, ${now})
    ON CONFLICT (key) DO UPDATE SET value = ${now}
      WHERE settings.value < ${cutoff}
    RETURNING key`
  return rows.length > 0
}

/**
 * Entry point for the public "Попробовать демо" link (app/demo/route.ts). Refreshes
 * the sandbox if it's gone stale (>24h since the last visitor's reset — nightly in
 * spirit, without needing an external cron), then returns a session token for the
 * shared demo account. The route sets it as a cookie ON the redirect response — not
 * via next/headers here — so it reliably attaches behind the reverse proxy. Every
 * dispatcher who clicks the link sees the same fleet. `locale` only matters on an
 * actual reset — it picks which language the seeded driver names come in; between
 * resets everyone sees whatever the last reset produced, same as every other piece
 * of demo content (it's one shared sandbox, not a per-visitor one).
 */
export async function startDemoSession(locale: Locale): Promise<string> {
  const userId = await demoUserId()
  if (await claimDemoReset()) {
    try {
      await resetDemoData(userId, locale)
    } catch (e) {
      // Hand the claim back. Holding it after a failed reseed would leave every
      // visitor for the next 24 hours looking at a half-built fleet, with nothing in
      // the app able to tell that it is half-built.
      await deleteSetting(RESET_KEY)
      throw e
    }
  }
  return createSession(userId)
}
