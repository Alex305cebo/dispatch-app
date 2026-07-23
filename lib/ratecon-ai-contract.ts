// Shared contract for AI rate-con parsing: prompt, JSON schema, and the mapping
// from the model's answer to RateConFields. One source of truth used by the API
// route (server), the client wrapper, and the batch-verification script — so the
// harness proves exactly what the app runs.

import type { Found, RateConFields, Stop } from './ratecon.ts'
import { t, type Locale } from './i18n.ts'

/** Try in order; 404 (renamed model) and 429 (quota) fall through to the next.
 * Ends on gemini-3.1-flash-lite on purpose — its free-tier daily cap (500/day) is far
 * above the others (20/day), so it's the one still standing after a heavy day. */
// Order is by MEASURED latency, not by version number, and it's the real fix for
// "rate con took forever / didn't recognise". Measured 2026-07-23 on a trivial prompt:
//   gemini-2.5-flash        0.7s   GA, reliable, plenty accurate for structured extract
//   gemini-3.1-flash-lite   0.5s   fast fallback
//   gemini-3-flash-preview  13s+   a preview build; on a real multi-page scan it was the
//                                  one hanging past 55s. Kept only as a last resort.
//   gemini-2.5-flash-lite   REMOVED — returned HTTP 404, a dead name that wasted a call
//                                  on every single parse.
// The per-model timeout in the route is the safety net; this ordering is the cure —
// the common case now answers in ~1s instead of waiting out a slow preview model.
export const AI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
]

export const AI_PROMPT = `You are reading a US trucking RATE CONFIRMATION document. Extract ONLY facts printed in the document. Never guess, never infer — use null for anything not present.

Rules:
- "stops" = every physical pickup (shipper) and delivery (consignee/receiver) stop, in trip order. The BROKER / logistics company in the letterhead and the CARRIER being paid are NEVER stops, even though their addresses are printed. A stop is where the truck loads or unloads freight.
- company = the facility/shipper name at that stop. street = street address line. city/state/zip from that stop's address. time = the date/appointment window EXACTLY as written (e.g. "07/15/26 12:00 Appt"). refs = pickup#/delivery#/PO/BOL/SID numbers belonging to that stop.
- rate = the TOTAL amount payable to the carrier for this load (line haul plus fuel surcharge if a total is printed). NEVER an insurance limit, declared value, or per-mile figure.
- loadedMiles only if a mileage/distance is printed.
- referenceId = the load/order number of this load. mcNumber = the MC number printed. brokerName/brokerPhone/brokerEmail = the broker's contact info.
- pickupDate = first pickup date as MM/DD/YYYY. deliveryDate = final delivery date as MM/DD/YYYY.
- weight like "42000 lbs" (keep the unit).
- importantNotes = EVERYTHING the dispatcher and driver MUST know or do for THIS load, gathered from the WHOLE document (pickup & delivery instructions, notes, special-requirements boxes). Output ONE FACT PER LINE, each line starting with EXACTLY ONE tag from this fixed list, tag first in square brackets: [SAFETY] PPE/TWIC requirements. [LOAD] load/unload type and detention terms (live load/unload, free hours, $/hr after). [SCHEDULE] appointment requirements and times per stop, how strict, layover fees. [CONTACT] who to call and when, with the actual phone number, e.g. "[CONTACT] Call 1 hour out from PU: LJ 919-760-9924". [REF] reference/PO/BOL/trailer/seal numbers to give at the gate. [DOCS] required paperwork or signatures (trailer interchange agreement, seal, POD with signature+stamp). [INSURANCE] cargo insurance or declared-value minimums. [PENALTY] fines and no-pay conditions. [WARNING] anything else that needs flagging (NO FAIL, event shipment, team, hazmat, temp/reefer setpoint, trailer shuffle). Skip a tag entirely if the document says nothing for it — do not pad. Each line is one short, clear instruction with the real numbers/phone numbers/dollar amounts exactly as printed. Do NOT invent — only what the document says. null if nothing noteworthy at all.`

/** Gemini responseSchema (OpenAPI subset, uppercase type names). */
export const AI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    stops: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          role: { type: 'STRING', enum: ['pickup', 'delivery'] },
          company: { type: 'STRING', nullable: true },
          street: { type: 'STRING', nullable: true },
          city: { type: 'STRING', nullable: true },
          state: { type: 'STRING', nullable: true },
          zip: { type: 'STRING', nullable: true },
          time: { type: 'STRING', nullable: true },
          refs: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['role'],
      },
    },
    rate: { type: 'NUMBER', nullable: true },
    loadedMiles: { type: 'NUMBER', nullable: true },
    referenceId: { type: 'STRING', nullable: true },
    commodity: { type: 'STRING', nullable: true },
    weight: { type: 'STRING', nullable: true },
    brokerName: { type: 'STRING', nullable: true },
    mcNumber: { type: 'STRING', nullable: true },
    brokerPhone: { type: 'STRING', nullable: true },
    brokerEmail: { type: 'STRING', nullable: true },
    pickupDate: { type: 'STRING', nullable: true },
    deliveryDate: { type: 'STRING', nullable: true },
    importantNotes: { type: 'STRING', nullable: true },
  },
  required: ['stops'],
}

