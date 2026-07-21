'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { sql } from '@/lib/db'
import { humanError } from '@/lib/msg'
import type { LoadStatus } from '@/lib/map'
import type { QrLoad } from '@/lib/qr-load'
import type { TruckSettings } from '@/lib/profit'
import { checkBroker, type BrokerCheck, type RcContext } from '@/lib/fmcsa'
import { getLoad } from '@/lib/loads'
import { buildInvoicePacket, type Company } from '@/lib/invoice'
import { getSetting, setSetting } from '@/lib/settings'

export async function vetBroker(
  mc: string,
  ctx: RcContext,
): Promise<BrokerCheck | { error: string }> {
  return checkBroker(mc, ctx)
}

export async function fetchRouteMiles(origin: string, destination: string) {
  const { routeMiles } = await import('@/lib/geo-routing')
  if (!origin?.trim() || !destination?.trim()) return { error: 'Нужны и откуда, и куда.' }
  return routeMiles(origin, destination)
}

export async function fetchDiesel() {
  const { dieselPrice } = await import('@/lib/geo-routing')
  return dieselPrice()
}

/**
 * Owner pastes their ZigZag "Live Share" links (one per truck) — we keep the tokens
 * and immediately pull GPS from them. No vendor key needed. GPS only, no HOS.
 */
export async function saveEldShareLinks(
  text: string,
): Promise<{ saved: number; updated: number; errors: string[] } | { error: string }> {
  const { parseShareTokens, liveShareSnapshot } = await import('@/lib/eld')
  const { setSetting } = await import('@/lib/settings')
  const tokens = parseShareTokens(text)
  await setSetting('eld_share_tokens', JSON.stringify(tokens))
  const snap = await liveShareSnapshot()
  revalidatePath('/tracking')
  revalidatePath('/', 'layout')
  if ('error' in snap) return { saved: tokens.length, updated: 0, errors: [snap.error] }
  return { saved: tokens.length, updated: snap.updated, errors: snap.errors }
}

/** Manual "Обновить" on /tracking — same two sources the 5-min cron polls, on demand. */
export async function refreshFleetStatus(): Promise<{ updated: number; errors: string[] }> {
  const { fleetSnapshot, liveShareSnapshot } = await import('@/lib/eld')
  const [share, key] = await Promise.all([liveShareSnapshot(), fleetSnapshot()])
  // 'no_key' just means the paid vendor API isn't hooked up — expected when the fleet
  // runs on Live Share links only, not worth surfacing as an error every click.
  const errors = [
    ...('error' in share ? [share.error] : share.errors),
    ...('error' in key && key.error !== 'no_key' ? [key.error] : []),
  ]
  const updated = ('updated' in share ? share.updated : 0) + ('updated' in key ? key.updated : 0)
  revalidatePath('/tracking')
  revalidatePath('/', 'layout')
  return { updated, errors }
}

/** Fired from the nav on every page load/section switch — no cron ever got set up
 * (that needed the owner to sign up for an external pinger, cron-job.org), so GPS
 * only ever moved on the manual "Обновить" click. Riding real navigation instead
 * means it stays fresh while anyone is actually using the app. Throttled server-side
 * (not per-tab) so ten dispatchers clicking around at once still means one real poll,
 * not ten — a Live Share link is 2 HTTP calls each, times however many trucks.
 * Returns whether it actually polled (vs. throttled) — fetching new GPS is useless if
 * the page already on screen never re-renders to show it, so the caller only forces a
 * re-render when there's actually fresh data behind it. */
export async function autoRefreshFleet(): Promise<boolean> {
  const THROTTLE_MS = 3 * 60 * 1000
  const last = await getSetting('fleet_auto_refresh_at')
  if (last && Date.now() - new Date(last).getTime() < THROTTLE_MS) return false
  await setSetting('fleet_auto_refresh_at', new Date().toISOString())

  const { fleetSnapshot, liveShareSnapshot } = await import('@/lib/eld')
  await Promise.all([liveShareSnapshot().catch(() => {}), fleetSnapshot().catch(() => {})])
  revalidatePath('/tracking')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/', 'layout')
  return true
}

/* ---------- Invoicing / AR ---------- */

