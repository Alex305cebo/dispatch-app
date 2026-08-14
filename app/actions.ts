'use server'

// Правило про router.refresh() после этих действий: он НЕ нужен.
//
// Проверено по исходникам Next 15.5 (server/app-render/action-handler.js):
// ответ серверного действия строится с `skipFlight: !workStore.pathWasRevalidated`.
// Стоит действию вызвать revalidatePath — и ответ уже содержит заново отрисованное
// дерево текущей страницы, которое роутер применяет сам. Вызов router.refresh()
// рядом запрашивает ту же страницу ВТОРОЙ раз, то есть каждое сохранение стоило
// двух полных серверных рендеров вместо одного.
//
// Осознанно оставлены только те refresh, за которыми нет revalidatePath: кнопки
// «Обновить», опросы по таймеру, выход из аккаунта и смена языка (там меняется кука,
// а не данные).

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { sql } from '@/lib/db'
import { humanError } from '@/lib/msg'
import type { LoadStatus } from '@/lib/map'
import type { QrLoad } from '@/lib/qr-load'
import type { TruckSettings } from '@/lib/profit'
import { checkBroker, checkBrokerByDot, type BrokerCheck, type RcContext } from '@/lib/fmcsa'
import { formatDriverInfo, toQrLoad } from '@/lib/ratecon'
import { cityCoordsBest } from '@/lib/geo-routing'
import { haversineMiles } from '@/lib/geo'
import { nextLoadStatus, GEOFENCE_MI } from '@/lib/load-status'
import type { DocClass } from '@/lib/ai-doc'
import { docBelongs, getLoad, loadBelongs, truckBelongs } from '@/lib/loads'
import type { HistoryLeg } from '@/lib/trip-history'
import { autoInvoiceIfReady, buildInvoicePacket, type Company } from '@/lib/invoice'
import { getSetting, setSetting } from '@/lib/settings'
import { companyScope, demoReadOnly, getCurrentUser, verifyMyPassword } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import type { CapabilityKey } from '@/lib/capabilities'
import { t } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n-server'

export async function vetBroker(
  mc: string,
  ctx: RcContext,
): Promise<BrokerCheck | { error: string }> {
  return checkBroker(mc, ctx, await getLocale())
}

/** Manual broker lookup from the Brokers page — by MC or DOT number. */
export async function runBrokerCheck(
  by: 'mc' | 'dot',
  value: string,
): Promise<BrokerCheck | { error: string }> {
  const locale = await getLocale()
  return by === 'dot' ? checkBrokerByDot(value, {}, locale) : checkBroker(value, {}, locale)
}

export async function fetchRouteMiles(origin: string, destination: string) {
  const { routeMiles } = await import('@/lib/geo-routing')
  if (!origin?.trim() || !destination?.trim()) return { error: t(await getLocale(), 'actions.needOriginDest') }
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
  const ro = await demoReadOnly()
  if (ro) return false
  const THROTTLE_MS = 3 * 60 * 1000
  const last = await getSetting('fleet_auto_refresh_at')
  if (last && Date.now() - new Date(last).getTime() < THROTTLE_MS) return false
  await setSetting('fleet_auto_refresh_at', new Date().toISOString())

  const { fleetSnapshot, liveShareSnapshot } = await import('@/lib/eld')
  await Promise.all([liveShareSnapshot().catch(() => {}), fleetSnapshot().catch(() => {})])
  // Positions just refreshed — now move any load whose truck has left its pickup/delivery.
  await autoAdvanceLoadStatuses().catch(() => {})
  revalidatePath('/tracking')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/loads')
  revalidatePath('/', 'layout')
  return true
}

/** Advance load status from live GPS: booked → in_transit once the truck has left the
 * pickup, in_transit → delivered once it has left the delivery. Forward-only, geofenced,
 * and gated on a fresh fix so a stale position can't move a load. Decision logic (and its
 * tests) live in lib/load-status.ts; this is the DB read/write + geocoding around it. */