export type AiStop = {
  role: 'pickup' | 'delivery'
  company?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  time?: string | null
  refs?: string[]
}

export type AiFields = {
  stops: AiStop[]
  rate?: number | null
  loadedMiles?: number | null
  referenceId?: string | null
  commodity?: string | null
  weight?: string | null
  brokerName?: string | null
  mcNumber?: string | null
  brokerPhone?: string | null
  brokerEmail?: string | null
  pickupDate?: string | null
  deliveryDate?: string | null
  importantNotes?: string | null
}

const found = <T>(value: T | null | undefined, evidence: string): Found<T> | null =>
  value === null || value === undefined || value === ('' as unknown) ? null : { value, evidence }

function stopBlock(s: AiStop | undefined): Stop {
  if (!s) return { block: null, time: null, ref: null }
  const cityLine = [s.city, s.state, s.zip].filter(Boolean).join(', ').replace(/, (\d)/, ' $1')
  const block = [s.company, s.street, cityLine].filter(Boolean).join('\n') || null
  return {
    block,
    time: s.time ?? null,
    ref: s.refs?.length ? s.refs.join('\n') : null,
  }
}

const cityOf = (s: AiStop | undefined): string | null =>
  s?.city && s.state ? `${s.city}, ${s.state}` : null

/** Plain, geocodable "1234 Industrial Pkwy, Greer, SC 29650" — no company name, unlike stopBlock. */
function addressLine(s: AiStop | undefined): string | null {
  if (!s?.street) return null
  const cityLine = [s.city, s.state, s.zip].filter(Boolean).join(', ').replace(/, (\d)/, ' $1')
  return [s.street, cityLine].filter(Boolean).join(', ') || null
}

/** "07/15/2026" → "2026-07-15" for <input type=date>; passes ISO through. */
function toIso(d: string | null | undefined): string | null {
  if (!d) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  const [, mm, dd, yy] = m.map(Number) as unknown as number[]
  const year = yy! < 100 ? 2000 + yy! : yy!
  if (mm! < 1 || mm! > 12 || dd! < 1 || dd! > 31) return null
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/** Map the model's JSON to the exact shape the whole import UI already speaks. */
export function aiToFields(ai: AiFields, model: string, locale: Locale = 'en'): RateConFields {
  const ev = t(locale, 'rateconAiContract.recognizedByAi').replace('{model}', model)
  const pickups = ai.stops.filter((s) => s.role === 'pickup')
  const deliveries = ai.stops.filter((s) => s.role === 'delivery')
  // RateConFields carries one pickup and one delivery: first pickup, LAST delivery —
  // the trip's two ends. Intermediate stops ride along in the refs the model returns.
  const pu = pickups[0] ?? ai.stops[0]
  const del = deliveries[deliveries.length - 1] ?? ai.stops[ai.stops.length - 1]

  return {
    rate: found(ai.rate, ev),
    loadedMiles: found(ai.loadedMiles, ev),
    origin: found(cityOf(pu), ev),
    destination: found(cityOf(del), ev),
    mcNumber: found(ai.mcNumber, ev),
    brokerPhone: found(ai.brokerPhone, ev),
    brokerEmail: found(ai.brokerEmail, ev),
    referenceId: found(ai.referenceId, ev),
    pickupDate: found(toIso(ai.pickupDate), ev),
    deliveryDate: found(toIso(ai.deliveryDate), ev),
    commodity: found(ai.commodity, ev),
    weight: found(ai.weight, ev),
    pickupStop: stopBlock(pu),
    deliveryStop: stopBlock(del),
    importantNotes: found(ai.importantNotes, ev),
    pickupAddress: found(addressLine(pu), ev),
    deliveryAddress: found(addressLine(del), ev),
  }
}

/** AI answer wins wherever it found something; regex fills what the model left null. */
export function mergeAi(base: RateConFields, ai: RateConFields): RateConFields {
  const stop = (a: Stop, b: Stop): Stop => ({
    block: a.block ?? b.block,
    time: a.time ?? b.time,
    ref: a.ref ?? b.ref,
  })
  return {
    rate: ai.rate ?? base.rate,
    loadedMiles: ai.loadedMiles ?? base.loadedMiles,
    origin: ai.origin ?? base.origin,
    destination: ai.destination ?? base.destination,
    mcNumber: ai.mcNumber ?? base.mcNumber,
    brokerPhone: ai.brokerPhone ?? base.brokerPhone,
    brokerEmail: ai.brokerEmail ?? base.brokerEmail,
    referenceId: ai.referenceId ?? base.referenceId,
    pickupDate: ai.pickupDate ?? base.pickupDate,
    deliveryDate: ai.deliveryDate ?? base.deliveryDate,
    commodity: ai.commodity ?? base.commodity,
    weight: ai.weight ?? base.weight,
    pickupStop: stop(ai.pickupStop, base.pickupStop),
    deliveryStop: stop(ai.deliveryStop, base.deliveryStop),
    importantNotes: ai.importantNotes ?? base.importantNotes,
    pickupAddress: ai.pickupAddress ?? base.pickupAddress,
    deliveryAddress: ai.deliveryAddress ?? base.deliveryAddress,
  }
}