export async function generateInvoice(
  loadId: number,
): Promise<{ docId: number; invoiceNumber: string } | { error: string }> {
  const load = await getLoad(loadId)
  if (!load) return { error: 'Груз не найден.' }
  const res = await buildInvoicePacket(load)
  if ('error' in res) return res
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/invoices')
  revalidatePath('/')
  return res
}

export async function markPaid(loadId: number, paid: boolean): Promise<void> {
  await sql`UPDATE loads SET paid_at = ${paid ? new Date().toISOString() : null},
            status = ${paid ? 'paid' : 'delivered'} WHERE id = ${loadId}`
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/invoices')
  revalidatePath('/')
}

export async function saveCompany(c: Company): Promise<{ error: string } | void> {
  if (!c.name.trim() || !c.mcdot.trim()) return { error: 'Нужны минимум название и MC/DOT.' }
  await Promise.all([
    setSetting('co_name', c.name.trim()),
    setSetting('co_owner', c.owner.trim()),
    setSetting('co_mcdot', c.mcdot.trim()),
    setSetting('co_address', c.address.trim()),
    setSetting('co_email', c.email.trim()),
    setSetting('co_phone', c.phone.trim()),
    setSetting('co_remit_to', c.remitTo.trim()),
  ])
  revalidatePath('/invoices')
  revalidatePath('/trucks')
}

export type NewLoad = QrLoad & { source: 'manual' | 'qr'; truckId: number }

/**
 * Deadhead — empty miles from wherever the truck sits right now to this load's
 * pickup city — is the one thing no document can ever print (see qr-load.ts). If
 * the caller didn't already supply it, compute it from the truck's live GPS
 * (fleet_status, joined by unit number) via the same road-routing used everywhere
 * else. No GPS yet, or no pickup city → leave it as given (usually 0, dispatcher
 * fixes it by hand same as always).
 */
async function fillDeadhead(truckId: number, deadheadMiles: number, origin: string | null): Promise<number> {
  if (deadheadMiles > 0 || !origin) return deadheadMiles
  const rows = (await sql`
    SELECT fs.lat, fs.lng FROM trucks t
    LEFT JOIN fleet_status fs ON fs.unit = t.number
    WHERE t.id = ${truckId}`) as { lat: number | null; lng: number | null }[]
  const t = rows[0]
  if (t?.lat == null || t?.lng == null) return deadheadMiles
  const { deliveryInfo } = await import('@/lib/geo-routing')
  const d = await deliveryInfo({ lat: t.lat, lng: t.lng }, origin)
  return d ? d.miles : deadheadMiles
}

export async function createLoad(
  load: NewLoad,
  /** Pre-uploaded document (the imported RC) that becomes this load's paperwork. */
  docId?: number,
): Promise<{ error: string } | void> {
  let id: number
  try {
    const deadheadMiles = await fillDeadhead(load.truckId, load.deadheadMiles, load.origin)
    const rows = await sql`
      INSERT INTO loads (rate, loaded_miles, deadhead_miles, transit_days, origin,
                         destination, truck_location, spot_rpm, broker_mc, broker_email,
                         broker_phone, reference_id, source, truck_id, pickup_date,
                         delivery_date, broker_notes, pickup_time, delivery_time,
                         pickup_address, delivery_address)
      VALUES (${load.rate}, ${load.loadedMiles}, ${deadheadMiles}, ${load.transitDays},
              ${load.origin}, ${load.destination}, ${load.truckLocation}, ${load.spotRpm},
              ${load.brokerMc}, ${load.brokerEmail}, ${load.brokerPhone}, ${load.referenceId},
              ${load.source}, ${load.truckId}, ${load.pickupDate ?? null},
              ${load.deliveryDate ?? null}, ${load.brokerNotes ?? null},
              ${load.pickupTime ?? null}, ${load.deliveryTime ?? null},
              ${load.pickupAddress ?? null}, ${load.deliveryAddress ?? null})
      RETURNING id`
    id = (rows[0] as { id: number }).id
    if (docId) {
      await sql`UPDATE documents SET load_id = ${id} WHERE id = ${docId} AND load_id IS NULL`
    }
  } catch (e) {
    return { error: humanError(e) }
  }

  revalidatePath('/loads')
  revalidatePath('/')
  revalidatePath(`/trucks/${load.truckId}`)
  revalidatePath('/trucks')
  // Outside the try: redirect() signals by throwing, and a catch would swallow it.
  redirect(`/loads/${id}`)
}