async function autoAdvanceLoadStatuses(): Promise<void> {
  const STALE_MS = 60 * 60 * 1000
  const rows = (await sql`
    SELECT l.id, l.status, l.origin, l.destination, l.pickup_address, l.delivery_address,
           l.pickup_arrived_at, l.delivery_arrived_at, f.lat, f.lng, f.eld_seen
    FROM loads l
    JOIN trucks t ON t.id = l.truck_id
    JOIN fleet_status f ON f.unit = t.number
    WHERE l.status IN ('booked', 'in_transit') AND f.lat IS NOT NULL AND f.lng IS NOT NULL`) as {
    id: number
    status: 'booked' | 'in_transit'
    origin: string | null
    destination: string | null
    pickup_address: string | null
    delivery_address: string | null
    pickup_arrived_at: string | null
    delivery_arrived_at: string | null
    lat: number
    lng: number
    eld_seen: string | null
  }[]

  for (const r of rows) {
    const seen = r.eld_seen ? Date.parse(r.eld_seen) : NaN
    if (!Number.isNaN(seen) && Date.now() - seen > STALE_MS) continue // stale fix — skip
    const truck = { lat: r.lat, lng: r.lng }
    const pickup = await cityCoordsBest(r.pickup_address, r.origin)
    const dest = await cityCoordsBest(r.delivery_address, r.destination)
    const dP = pickup ? haversineMiles(truck, pickup) : null
    const dD = dest ? haversineMiles(truck, dest) : null

    let pickupArrived = r.pickup_arrived_at != null
    let deliveryArrived = r.delivery_arrived_at != null
    // Stamp first arrival at each stop. Delivery only counts once the load is in_transit, so
    // a short haul whose pickup sits inside the delivery geofence can't mark "arrived at
    // delivery" before it's even been loaded.
    if (dP != null && dP <= GEOFENCE_MI && !pickupArrived) {
      await sql`UPDATE loads SET pickup_arrived_at = now() WHERE id = ${r.id} AND pickup_arrived_at IS NULL`
      pickupArrived = true
    }
    if (r.status === 'in_transit' && dD != null && dD <= GEOFENCE_MI && !deliveryArrived) {
      await sql`UPDATE loads SET delivery_arrived_at = now() WHERE id = ${r.id} AND delivery_arrived_at IS NULL`
      deliveryArrived = true
    }

    const next = nextLoadStatus({
      status: r.status,
      distToPickupMi: dP,
      distToDeliveryMi: dD,
      pickupArrived,
      deliveryArrived,
    })
    if (next) {
      // Бумажной проверки здесь больше нет — по той же причине, что и у кнопки в
      // setStatus: трак физически уехал с выгрузки, значит груз доставлен, а POD
      // подъедет фотографией позже. О недостающих бумагах говорит баннер на грузе.
      // Guard on the status we read, so a manual change in between wins over the auto-move.
      await sql`UPDATE loads SET status = ${next} WHERE id = ${r.id} AND status = ${r.status}`
    }
  }
}

/* ---------- Invoicing / AR ---------- */

/** Server-side capability gate for actions — the UI already hides gated features, but
 * a dispatcher could still POST an action directly, so the mutating ones re-check. */
async function assertCan(key: CapabilityKey): Promise<{ error: string } | null> {
  const user = await getCurrentUser()
  if (!(await can(user, key))) return { error: t(await getLocale(), 'actions.noAccess') }
  return null
}

export async function generateInvoice(
  loadId: number,
): Promise<{ docId: number; invoiceNumber: string } | { error: string }> {
  const denied = await assertCan('finances')
  if (denied) return denied
  const load = await getLoad(await companyScope(), loadId)
  if (!load) return { error: t(await getLocale(), 'actions.loadNotFound') }
  const res = await buildInvoicePacket(load)
  if ('error' in res) return res
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/invoices')
  revalidatePath('/')
  return res
}

export async function markPaid(loadId: number, paid: boolean): Promise<{ error: string } | void> {
  const denied = await assertCan('finances')
  if (denied) return denied
  await sql`UPDATE loads SET paid_at = ${paid ? new Date().toISOString() : null},
            status = ${paid ? 'paid' : 'delivered'} WHERE id = ${loadId} AND company_id = ${await companyScope()}`
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/invoices')
  revalidatePath('/')
}

/** The company profile is one global record, not per-tenant (it's printed on every
 * real invoice) — so unlike everything else in this file, capability alone isn't
 * enough here: the demo account is blocked outright, whatever its capabilities say,
 * so a public demo visitor can never overwrite the real business's invoice letterhead. */