/**
 * Create a load from a parsed rate con WITHOUT redirecting — the truck page stays
 * put and shows the result inline. Attaches the already-uploaded RC document.
 */
export async function createLoadFromRc(
  truckId: number,
  load: QrLoad,
  docId?: number,
): Promise<{ loadId: number } | { error: string }> {
  try {
    // Plenty of real rate cons never print a mileage figure. loads.loaded_miles has
    // CHECK (> 0), so those used to die on a raw constraint violation — the load
    // silently never appeared. Fall back to actual road miles between the two cities
    // (same OSRM routing the map uses). Every RC path funnels through here, so this
    // one guard covers the truck-page drop, /import and the new-load scanner alike.
    let loadedMiles = load.loadedMiles
    if (!(loadedMiles > 0) && load.origin && load.destination) {
      const { routeMiles } = await import('@/lib/geo-routing')
      const r = await routeMiles(load.origin, load.destination)
      if ('miles' in r) loadedMiles = r.miles
    }
    if (!(loadedMiles > 0))
      return {
        error:
          'В рейтконе не указан пробег, и рассчитать его по городам не вышло. Создай груз вручную и впиши мили.',
      }
    const deadheadMiles = await fillDeadhead(truckId, load.deadheadMiles, load.origin)

    // A rate confirmation IS a confirmed booking — there's nothing left to "quote".
    // Defaulting to the schema's 'quoted' here meant every RC-sourced load needed a
    // manual status click before it counted as the truck's current assignment, so
    // the map and "Текущее задание" looked stuck even though the load was real.
    const rows = await sql`
      INSERT INTO loads (rate, loaded_miles, deadhead_miles, transit_days, origin,
                         destination, truck_location, spot_rpm, broker_mc, broker_email,
                         broker_phone, reference_id, source, truck_id, pickup_date,
                         delivery_date, broker_notes, pickup_time, delivery_time,
                         pickup_address, delivery_address, status)
      VALUES (${load.rate}, ${loadedMiles}, ${deadheadMiles}, ${load.transitDays},
              ${load.origin}, ${load.destination}, ${load.truckLocation}, ${load.spotRpm},
              ${load.brokerMc}, ${load.brokerEmail}, ${load.brokerPhone}, ${load.referenceId},
              'qr', ${truckId}, ${load.pickupDate ?? null}, ${load.deliveryDate ?? null},
              ${load.brokerNotes ?? null}, ${load.pickupTime ?? null}, ${load.deliveryTime ?? null},
              ${load.pickupAddress ?? null}, ${load.deliveryAddress ?? null}, 'booked')
      RETURNING id`
    const loadId = (rows[0] as { id: number }).id
    if (docId) await sql`UPDATE documents SET load_id = ${loadId} WHERE id = ${docId} AND load_id IS NULL`
    revalidatePath(`/trucks/${truckId}`)
    revalidatePath('/loads')
    revalidatePath('/')
    return { loadId }
  } catch (e) {
    return { error: humanError(e) }
  }
}

/**
 * Turn an ALREADY-UPLOADED rate con into a load, entirely server-side.
 *
 * The browser-orchestrated path (upload → AI → create, in TruckRcDrop) leaves a
 * stranded document if the page is reloaded during the AI read — which on a scanned
 * PDF takes over a minute, long enough to look frozen. This runs the whole thing in
 * one server action, so nothing is lost to a navigation, and it rescues documents
 * already stranded that way.
 */
export async function createLoadFromExistingRc(
  docId: number,
  truckId: number,
): Promise<{ loadId: number } | { error: string }> {
  // Postgres' encode() wraps base64 at PEM width; Gemini's inlineData rejects the
  // embedded newlines with a 400, hence the replace().
  const rows = await sql`
    SELECT replace(encode(data, 'base64'), E'\n', '') AS b64, mime, load_id
    FROM documents WHERE id = ${docId} AND kind = 'ratecon'`
  const doc = rows[0] as { b64: string; mime: string; load_id: number | null } | undefined
  if (!doc) return { error: 'Рейткон не найден.' }
  if (doc.load_id) return { error: 'Из этого рейткона груз уже создан.' }

  const { geminiExtract } = await import('@/lib/ratecon-gemini')
  const res = await geminiExtract({ pdfBase64: doc.b64, mime: doc.mime })
  if ('error' in res)
    return { error: res.error === 'no_key' ? 'Нет ключа ИИ (GEMINI_API_KEY).' : `ИИ не прочитал: ${res.error}` }

  const { aiToFields } = await import('@/lib/ratecon-ai-contract')
  const { toQrLoad } = await import('@/lib/ratecon')
  return createLoadFromRc(truckId, toQrLoad(aiToFields(res.fields, res.model)), docId)
}

export async function setStatus(id: number, status: LoadStatus): Promise<void> {
  await sql`UPDATE loads SET status = ${status} WHERE id = ${id}`
  revalidatePath(`/loads/${id}`)
  revalidatePath('/loads')
  revalidatePath('/')
  revalidatePath('/trucks', 'layout')
}

/** Truck identity (number + driver) plus its economics — everything a truck is. */
export type TruckInput = TruckSettings & { number: string; driverName: string }

export async function saveTruck(
  id: number,
  t: TruckInput,
): Promise<{ error: string } | void> {
  const cpm = t.driverPay.mode === 'cpm' ? t.driverPay.centsPerMile : null
  const pct = t.driverPay.mode === 'percent' ? t.driverPay.percentOfGross : null
  try {
    await sql`
      UPDATE trucks SET
        number = ${t.number},
        driver_name = ${t.driverName},
        mpg = ${t.mpg},
        fuel_price_per_gallon = ${t.fuelPricePerGallon},
        driver_pay_mode = ${t.driverPay.mode},
        driver_cents_per_mile = ${cpm},
        driver_percent_of_gross = ${pct},
        truck_payment_per_day = ${t.truckPaymentPerDay},
        insurance_per_day = ${t.insurancePerDay},
        eld_permits_per_day = ${t.eldPermitsPerDay},
        maintenance_cost_per_mile = ${t.maintenanceCostPerMile},
        factoring_percent = ${t.factoringPercent},
        dispatch_percent = ${t.dispatchPercent}
      WHERE id = ${id}`
  } catch (e) {
    return { error: humanError(e) }
  }
  // Blunt on purpose: a truck's settings feed calcLoad on every page that shows its
  // money. Enumerating them is more code, and one forgotten path means silently
  // wrong numbers.
  revalidatePath('/', 'layout')
}

/* ---------- Documents ---------- */

const MAX_DOC_BYTES = 8 * 1024 * 1024

/**
 * FormData: file, kind, title?, truckId?, loadId?. Returns the new id so the RC
 * import can attach the document to the load it creates a moment later.
 */
export async function uploadDocument(
  fd: FormData,
): Promise<{ id: number } | { error: string }> {
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Файл не выбран.' }
  if (file.size > MAX_DOC_BYTES) return { error: 'Файл больше 8 МБ — сожми или пришли меньше.' }

  const kind = String(fd.get('kind') || 'other')
  const title = String(fd.get('title') || '').trim() || file.name
  const truckId = fd.get('truckId') ? Number(fd.get('truckId')) : null
  const loadId = fd.get('loadId') ? Number(fd.get('loadId')) : null
  // Hex round-trip: Neon's HTTP driver JSON-encodes params, raw bytes don't survive.
  const hex = Buffer.from(await file.arrayBuffer()).toString('hex')

  try {
    const rows = await sql`
      INSERT INTO documents (truck_id, load_id, kind, title, mime, size_bytes, data)
      VALUES (${truckId}, ${loadId}, ${kind}, ${title},
              ${file.type || 'application/octet-stream'}, ${file.size}, decode(${hex}, 'hex'))
      RETURNING id`
    revalidatePath('/docs')
    if (truckId) revalidatePath(`/trucks/${truckId}`)
    if (loadId) revalidatePath(`/loads/${loadId}`)
    return { id: (rows[0] as { id: number }).id }
  } catch (e) {
    return { error: humanError(e) }
  }
}