export async function saveCompany(c: Company): Promise<{ error: string } | void> {
  const denied = await assertCan('finances')
  if (denied) return denied
  const locale = await getLocale()
  if ((await companyScope()) === 'demo') return { error: t(locale, 'actions.demoReadOnly') }
  if (!c.name.trim() || !c.mcdot.trim()) return { error: t(locale, 'actions.needNameAndMcDot') }
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
async function fillDeadhead(
  companyId: 'default' | 'demo',
  truckId: number,
  deadheadMiles: number,
  origin: string | null,
): Promise<number> {
  if (deadheadMiles > 0 || !origin) return deadheadMiles
  const rows = (await sql`
    SELECT fs.lat, fs.lng FROM trucks t
    LEFT JOIN fleet_status fs ON fs.unit = t.number
    WHERE t.id = ${truckId} AND t.company_id = ${companyId}`) as { lat: number | null; lng: number | null }[]
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
  /** The "Driver Information" block already rendered from the AI read (LoadForm's
   * /import path) — null for a manual/QR entry, which has nothing to render. */
  driverInfo?: string,
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  let id: number
  const locale = await getLocale()
  try {
    const companyId = await companyScope()
    if (!(await truckBelongs(companyId, load.truckId))) return { error: t(locale, 'actions.truckNotFound') }
    const deadheadMiles = await fillDeadhead(companyId, load.truckId, load.deadheadMiles, load.origin)
    // Auto-credited to whoever's actually signed in and clicking "create" — no
    // manual assignment step, feeds the weekly per-dispatcher report on Финансы.
    const dispatcherId = (await getCurrentUser())?.id ?? null
    const rows = await sql`
      INSERT INTO loads (rate, loaded_miles, deadhead_miles, transit_days, origin,
                         destination, truck_location, spot_rpm, broker_name, broker_mc, broker_email,
                         broker_phone, reference_id, source, truck_id, pickup_date,
                         delivery_date, broker_notes, pickup_time, delivery_time,
                         pickup_address, delivery_address, dispatcher_id, company_id, driver_info, pay_via)
      VALUES (${load.rate}, ${load.loadedMiles}, ${deadheadMiles}, ${load.transitDays},
              ${load.origin}, ${load.destination}, ${load.truckLocation}, ${load.spotRpm},
              ${load.brokerName}, ${load.brokerMc}, ${load.brokerEmail}, ${load.brokerPhone}, ${load.referenceId},
              ${load.source}, ${load.truckId}, ${load.pickupDate ?? null},
              ${load.deliveryDate ?? null}, ${load.brokerNotes ?? null},
              ${load.pickupTime ?? null}, ${load.deliveryTime ?? null},
              ${load.pickupAddress ?? null}, ${load.deliveryAddress ?? null}, ${dispatcherId}, ${companyId},
              ${driverInfo ?? null}, ${load.payVia ?? null})
      RETURNING id`
    id = (rows[0] as { id: number }).id
    if (docId && (await docBelongs(companyId, docId))) {
      await sql`UPDATE documents SET load_id = ${id} WHERE id = ${docId} AND load_id IS NULL`
    }
  } catch (e) {
    return { error: humanError(e, locale) }
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
const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** Drop a broker MC that is actually OUR OWN. Every rate con names two carriers-ish
 * parties, and our MC is the one we can identify with certainty — it's on the company
 * card (settings co_mcdot, free text like "MC 626911 · DOT 1708530"). Returning null
 * costs a broker lookup; returning our own number costs the dispatcher their trust in
 * the check, since it reports "no broker authority" for a company that never had any. */
/** Fills a missing origin/destination from the stop's ZIP.
 *
 * The reader gives us a street and a ZIP but sometimes no city — the rate con printed
 * the address as one run of text and the split went wrong. Without a city the load is
 * refused outright, which throws away a document that was read correctly in every other
 * respect. A US ZIP names exactly one place, so it is enough to recover.
 *
 * Only ever FILLS a gap: a city the reader did give us is never overwritten, because it
 * came from the document itself and the ZIP lookup is an inference. */
async function fillCitiesFromZip(load: QrLoad): Promise<QrLoad> {
  if (load.origin && load.destination) return load
  const zipOf = (address: string | null | undefined): string | null => {
    const all = (address ?? '').match(/\b\d{5}\b/g)
    return all?.[all.length - 1] ?? null
  }
  const { zipPlace } = await import('@/lib/geo-routing')
  const [o, d] = await Promise.all([
    load.origin ? null : (async () => {
      const z = zipOf(load.pickupAddress)
      return z ? await zipPlace(z) : null
    })(),
    load.destination ? null : (async () => {
      const z = zipOf(load.deliveryAddress)
      return z ? await zipPlace(z) : null
    })(),
  ])
  return { ...load, origin: load.origin ?? o, destination: load.destination ?? d }
}

async function withoutOwnMc(load: QrLoad): Promise<QrLoad> {
  if (!load.brokerMc) return load
  const { getCompany } = await import('@/lib/invoice')
  const mine = onlyDigits(/\bMC\s*#?\s*[:\-]?\s*(\d{5,8})\b/i.exec((await getCompany()).mcdot)?.[1])
  return mine && onlyDigits(load.brokerMc) === mine ? { ...load, brokerMc: null } : load
}

export async function createLoadFromRc(
  truckId: number,
  load: QrLoad,
  docId?: number,
  /** The "Driver Information" block rendered from the same AI read that produced
   * `load` — stored so it can be re-copied from the load page later, not just once
   * in the browser session right after the RC was read. */
  driverInfo?: string,
): Promise<{ loadId: number } | { error: string }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  try {
    const companyId = await companyScope()
    if (!(await truckBelongs(companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }
    // A rate con prints TWO MC numbers — the broker's and ours, as the carrier being
    // hired — and whichever the reader grabbed first used to land in broker_mc. That
    // pointed the FMCSA check at our own company and reported "broker authority NONE",
    // which is true of every carrier alive and says nothing about the broker.
    // The AI is now told which one to take (lib/ratecon-ai-contract.ts), but the regex
    // fallback still can't tell them apart, so refuse the one number we can always
    // recognise: our own. Better an empty broker MC than a confident wrong one.
    load = await withoutOwnMc(load)
    // A load with no origin/destination cannot be mapped, cannot be routed, and so
    // cannot have its mileage computed — it just gets refused. Some rate cons print each
    // stop as one run of text and the reader comes back with a street and a ZIP but no
    // city (measured on Corporate Traffic #11694630: street "909 MAGNOLIA AVENUE", zip
    // "33823", city empty). A US ZIP names exactly one place, so recover the city from
    // it rather than throwing away a document that was read correctly otherwise.
    load = await fillCitiesFromZip(load)
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
    if (!(loadedMiles > 0)) return { error: t(locale, 'actions.noMilesInRc') }
    const deadheadMiles = await fillDeadhead(companyId, truckId, load.deadheadMiles, load.origin)
    // Auto-credited to whoever's actually signed in and dropping the RC — no manual
    // assignment step, feeds the weekly per-dispatcher report on Финансы.
    const dispatcherId = (await getCurrentUser())?.id ?? null

    // A rate confirmation IS a confirmed booking — there's nothing left to "quote".
    // Defaulting to the schema's 'quoted' here meant every RC-sourced load needed a
    // manual status click before it counted as the truck's current assignment, so
    // the map and "Текущее задание" looked stuck even though the load was real.
    const rows = await sql`
      INSERT INTO loads (rate, loaded_miles, deadhead_miles, transit_days, origin,
                         destination, truck_location, spot_rpm, broker_name, broker_mc, broker_email,
                         broker_phone, reference_id, source, truck_id, pickup_date,
                         delivery_date, broker_notes, pickup_time, delivery_time,
                         pickup_address, delivery_address, status, dispatcher_id, company_id, driver_info, pay_via)
      VALUES (${load.rate}, ${loadedMiles}, ${deadheadMiles}, ${load.transitDays},
              ${load.origin}, ${load.destination}, ${load.truckLocation}, ${load.spotRpm},
              ${load.brokerName}, ${load.brokerMc}, ${load.brokerEmail}, ${load.brokerPhone}, ${load.referenceId},
              'qr', ${truckId}, ${load.pickupDate ?? null}, ${load.deliveryDate ?? null},
              ${load.brokerNotes ?? null}, ${load.pickupTime ?? null}, ${load.deliveryTime ?? null},
              ${load.pickupAddress ?? null}, ${load.deliveryAddress ?? null}, 'booked', ${dispatcherId}, ${companyId},
              ${driverInfo ?? null}, ${load.payVia ?? null})
      RETURNING id`
    const loadId = (rows[0] as { id: number }).id
    if (docId && (await docBelongs(companyId, docId)))
      // kind='ratecon' too: if this doc was recognised out of a misclassified Telegram
      // file, label it correctly now that we know what it is.
      await sql`UPDATE documents SET load_id = ${loadId}, kind = 'ratecon' WHERE id = ${docId} AND load_id IS NULL`
    revalidatePath(`/trucks/${truckId}`)
    revalidatePath('/loads')
    revalidatePath('/')
    return { loadId }
  } catch (e) {
    return { error: humanError(e, locale) }
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
  const companyId = await companyScope()
  const locale = await getLocale()
  // Postgres' encode() wraps base64 at PEM width; Gemini's inlineData rejects the
  // embedded newlines with a 400, hence the replace().
  // No kind filter: a rate con that arrived via Telegram may have been auto-classified
  // as 'other' (a scan the classifier misread), and the whole point of "recognise from
  // the truck's files" is to rescue exactly that case. Clicking recognise asserts it's a
  // rate con; if the AI can't read one out of it, geminiExtract errors cleanly below.
  const rows = await sql`
    SELECT replace(encode(data, 'base64'), E'\n', '') AS b64, mime, load_id
    FROM documents WHERE id = ${docId} AND company_id = ${companyId}`
  const doc = rows[0] as { b64: string; mime: string; load_id: number | null } | undefined
  if (!doc) return { error: t(locale, 'actions.rateconNotFound') }
  if (doc.load_id) return { error: t(locale, 'actions.rateconAlreadyUsed') }

  const { geminiExtract } = await import('@/lib/ratecon-gemini')
  const res = await geminiExtract({ pdfBase64: doc.b64, mime: doc.mime })
  if ('error' in res)
    return {
      error:
        res.error === 'no_key'
          ? t(locale, 'actions.aiUnavailable')
          : `${t(locale, 'actions.aiFailedToRead')} ${res.error}`,
    }

  const { aiToFields } = await import('@/lib/ratecon-ai-contract')
  const fields = aiToFields(res.fields, res.model)
  return createLoadFromRc(truckId, toQrLoad(fields), docId, formatDriverInfo(fields))
}

/** Status can also be set here (not just via markPaid's "Отметить оплаченным"
 * button) — 'paid' and 'delivered' must still keep paid_at in sync either way, or a
 * load can end up "paid" by status but invisible on the AR page's Оплачено tab
 * (which goes by paid_at), exactly the split state that happened before this. */
/** Which of the two delivery documents a load already has. */
async function deliveryDocs(loadId: number): Promise<{ bol: boolean; pod: boolean }> {
  const rows = (await sql`
    SELECT DISTINCT kind FROM documents WHERE load_id = ${loadId} AND kind IN ('bol', 'pod')`) as {
    kind: string
  }[]
  const kinds = new Set(rows.map((r) => r.kind))
  return { bol: kinds.has('bol'), pod: kinds.has('pod') }
}

export async function setStatus(id: number, status: LoadStatus): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  // «Доставлен» больше НЕ требует бумаг. Груз доставлен в тот момент, когда водитель
  // его сдал, — а POD приходит фотографией через час-два, и всё это время статус врал.
  // Вместо запрета на странице груза висит постоянный баннер о недостающих BOL/POD
  // (components/missing-docs-banner.tsx), а список грузов помечает такой груз.
  //
  // «Оплачен» проверку сохраняет: это уже про деньги, и пакет для счёта (lib/invoice.ts)
  // без POD собрать нельзя — там запрет не раздражает, а спасает.
  if (status === 'paid') {
    const d = await deliveryDocs(id)
    if (!d.bol || !d.pod) {
      const missing = [!d.bol ? 'BOL' : null, !d.pod ? 'POD' : null].filter(Boolean).join(' + ')
      return { error: t(await getLocale(), 'actions.paidNeedsDocs').replace('{missing}', missing) }
    }
  }
  await sql`
    UPDATE loads SET status = ${status},
      paid_at = CASE WHEN ${status} = 'paid' THEN COALESCE(paid_at, now())
                     WHEN paid_at IS NOT NULL THEN NULL
                     ELSE paid_at END
    WHERE id = ${id} AND company_id = ${await companyScope()}`
  revalidatePath(`/loads/${id}`)
  revalidatePath('/loads')
  revalidatePath('/invoices')
  revalidatePath('/')
  revalidatePath('/trucks', 'layout')
}

/** Truck identity (number + driver) plus its economics — everything a truck is. */
export type TruckInput = TruckSettings & { number: string; driverName: string }

export async function saveTruck(
  id: number,
  t: TruckInput,
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const denied = await assertCan('edit_trucks')
  if (denied) return denied
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
      WHERE id = ${id} AND company_id = ${await companyScope()}`
  } catch (e) {
    return { error: humanError(e, await getLocale()) }
  }
  // Blunt on purpose: a truck's settings feed calcLoad on every page that shows its
  // money. Enumerating them is more code, and one forgotten path means silently
  // wrong numbers.
  revalidatePath('/', 'layout')
}

/** Manual availability: 'active' clears the flag, 'repair'/'vacation' set it. An
 * unavailable truck is badged across the app and excluded from "свободно" counts. */
export async function setTruckAvailability(
  truckId: number,
  status: 'active' | 'repair' | 'vacation',
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const denied = await assertCan('edit_trucks')
  if (denied) return denied
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(await getLocale(), 'actions.truckNotFound') }
  await sql`UPDATE trucks SET unavailable = ${status === 'active' ? null : status} WHERE id = ${truckId}`
  revalidatePath('/', 'layout')
}

/* ---------- Documents ---------- */

const MAX_DOC_BYTES = 8 * 1024 * 1024

/** Vision-classify an uploaded document (base64) into a doc kind before deciding what to do
 * with it — so a BOL dropped on the truck card is filed as a BOL, not force-labelled a rate
 * con. Degrades to 'other' with no AI key; never throws. */
export async function classifyDoc(base64: string, mime: string, filename?: string): Promise<DocClass> {
  const { classifyDocument } = await import('@/lib/ai-doc')
  return classifyDocument(base64, mime, filename)
}

/**
 * FormData: file, kind, title?, truckId?, loadId?, maintenanceId?. Returns the new
 * id so the RC import can attach the document to the load it creates a moment later.
 */
export async function uploadDocument(
  fd: FormData,
): Promise<{ id: number } | { error: string }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: t(locale, 'actions.noFileSelected') }
  if (file.size > MAX_DOC_BYTES) return { error: t(locale, 'actions.fileOver8mb') }

  const kind = String(fd.get('kind') || 'other')
  const title = String(fd.get('title') || '').trim() || file.name
  const truckId = fd.get('truckId') ? Number(fd.get('truckId')) : null
  const loadId = fd.get('loadId') ? Number(fd.get('loadId')) : null
  const maintenanceId = fd.get('maintenanceId') ? Number(fd.get('maintenanceId')) : null
  const companyId = await companyScope()
  if (truckId && !(await truckBelongs(companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }
  if (loadId && !(await loadBelongs(companyId, loadId))) return { error: t(locale, 'actions.loadNotFound') }
  // Hex round-trip: Neon's HTTP driver JSON-encodes params, raw bytes don't survive.
  const hex = Buffer.from(await file.arrayBuffer()).toString('hex')

  try {
    const rows = await sql`
      INSERT INTO documents (truck_id, load_id, maintenance_id, kind, title, mime, size_bytes, data, company_id)
      VALUES (${truckId}, ${loadId}, ${maintenanceId}, ${kind}, ${title},
              ${file.type || 'application/octet-stream'}, ${file.size}, decode(${hex}, 'hex'), ${companyId})
      RETURNING id`
    revalidatePath('/docs')
    if (truckId) revalidatePath(`/trucks/${truckId}`)
    if (loadId) revalidatePath(`/loads/${loadId}`)
    // A dispatcher only ever has POD/BOL/rate con, never an "invoice" of their own —
    // the invoice is generated FROM the POD, so once it lands there's no manual step.
    if (loadId && kind === 'pod') await autoInvoiceIfReady(companyId, loadId)
    return { id: (rows[0] as { id: number }).id }
  } catch (e) {
    return { error: humanError(e, locale) }
  }
}

export async function attachDocumentToLoad(docId: number, loadId: number): Promise<void> {
  const ro = await demoReadOnly()
  if (ro) return
  const companyId = await companyScope()
  if (!(await docBelongs(companyId, docId)) || !(await loadBelongs(companyId, loadId))) return
  const rows = await sql`
    UPDATE documents SET load_id = ${loadId} WHERE id = ${docId} AND load_id IS NULL RETURNING kind`
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/docs')
  if ((rows[0] as { kind: string } | undefined)?.kind === 'pod') await autoInvoiceIfReady(companyId, loadId)
}

/** audit_log/logins have no company column of their own — they're keyed by a free-
 * text "who" name, not a row a company_id filter could attach to. So instead of
 * filtering the real Журнал for demo noise, we simply never write it: a demo
 * session's deletes have no audit value for the real business, and the DEMO
 * companyId check here is what keeps "Демо" out of it entirely. */
async function auditDelete(
  companyId: 'default' | 'demo',
  who: string,
  action: string,
  target: string,
  docKind: string | null,
  fromLoc: string | null,
  toLoc: string | null,
): Promise<void> {
  if (companyId === 'demo') return
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || null
  const { ipCity } = await import('@/lib/geo-routing')
  const city = await ipCity(ip)
  await sql`
    INSERT INTO audit_log (who, action, target, doc_kind, from_loc, to_loc, ip, user_agent, city)
    VALUES (${who.trim()}, ${action}, ${target}, ${docKind}, ${fromLoc}, ${toLoc}, ${ip}, ${h.get('user-agent')}, ${city})`
}

/**
 * "Deleting" a document only moves it to the trash (deleted_at) — the file itself
 * stays put until purgeDocument removes it for real. Guarded by the signed-in user's
 * own password, audited (who, what, the load route) — shown in the Журнал.
 */
export async function deleteDocument(id: number, password: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await verifyMyPassword(password, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await docBelongs(check.user.companyId, id))) return { error: t(locale, 'actions.docNotFound') }

  try {
    const rows = (await sql`
      SELECT d.title, d.kind, l.origin, l.destination
      FROM documents d LEFT JOIN loads l ON l.id = d.load_id
      WHERE d.id = ${id} AND d.deleted_at IS NULL`) as {
      title: string
      kind: string
      origin: string | null
      destination: string | null
    }[]
    const doc = rows[0]
    if (!doc) return { error: t(locale, 'actions.docNotFound') }

    await sql`UPDATE documents SET deleted_at = now() WHERE id = ${id}`
    await auditDelete(check.user.companyId, who, 'delete_document', doc.title, doc.kind, doc.origin, doc.destination)
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath('/docs')
  revalidatePath('/logins')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/loads', 'layout')
}

/** Pull a document back out of the trash — the safe direction, no PIN needed. */
export async function restoreDocument(id: number): Promise<void> {
  const ro = await demoReadOnly()
  if (ro) return
  const companyId = await companyScope()
  if (!(await docBelongs(companyId, id))) return
  await sql`UPDATE documents SET deleted_at = NULL WHERE id = ${id}`
  revalidatePath('/docs')
  revalidatePath('/trucks', 'layout')
  revalidatePath('/loads', 'layout')
}

/** Erases a trashed document for real — same name + PIN guard as the soft delete,
 * since this direction can't be undone. */
export async function purgeDocument(id: number, password: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await verifyMyPassword(password, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await docBelongs(check.user.companyId, id))) return { error: t(locale, 'actions.docNotInTrash') }

  try {
    const rows = (await sql`
      SELECT d.title, d.kind, l.origin, l.destination
      FROM documents d LEFT JOIN loads l ON l.id = d.load_id
      WHERE d.id = ${id} AND d.deleted_at IS NOT NULL`) as {
      title: string
      kind: string
      origin: string | null
      destination: string | null
    }[]
    const doc = rows[0]
    if (!doc) return { error: t(locale, 'actions.docNotInTrash') }

    await sql`DELETE FROM documents WHERE id = ${id}`
    await auditDelete(check.user.companyId, who, 'purge_document', doc.title, doc.kind, doc.origin, doc.destination)
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath('/docs')
  revalidatePath('/logins')
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
  brokerName: string | null
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
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!(p.rate >= 0)) return { error: t(locale, 'actions.rateNegative') }
  if (!(p.loadedMiles > 0)) return { error: t(locale, 'actions.loadedMilesPositive') }
  if (!(p.deadheadMiles >= 0)) return { error: t(locale, 'actions.deadheadNegative') }
  if (!(p.transitDays > 0)) return { error: t(locale, 'actions.transitDaysPositive') }
  if (p.spotRpm != null && !(p.spotRpm >= 0)) return { error: t(locale, 'actions.spotRateNegative') }
  try {
    await sql`UPDATE loads SET
      rate = ${p.rate}, loaded_miles = ${p.loadedMiles}, deadhead_miles = ${p.deadheadMiles},
      transit_days = ${p.transitDays}, spot_rpm = ${p.spotRpm},
      broker_name = ${p.brokerName || null},
      broker_mc = ${p.brokerMc || null}, broker_phone = ${p.brokerPhone || null},
      broker_email = ${p.brokerEmail || null}, pickup_date = ${p.pickupDate || null},
      delivery_date = ${p.deliveryDate || null}
      WHERE id = ${loadId} AND company_id = ${await companyScope()}`
  } catch (e) {
    return { error: humanError(e, locale) }
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
  const ro = await demoReadOnly()
  if (ro) return ro
  try {
    await sql`UPDATE loads SET broker_notes = ${notes.trim() || null}
      WHERE id = ${loadId} AND company_id = ${await companyScope()}`
  } catch (e) {
    return { error: humanError(e, await getLocale()) }
  }
  revalidatePath(`/loads/${loadId}`)
}

/** Translates a load's broker notes (Russian dispatcher, English rate cons). */
export async function translateBrokerNotes(
  text: string,
  targetLang: 'ru' | 'en',
): Promise<{ text: string } | { error: string }> {
  const locale = await getLocale()
  if (!text.trim()) return { error: t(locale, 'actions.emptyText') }
  const { translatePlainText } = await import('@/lib/ratecon-gemini')
  const res = await translatePlainText(text, targetLang === 'ru' ? 'Russian' : 'English')
  if ('error' in res)
    return {
      error:
        res.error === 'no_key' ? t(locale, 'actions.aiUnavailable') : `${t(locale, 'actions.translateFailed')} ${res.error}`,
    }
  return res
}

/** Dispatcher acknowledged the broker notes — stops highlighting them. */
export async function markNotesRead(loadId: number): Promise<void> {
  const ro = await demoReadOnly()
  if (ro) return
  await sql`UPDATE loads SET notes_read_at = now()
    WHERE id = ${loadId} AND company_id = ${await companyScope()} AND notes_read_at IS NULL`
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
  const ro = await demoReadOnly()
  if (ro) return ro
  const companyId = await companyScope()
  const locale = await getLocale()
  if (!(await loadBelongs(companyId, loadId))) return { error: t(locale, 'actions.loadNotFound') }
  // Postgres base64 comes newline-wrapped (PEM style); Gemini's decoder rejects the
  // newlines, so strip them.
  const docs = (await sql`
    SELECT replace(encode(data, 'base64'), E'\n', '') AS b64, mime
    FROM documents WHERE load_id = ${loadId} AND company_id = ${companyId} AND kind = 'ratecon'
    ORDER BY uploaded_at DESC LIMIT 1`) as { b64: string; mime: string }[]
  const doc = docs[0]
  if (!doc) return { error: t(locale, 'actions.noRcAttached') }

  const { geminiExtract } = await import('@/lib/ratecon-gemini')
  const res = await geminiExtract({ pdfBase64: doc.b64, mime: doc.mime })
  if ('error' in res)
    return {
      error:
        res.error === 'no_key' ? t(locale, 'actions.aiUnavailable') : `${t(locale, 'actions.recognizeFailed')} ${res.error}`,
    }

  const { aiToFields } = await import('@/lib/ratecon-ai-contract')
  const fields = aiToFields(res.fields, res.model)
  const load = toQrLoad(fields)
  const driverInfo = formatDriverInfo(fields)

  try {
    // COALESCE у реквизитов брокера, а не присваивание: у груза, заведённого с DAT по
    // QR, брокер приходит одним названием без MC и почты, и рейт-кон — единственное
    // место, где они есть. Но если диспетчер уже поправил их руками, перезаписывать
    // нельзя, поэтому дописываем только пустые.
    await sql`UPDATE loads SET
      broker_notes = ${load.brokerNotes}, notes_read_at = NULL,
      transit_days = ${load.transitDays},
      pickup_date = ${load.pickupDate}, delivery_date = ${load.deliveryDate},
      pickup_time = ${load.pickupTime}, delivery_time = ${load.deliveryTime},
      pickup_address = ${load.pickupAddress}, delivery_address = ${load.deliveryAddress},
      broker_name = COALESCE(broker_name, ${load.brokerName}),
      broker_mc = COALESCE(broker_mc, ${load.brokerMc}),
      broker_phone = COALESCE(broker_phone, ${load.brokerPhone}),
      broker_email = COALESCE(broker_email, ${load.brokerEmail}),
      reference_id = COALESCE(reference_id, ${load.referenceId}),
      pay_via = COALESCE(pay_via, ${load.payVia}),
      driver_info = ${driverInfo}
      WHERE id = ${loadId} AND company_id = ${companyId}`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/trucks', 'layout')
  revalidatePath('/', 'layout')
  return { ok: true, found: !!load.brokerNotes }
}

/**
 * Delete a load. Guarded like document deletion (the user's own password → audit row
 * in the Журнал). Its documents are kept but detached, so the paperwork stays in the
 * library instead of blocking the delete on the foreign key.
 */
export async function deleteLoad(id: number, password: string): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await verifyMyPassword(password, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await loadBelongs(check.user.companyId, id))) return { error: t(locale, 'actions.loadNotFound') }

  try {
    const rows = (await sql`SELECT origin, destination FROM loads WHERE id = ${id}`) as {
      origin: string | null
      destination: string | null
    }[]
    const load = rows[0]
    if (!load) return { error: t(locale, 'actions.loadNotFound') }

    await sql`UPDATE documents SET load_id = NULL WHERE load_id = ${id}`
    await sql`DELETE FROM loads WHERE id = ${id}`

    const route = [load.origin, load.destination].filter(Boolean).join(' → ') || `#${id}`
    await auditDelete(check.user.companyId, who, 'delete_load', route, null, load.origin, load.destination)
  } catch (e) {
    return { error: humanError(e, locale) }
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
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!m.title.trim()) return { error: t(locale, 'actions.sayWhatWasDone') }
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
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
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
}

export async function deleteMaintenance(
  id: number,
  truckId: number,
  password: string,
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await verifyMyPassword(password, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await truckBelongs(check.user.companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }

  const rows = (await sql`
    SELECT title FROM truck_maintenance WHERE id = ${id} AND truck_id = ${truckId}`) as { title: string }[]
  if (!rows[0]) return { error: t(locale, 'actions.entryNotFound') }

  await sql`DELETE FROM truck_maintenance WHERE id = ${id}`
  await auditDelete(check.user.companyId, who, 'delete_maintenance', rows[0].title, null, null, null)
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/logins')
}

export async function addTodo(
  truckId: number,
  title: string,
  priority: 'low' | 'normal' | 'urgent',
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!title.trim()) return { error: t(locale, 'actions.sayWhatToFix') }
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
  try {
    await sql`INSERT INTO truck_todos (truck_id, title, priority)
              VALUES (${truckId}, ${title.trim()}, ${priority})`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
}

export async function toggleTodo(id: number, truckId: number): Promise<void> {
  const ro = await demoReadOnly()
  if (ro) return
  if (!(await truckBelongs(await companyScope(), truckId))) return
  await sql`UPDATE truck_todos
            SET done_at = CASE WHEN done_at IS NULL THEN now() ELSE NULL END
            WHERE id = ${id} AND truck_id = ${truckId}`
  revalidatePath(`/trucks/${truckId}`)
}

export async function deleteTodo(
  id: number,
  truckId: number,
  password: string,
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const check = await verifyMyPassword(password, locale)
  if ('error' in check) return { error: check.error }
  const who = check.user.name || t(locale, 'actions.dispatcherFallback')
  if (!(await truckBelongs(check.user.companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }

  const rows = (await sql`SELECT title FROM truck_todos WHERE id = ${id} AND truck_id = ${truckId}`) as { title: string }[]
  if (!rows[0]) return { error: t(locale, 'actions.entryNotFound') }

  await sql`DELETE FROM truck_todos WHERE id = ${id}`
  await auditDelete(check.user.companyId, who, 'delete_todo', rows[0].title, null, null, null)
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/logins')
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
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
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
    return { error: humanError(e, locale) }
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
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  const file = fd.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: t(locale, 'actions.noFileSelected') }
  if (file.size > MAX_PHOTO_BYTES) return { error: t(locale, 'actions.fileOver4mb') }
  if (!file.type.startsWith('image/')) return { error: t(locale, 'actions.needImage') }
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }

  const hex = Buffer.from(await file.arrayBuffer()).toString('hex')
  try {
    await sql`
      INSERT INTO truck_meta (truck_id, driver_photo, driver_photo_mime)
      VALUES (${truckId}, decode(${hex}, 'hex'), ${file.type})
      ON CONFLICT (truck_id) DO UPDATE SET
        driver_photo      = EXCLUDED.driver_photo,
        driver_photo_mime = EXCLUDED.driver_photo_mime`
  } catch (e) {
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/trucks')
  revalidatePath('/', 'layout')
}

export async function saveTruckMeta(
  truckId: number,
  m: TruckMetaInput,
): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const locale = await getLocale()
  if (!(await truckBelongs(await companyScope(), truckId))) return { error: t(locale, 'actions.truckNotFound') }
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
    return { error: humanError(e, locale) }
  }
  revalidatePath(`/trucks/${truckId}`)
  revalidatePath('/')
}

export async function addTruck(t: TruckInput): Promise<{ error: string } | void> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const cpm = t.driverPay.mode === 'cpm' ? t.driverPay.centsPerMile : null
  const pct = t.driverPay.mode === 'percent' ? t.driverPay.percentOfGross : null
  let id: number
  try {
    const rows = await sql`
      INSERT INTO trucks (name, number, driver_name, mpg, fuel_price_per_gallon,
                          driver_pay_mode, driver_cents_per_mile, driver_percent_of_gross,
                          truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                          maintenance_cost_per_mile, factoring_percent, dispatch_percent, company_id)
      VALUES (${t.number || 'Трак'}, ${t.number}, ${t.driverName}, ${t.mpg},
              ${t.fuelPricePerGallon}, ${t.driverPay.mode}, ${cpm}, ${pct},
              ${t.truckPaymentPerDay}, ${t.insurancePerDay}, ${t.eldPermitsPerDay},
              ${t.maintenanceCostPerMile}, ${t.factoringPercent}, ${t.dispatchPercent}, ${await companyScope()})
      RETURNING id`
    id = (rows[0] as { id: number }).id
  } catch (e) {
    return { error: humanError(e, await getLocale()) }
  }
  revalidatePath('/trucks')
  redirect(`/trucks/${id}`)
}
/** Trip history for one truck over a window, so the /trucks/[id] panel can switch
 * 24h/3d/7d WITHOUT a page navigation. It used to be three <Link>s carrying ?history=,
 * which re-rendered the entire truck page — map, loads, documents and all — to replace
 * one list, and since app/loading.tsx added a route-level Suspense boundary that swap
 * also flashed a full-page skeleton. */
export async function truckTripHistory(
  truckId: number,
  hours: number,
): Promise<{ legs: HistoryLeg[] } | { error: string }> {
  const companyId = await companyScope()
  const locale = await getLocale()
  if (!(await truckBelongs(companyId, truckId))) return { error: t(locale, 'actions.truckNotFound') }
  // Only the three windows the UI offers — an arbitrary number here would let a caller
  // ask for a year of points, and the table is pruned to 7 days anyway (lib/eld.ts).
  if (![24, 72, 168].includes(hours)) return { error: t(locale, 'actions.truckNotFound') }
  const rows = (await sql`SELECT number FROM trucks WHERE id = ${truckId}`) as { number: string | null }[]
  const unit = rows[0]?.number
  if (!unit) return { legs: [] }
  const { tripHistory } = await import('@/lib/eld')
  return { legs: await tripHistory(unit, hours) }
}

/** Title and mime of one document, so a viewer can open in a modal instead of a page.
 * Never returns the bytes — those still go through /api/docs/[id], which streams them
 * with its own company check and caching. */
export async function docMeta(id: number): Promise<{ title: string; mime: string } | { error: string }> {
  const companyId = await companyScope()
  const locale = await getLocale()
  if (!(await docBelongs(companyId, id))) return { error: t(locale, 'actions.docNotFound') }
  const rows = (await sql`SELECT title, mime FROM documents WHERE id = ${id}`) as {
    title: string
    mime: string
  }[]
  const row = rows[0]
  return row ? { title: row.title, mime: row.mime } : { error: t(locale, 'actions.docNotFound') }
}