export async function attachDocumentToLoad(docId: number, loadId: number): Promise<void> {
  await sql`UPDATE documents SET load_id = ${loadId} WHERE id = ${docId} AND load_id IS NULL`
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/docs')
}

/**
 * Deleting a document is guarded: the person types their name and the PIN, and we
 * keep an audit row (who, what, the load route) that outlives the file — shown in
 * the Журнал. The PIN is the same shared APP_PIN used to sign in.
 */
export async function deleteDocument(
  id: number,
  who: string,
  pin: string,
): Promise<{ error: string } | void> {
  if (!process.env.APP_PIN) return { error: 'APP_PIN не настроен на сервере.' }
  if (pin !== process.env.APP_PIN) return { error: 'Неверный PIN.' }
  if (!who?.trim()) return { error: 'Впиши имя — кто удаляет.' }

  try {
    // Snapshot the doc + its load route BEFORE deleting, for the audit trail.
    const rows = (await sql`
      SELECT d.title, d.kind, l.origin, l.destination
      FROM documents d LEFT JOIN loads l ON l.id = d.load_id
      WHERE d.id = ${id}`) as {
      title: string
      kind: string
      origin: string | null
      destination: string | null
    }[]
    const doc = rows[0]
    if (!doc) return { error: 'Документ не найден.' }

    await sql`DELETE FROM documents WHERE id = ${id}`

    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
    const { ipCity } = await import('@/lib/geo-routing')
    const city = await ipCity(ip)
    await sql`
      INSERT INTO audit_log (who, action, target, doc_kind, from_loc, to_loc, ip, user_agent, city)
      VALUES (${who.trim()}, 'delete_document', ${doc.title}, ${doc.kind},
              ${doc.origin}, ${doc.destination}, ${ip}, ${h.get('user-agent')}, ${city})`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath('/docs')
  revalidatePath('/logins')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/loads', 'layout')
}

/**
 * Edit a load's details after it exists — the whole "Детали" panel is editable, so
 * the dispatcher can fix anything the RC parse got wrong. All fields feed calcLoad,
 * so the page re-renders with fresh profit after saving. Validation mirrors the
 * loads CHECK constraints, so a bad value returns a friendly error, not a DB throw.
 */
export type LoadDetailsPatch = {
  rate: number
  loadedMiles: number
  deadheadMiles: number
  transitDays: number
  spotRpm: number | null
  brokerMc: string | null
  brokerPhone: string | null
  brokerEmail: string | null
  pickupDate: string | null
  deliveryDate: string | null
}

export async function updateLoadDetails(
  loadId: number,
  p: LoadDetailsPatch,
): Promise<{ error: string } | void> {
  if (!(p.rate >= 0)) return { error: 'Ставка не может быть отрицательной.' }
  if (!(p.loadedMiles > 0)) return { error: 'Гружёные мили должны быть больше 0.' }
  if (!(p.deadheadMiles >= 0)) return { error: 'Пустые мили не могут быть отрицательными.' }
  if (!(p.transitDays > 0)) return { error: 'Дней в пути должно быть больше 0.' }
  if (p.spotRpm != null && !(p.spotRpm >= 0)) return { error: 'Рыночная ставка не может быть отрицательной.' }
  try {
    await sql`UPDATE loads SET
      rate = ${p.rate}, loaded_miles = ${p.loadedMiles}, deadhead_miles = ${p.deadheadMiles},
      transit_days = ${p.transitDays}, spot_rpm = ${p.spotRpm},
      broker_mc = ${p.brokerMc || null}, broker_phone = ${p.brokerPhone || null},
      broker_email = ${p.brokerEmail || null}, pickup_date = ${p.pickupDate || null},
      delivery_date = ${p.deliveryDate || null}
      WHERE id = ${loadId}`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/loads')
  revalidatePath('/', 'layout')
}

/** Save the broker's special-instructions text (the "must read" block). */
export async function setBrokerNotes(
  loadId: number,
  notes: string,
): Promise<{ error: string } | void> {
  try {
    await sql`UPDATE loads SET broker_notes = ${notes.trim() || null} WHERE id = ${loadId}`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath(`/loads/${loadId}`)
}

/** Translates a load's broker notes (Russian dispatcher, English rate cons). */
export async function translateBrokerNotes(
  text: string,
  targetLang: 'ru' | 'en',
): Promise<{ text: string } | { error: string }> {
  if (!text.trim()) return { error: 'Пустой текст.' }
  const { translatePlainText } = await import('@/lib/ratecon-gemini')
  const res = await translatePlainText(text, targetLang === 'ru' ? 'Russian' : 'English')
  if ('error' in res)
    return { error: res.error === 'no_key' ? 'Нет ключа ИИ (GEMINI_API_KEY).' : `Не вышло перевести: ${res.error}` }
  return res
}

/** Dispatcher acknowledged the broker notes — stops highlighting them. */
export async function markNotesRead(loadId: number): Promise<void> {
  await sql`UPDATE loads SET notes_read_at = now() WHERE id = ${loadId} AND notes_read_at IS NULL`
  revalidatePath(`/loads/${loadId}`)
}

/**
 * Re-read the load's attached rate con with Gemini and fill in everything the
 * document itself carries but this load was created without: the "Важное от
 * брокера" briefing, pickup/delivery date+time, pickup/delivery street address (for
 * the exact map pin), and transit days. Resets notes_read_at so notes must be read
 * again. Never touches rate/miles/origin/destination — those the dispatcher may have
 * already corrected by hand, and this button's job is filling gaps, not overwriting.
 *
 * Reuses the exact same aiToFields → toQrLoad mapping the initial RC-drop creation
 * path uses (app/actions.ts createLoadFromRc), so a load created before those fields
 * existed catches up to one created after, field for field.
 */
export async function parseRcForNotes(
  loadId: number,
): Promise<{ error: string } | { ok: true; found: boolean }> {
  // Postgres base64 comes newline-wrapped (PEM style); Gemini's decoder rejects the
  // newlines, so strip them.
  const docs = (await sql`
    SELECT replace(encode(data, 'base64'), E'\n', '') AS b64, mime
    FROM documents WHERE load_id = ${loadId} AND kind = 'ratecon'
    ORDER BY uploaded_at DESC LIMIT 1`) as { b64: string; mime: string }[]
  const doc = docs[0]
  if (!doc) return { error: 'К этому грузу не прикреплён rate con.' }

  const { geminiExtract } = await import('@/lib/ratecon-gemini')
  const res = await geminiExtract({ pdfBase64: doc.b64, mime: doc.mime })
  if ('error' in res)
    return {
      error: res.error === 'no_key' ? 'Нет ключа Gemini на сервере.' : `Не вышло распознать: ${res.error}`,
    }

  const { aiToFields } = await import('@/lib/ratecon-ai-contract')
  const { toQrLoad } = await import('@/lib/ratecon')
  const load = toQrLoad(aiToFields(res.fields, res.model))

  try {
    await sql`UPDATE loads SET
      broker_notes = ${load.brokerNotes}, notes_read_at = NULL,
      transit_days = ${load.transitDays},
      pickup_date = ${load.pickupDate}, delivery_date = ${load.deliveryDate},
      pickup_time = ${load.pickupTime}, delivery_time = ${load.deliveryTime},
      pickup_address = ${load.pickupAddress}, delivery_address = ${load.deliveryAddress}
      WHERE id = ${loadId}`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/trucks', 'layout')
  revalidatePath('/', 'layout')
  return { ok: true, found: !!load.brokerNotes }
}

/**
 * Delete a load. Guarded like document deletion (name + PIN → audit row in the
 * Журнал). Its documents are kept but detached, so the paperwork stays in the
 * library instead of blocking the delete on the foreign key.
 */
export async function deleteLoad(
  id: number,
  who: string,
  pin: string,
): Promise<{ error: string } | void> {
  if (!process.env.APP_PIN) return { error: 'APP_PIN не настроен на сервере.' }
  if (pin !== process.env.APP_PIN) return { error: 'Неверный PIN.' }
  if (!who?.trim()) return { error: 'Впиши имя — кто удаляет.' }

  try {
    const rows = (await sql`SELECT origin, destination FROM loads WHERE id = ${id}`) as {
      origin: string | null
      destination: string | null
    }[]
    const load = rows[0]
    if (!load) return { error: 'Груз не найден.' }

    await sql`UPDATE documents SET load_id = NULL WHERE load_id = ${id}`
    await sql`DELETE FROM loads WHERE id = ${id}`

    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
    const { ipCity } = await import('@/lib/geo-routing')
    const city = await ipCity(ip)
    const route = [load.origin, load.destination].filter(Boolean).join(' → ') || `#${id}`
    await sql`
      INSERT INTO audit_log (who, action, target, doc_kind, from_loc, to_loc, ip, user_agent, city)
      VALUES (${who.trim()}, 'delete_load', ${route}, NULL,
              ${load.origin}, ${load.destination}, ${ip}, ${h.get('user-agent')}, ${city})`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath('/loads')
  revalidatePath('/')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/logins')
}

/* ---------- Truck care: maintenance log, to-fix list, passport ---------- */

export type MaintenanceInput = {
  kind: 'repair' | 'service' | 'inspection'
  title: string
  notes: string
  cost: number | null
  odometer: number | null
  doneAt: string // YYYY-MM-DD
}

export async function addMaintenance(
  truckId: number,
  m: MaintenanceInput,
): Promise<{ error: string } | void> {
  if (!m.title.trim()) return { error: 'Напиши, что делали.' }
  try {
    await sql`
      INSERT INTO truck_maintenance (truck_id, kind, title, notes, cost, odometer, done_at)
      VALUES (${truckId}, ${m.kind}, ${m.title.trim()}, ${m.notes.trim() || null},
              ${m.cost}, ${m.odometer}, ${m.doneAt})`
    // An oil change in the log IS the oil counter's reset point — one entry, two effects.
    if (m.kind === 'service' && m.odometer !== null && /масл|oil/i.test(m.title)) {
      await sql`
        INSERT INTO truck_meta (truck_id, oil_last_odometer) VALUES (${truckId}, ${m.odometer})
        ON CONFLICT (truck_id) DO UPDATE SET oil_last_odometer = ${m.odometer}`
    }
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath(`/trucks/${truckId}`)
}

export async function addTodo(
  truckId: number,
  title: string,
  priority: 'low' | 'normal' | 'urgent',
): Promise<{ error: string } | void> {
  if (!title.trim()) return { error: 'Напиши, что нужно починить.' }
  try {
    await sql`INSERT INTO truck_todos (truck_id, title, priority)
              VALUES (${truckId}, ${title.trim()}, ${priority})`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath(`/trucks/${truckId}`)
}

export async function toggleTodo(id: number, truckId: number): Promise<void> {
  await sql`UPDATE truck_todos
            SET done_at = CASE WHEN done_at IS NULL THEN now() ELSE NULL END
            WHERE id = ${id}`
  revalidatePath(`/trucks/${truckId}`)
}

export type TruckMetaInput = {
  vin: string
  plate: string
  trailerNumber: string
  year: number | null
  make: string
  model: string
  oilIntervalMi: number
  oilLastOdometer: number | null
  driverPhone: string
  notes: string
  registrationExpiry: string | null
  inspectionExpiry: string | null
  insuranceExpiry: string | null
  cdlExpiry: string | null
  medcardExpiry: string | null
}

const d = (s: string | null) => (s && s.trim() ? s : null)

/**
 * Everything about the person driving this truck, in one place. Name lives on the
 * truck row, contact + licence dates on truck_meta — this writes both without
 * touching the rest of the passport (VIN, plate, oil…).
 */
export async function saveDriverInfo(
  truckId: number,
  d: { name: string; phone: string; cdlExpiry: string; medcardExpiry: string },
): Promise<{ error: string } | void> {
  try {
    await sql`UPDATE trucks SET driver_name = ${d.name.trim() || null} WHERE id = ${truckId}`
    await sql`
      INSERT INTO truck_meta (truck_id, driver_phone, cdl_expiry, medcard_expiry)
      VALUES (${truckId}, ${d.phone.trim() || null}, ${d.cdlExpiry || null}, ${d.medcardExpiry || null})
      ON CONFLICT (truck_id) DO UPDATE SET
        driver_phone   = EXCLUDED.driver_phone,
        cdl_expiry     = EXCLUDED.cdl_expiry,
        medcard_expiry = EXCLUDED.medcard_expiry`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/trucks')
  revalidatePath('/', 'layout')
}

const MAX_PHOTO_BYTES = 4 * 1024 * 1024

/** FormData: file. Stored on truck_meta, served by /api/driver-photo/[truckId]. */
export async function saveDriverPhoto(
  truckId: number,
  fd: FormData,
): Promise<{ error: string } | void> {
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Файл не выбран.' }
  if (file.size > MAX_PHOTO_BYTES) return { error: 'Фото больше 4 МБ — сожми или пришли меньше.' }
  if (!file.type.startsWith('image/')) return { error: 'Нужно изображение (JPG/PNG).' }

  const hex = Buffer.from(await file.arrayBuffer()).toString('hex')
  try {
    await sql`
      INSERT INTO truck_meta (truck_id, driver_photo, driver_photo_mime)
      VALUES (${truckId}, decode(${hex}, 'hex'), ${file.type})
      ON CONFLICT (truck_id) DO UPDATE SET
        driver_photo      = EXCLUDED.driver_photo,
        driver_photo_mime = EXCLUDED.driver_photo_mime`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/trucks')
  revalidatePath('/', 'layout')
}

export async function saveTruckMeta(
  truckId: number,
  m: TruckMetaInput,
): Promise<{ error: string } | void> {
  try {
    await sql`
      INSERT INTO truck_meta (truck_id, vin, plate, trailer_number, year, make, model,
                              oil_interval_mi, oil_last_odometer, driver_phone, notes,
                              registration_expiry, inspection_expiry, insurance_expiry,
                              cdl_expiry, medcard_expiry)
      VALUES (${truckId}, ${m.vin.trim() || null}, ${m.plate.trim() || null},
              ${m.trailerNumber.trim() || null}, ${m.year},
              ${m.make.trim() || null}, ${m.model.trim() || null}, ${m.oilIntervalMi},
              ${m.oilLastOdometer}, ${m.driverPhone.trim() || null}, ${m.notes.trim() || null},
              ${d(m.registrationExpiry)}, ${d(m.inspectionExpiry)}, ${d(m.insuranceExpiry)},
              ${d(m.cdlExpiry)}, ${d(m.medcardExpiry)})
      ON CONFLICT (truck_id) DO UPDATE SET
        vin = EXCLUDED.vin, plate = EXCLUDED.plate, trailer_number = EXCLUDED.trailer_number, year = EXCLUDED.year,
        make = EXCLUDED.make, model = EXCLUDED.model,
        oil_interval_mi = EXCLUDED.oil_interval_mi,
        oil_last_odometer = EXCLUDED.oil_last_odometer,
        driver_phone = EXCLUDED.driver_phone, notes = EXCLUDED.notes,
        registration_expiry = EXCLUDED.registration_expiry,
        inspection_expiry = EXCLUDED.inspection_expiry,
        insurance_expiry = EXCLUDED.insurance_expiry,
        cdl_expiry = EXCLUDED.cdl_expiry, medcard_expiry = EXCLUDED.medcard_expiry`
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/')
}

export async function addTruck(t: TruckInput): Promise<{ error: string } | void> {
  const cpm = t.driverPay.mode === 'cpm' ? t.driverPay.centsPerMile : null
  const pct = t.driverPay.mode === 'percent' ? t.driverPay.percentOfGross : null
  let id: number
  try {
    const rows = await sql`
      INSERT INTO trucks (name, number, driver_name, mpg, fuel_price_per_gallon,
                          driver_pay_mode, driver_cents_per_mile, driver_percent_of_gross,
                          truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                          maintenance_cost_per_mile, factoring_percent, dispatch_percent)
      VALUES (${t.number || 'Трак'}, ${t.number}, ${t.driverName}, ${t.mpg},
              ${t.fuelPricePerGallon}, ${t.driverPay.mode}, ${cpm}, ${pct},
              ${t.truckPaymentPerDay}, ${t.insurancePerDay}, ${t.eldPermitsPerDay},
              ${t.maintenanceCostPerMile}, ${t.factoringPercent}, ${t.dispatchPercent})
      RETURNING id`
    id = (rows[0] as { id: number }).id
  } catch (e) {
    return { error: humanError(e) }
  }
  revalidatePath('/trucks')
  redirect(`/trucks/${id}`)
}
