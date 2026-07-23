// Rate confirmation parser — plain regex, no LLM, no network, no cost.
//
// A broker's rate con is a generated PDF: it contains real text, so there is
// nothing to recognize. This turns that text into load fields.
//
// Two rules learned from real documents, both load-bearing:
//
// 1. MATCH ONLY ON EXPLICIT LABELS. Never "take the biggest dollar amount" — rate
//    cons quote insurance limits ($100,000) and declared values. A guessed rate is
//    worse than a missing one: a missing one gets typed in, a guessed one gets
//    trusted.
// 2. EVERY BROKER'S TEMPLATE IS DIFFERENT. Real samples showed "PAYABLE 1,600.00
//    USD" (Five Star), "Totals USD$ 4,000.00" (FLS), two-letter states AND states
//    spelled out ("South Dakota"), and one document with no mileage at all. When a
//    new broker shows up, expect to add a label here — that is the trade for free.

import { EMPTY, type QrLoad } from './qr-load.ts'
import { normalizeApptTime } from './fmt.ts'

/** A parsed value plus the source line it came from — shown so the human can check. */
export type Found<T> = { value: T; evidence: string }

/** One stop, kept as written in the document — this is what the driver reads. */
export type Stop = {
  /** Company + street lines, verbatim ("SEA GARDEN CITY-ECOMM\n140 Prosperity Dr\nGarden City, GA 31408"). */
  block: string | null
  /** "07/15/26 | 12:00 Appt." — copied as-is; the driver wants the appointment, not ISO. */
  time: string | null
  /** "Pickup#: 18999631" */
  ref: string | null
}

export type RateConFields = {
  rate: Found<number> | null
  loadedMiles: Found<number> | null
  origin: Found<string> | null
  destination: Found<string> | null
  mcNumber: Found<string> | null
  brokerPhone: Found<string> | null
  brokerEmail: Found<string> | null
  referenceId: Found<string> | null
  pickupDate: Found<string> | null
  deliveryDate: Found<string> | null
  commodity: Found<string> | null
  weight: Found<string> | null
  pickupStop: Stop
  deliveryStop: Stop
  /** AI-only briefing (detention, contacts, appointments, fines…). Regex can't reliably lift this from free text. */
  importantNotes: Found<string> | null
  /**
   * Full street address ("1234 Industrial Pkwy, Greer, SC 29650") for the map pin —
   * origin/destination above are city-level and don't pin an exact location. AI-only:
   * the regex parser can't reliably split a street line out of a stop block.
   */
  pickupAddress: Found<string> | null
  deliveryAddress: Found<string> | null
}

const ABBR = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC'

const FULL_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
}

const FULL = Object.keys(FULL_NAMES).sort((a, b) => b.length - a.length).join('|')

// Two patterns, deliberately different in case-sensitivity:
//  - Abbreviations stay case-SENSITIVE. With /i, "…customer, in Texas" makes "in"
//    the state Indiana, and "or"/"me"/"hi" are states too — English words all.
//  - Full names need /i ("South Dakota", "SOUTH DAKOTA"), so the city half is
//    validated separately by mustStartUpper below.
const CITY_ABBR = new RegExp(String.raw`([A-Z][A-Za-z.'\- ]{1,26}),\s*(${ABBR})\b`, 'g')
const CITY_FULL = new RegExp(String.raw`([A-Za-z][A-Za-z.'\- ]{1,26}),\s*(${FULL})\b`, 'gi')

// A real document turned "…Current Type TENDER LOAD ELGIN, IL" into the city
// "urrent Type TENDER LOAD ELGIN" — a city never starts mid-word.
const startsUpper = (s: string) => /^[A-Z]/.test(s)

// The single most reliable address signal across brokers: "City ST ZIP" with the
// comma OPTIONAL. Many brokers write "SUN VALLEY CA 91352" — no comma. The 5-digit
// ZIP right after a real 2-letter state is what lets us drop the comma safely; a
// bare "City ST" without a zip still needs its comma (below) to avoid noise.
const CITY_ZIP = new RegExp(String.raw`([A-Z][A-Za-z.'\- ]{1,26}?)[, ]\s*(${ABBR})\s+\d{5}(?:-\d{4})?(?!\d)`, 'g')

/** Any accepted "City ST[ ZIP]" form present? Used to validate address blocks. */
function hasCity(s: string): boolean {
  CITY_ZIP.lastIndex = 0
  return (
    CITY_ZIP.test(s) ||
    new RegExp(String.raw`,\s*(?:${ABBR})\b`).test(s) ||
    new RegExp(String.raw`,\s*(?:${FULL})\b`, 'i').test(s)
  )
}

function normalize(text: string): string {
  return text
    .replace(/\r/g, '')
    // Watermarks and odd encodings inject control bytes mid-line ("TOTAL RATE
    // <STX> 4800.00"), which silently break every label→value pattern. Strip all
    // control chars except newline and tab, then collapse runs of spaces.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
}

function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index) + 1
  const end = text.indexOf('\n', index)
  return text.slice(start, end === -1 ? undefined : end).trim().slice(0, 120)
}

function search<T>(
  text: string,
  patterns: RegExp[],
  pick: (m: RegExpMatchArray) => T | null,
): Found<T> | null {
  for (const re of patterns) {
    // Walk EVERY match: `pick` rejects false positives, and a rejected first hit
    // must not hide a valid second one.
    // 'd' gives capture-group indices — a label pattern starts at the label, but the
    // line worth quoting is where the captured value sits.
    const all = new RegExp(re.source, re.flags.replace(/[gd]/g, '') + 'gd')
    for (const m of text.matchAll(all)) {
      const value = pick(m)
      if (value === null) continue
      const at = m.indices?.[1]?.[0] ?? m.indices?.[0]?.[0] ?? m.index
      if (at === undefined) continue
      return { value, evidence: lineAround(text, at) }
    }
  }
  return null
}

const money = (s: string): number | null => {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

// Ordered by trust, not by position. A doc with both "LineHaul" and "Totals" means
// the total, wherever each sits. `(?:USD)?\s*\$?` covers "$4,000.00", "USD$ 4,000.00"
// and "1,600.00 USD" alike.
// Ordered by TRUST, and search() returns the first pattern that hits anywhere — so
// "Total Rate" (tier A) always beats "Line Haul" (tier E) even when line haul is
// printed first. The `$` is optional on the strong labels because many brokers omit
// it ("TOTAL RATE 4800.00"); that's safe because the label is specific — an
// insurance limit reads "cargo insurance of $100,000", never "TOTAL RATE 100000".
// AMOUNT guard `\d[\d,]{2,}...|\d[\d,]*\.\d{2}` = ≥3 digits or has cents, so a stray
// "RATE 5" (a line number) can't win.
const AMOUNT = String.raw`(\d[\d,]{2,}(?:\.\d{2})?|\d[\d,]*\.\d{2})`
const RATE_LABELS = [
  // A. Total / carrier total — the definitive load pay.
  new RegExp(
    String.raw`(?:total\s*rate|rate\s*total|total\s*(?:pay|charges|amount)|carrier\s*(?:total|pay|rate|freight)|agreed\s*(?:upon\s*)?rate)\b[\s:\-]*(?:USD)?\s*\$?\s*${AMOUNT}`,
    'i',
  ),
  // B. "PAYABLE 1,600.00 USD" — Five Star / project44, no dollar sign at all.
  new RegExp(String.raw`\bpayable\b[\s:\-]*(?:USD)?\s*\$?\s*${AMOUNT}`, 'i'),
  // C. "Rate: $1,700.00" — colon AND $ required, so the "Rate Confirmation" heading
  //    and "Rate / mile $2.15" can't trigger it.
  /\brate\b\s*[:\-]\s*(?:USD)?\s*\$\s*([\d,]+(?:\.\d{2})?)/i,
  // D. Bare "Total"/"Totals" MUST carry a currency mark — without it this swallows
  //    "Declared Value Total 100,000" (an insurance limit). Covers "Totals USD$ 4,000.00".
  /\btotals?\b\s*[:\-]?\s*(?:USD\s*\$?|\$)\s*([\d,]+(?:\.\d{2})?)/i,
  // E. Line haul / flat rate / freight — least trusted, used only when no total exists.
  new RegExp(
    String.raw`(?:line\s*?haul(?:\s*rate)?|flat\s*rate|freight\s*(?:charges?|rate))\b[\s:\-]*(?:USD)?\s*\$?\s*${AMOUNT}`,
    'i',
  ),
]

const MILE_LABELS = [
  /(?:total\s*(?:distance|miles)|miles\s*total|loaded\s*miles|trip\s*miles|distance)\s*[:\-]?\s*([\d,]+)\s*(?:mi\b|miles\b)?/i,
  /\bmiles\s*[:\-]\s*([\d,]+)/i,
]

// Ordered by trust, NOT by position in the document. "Origin"/"Destination" are the
// route; "Shipper" also appears as a table header in the letterhead. Real docs also
// say "origin" inside legal boilerplate ("…delivered to broker's customer, in…"),
// which is exactly how a disclaimer became the pickup city.
// "…Address" first: one real sample has BOTH "Pick up Address:" (the actual stop)
// and "Ref: Pickup#: 18999631" inside that stop's reference block. Matching the
// bare "Pickup#" made the parser skip past the pickup and report the DELIVERY city
// as the origin — the two ends of the trip, silently swapped.
const ORIGIN_LABELS = [
  /pick\s*-?\s*up\s*address/gi,
  /\borigin\b/gi,
  /pick\s*-?\s*up\s*#/gi,
  /\bshipper\b/gi,
  /ship\s*from/gi,
]
const DEST_LABELS = [
  /deliver(?:y)?\s*address/gi,
  /\bdestination\b/gi,
  /deliver(?:y)?\s*#/gi,
  /\bconsignee\b/gi,
  /ship\s*to/gi,
  /\breceiver\b/gi,
]

// Words that are never a city but do sit in front of a comma + state-looking token.
const NOT_A_CITY = /\b(broker|customer|carrier|shipper|consignee|seal|trailer|invoice|address|contact|attn|inc|llc|corp)\b/i

/**
 * Find "City, ST" in a window AFTER a label. Windowing matters: real docs repeat the
 * broker's own address in the letterhead, and an unanchored city match grabs that
 * instead of the route.
 */
function cityAfter(text: string, labelSets: RegExp[]): Found<string> | null {
  for (const labels of labelSets) {
    for (const label of text.matchAll(labels)) {
      if (label.index === undefined) continue
      const from = label.index + label[0].length
      const window = text.slice(from, from + 240)

      // ZIP-anchored form first: it's the most reliable and covers comma-less docs.
      for (const pattern of [CITY_ZIP, CITY_ABBR, CITY_FULL]) {
        for (const m of window.matchAll(pattern)) {
          const raw = m[1]!.trim().replace(/\s+/g, ' ')
          if (!startsUpper(raw)) continue
          const st = FULL_NAMES[m[2]!.toLowerCase()] ?? m[2]!.toUpperCase()
          // Keep the last 3 words: labels and street lines run into the city
          // ("2002 SD HWY 314, YANKTON" → "YANKTON").
          const city = raw.split(' ').slice(-3).join(' ')
          if (NOT_A_CITY.test(city)) continue
          return { value: `${city}, ${st}`, evidence: lineAround(text, from + m.index!) }
        }
      }
    }
  }
  return null
}

const DIVIDER = String.raw`\n\s*[_\-–—]{3,}`

/**
 * Is this actually a mailing address, or did we just swallow half the document?
 *
 * Needed because layouts without divider rules (the project44 report) have nowhere
 * for a block to end: matching a "Shipper" table header dragged 50 lines of pallet
 * dimensions into the driver's instructions.
 */
function looksLikeAddress(block: string): boolean {
  const lines = block.split('\n').filter((l) => l.trim())
  if (lines.length === 0 || lines.length > 6 || block.length > 220) return false
  // A mailing address ENDS with the city — that's the load-bearing test, and it must
  // be the LAST line. Length alone isn't enough (a table yields plausible-looking
  // lines), and allowing the city one line up lets "PAYABLE 1,600.00 USD" or
  // "Pieces 620" ride along into the driver's message.
  return hasCity(lines[lines.length - 1]!)
}

/**
 * Cut a one-line stop off at its "City, ST" (optionally + ZIP), dropping whatever
 * trails it. A table row reads "WICHITA, KS US Pallets 16" — the driver needs
 * "WICHITA, KS", not the pallet count that happened to sit on the same line.
 */
function trimToCity(line: string): string | null {
  // Two forms, tried independently; the shorter valid cut wins so we stop right at
  // the city rather than run into whatever trails it.
  //  - ZIP form (comma optional): "SUN VALLEY CA 91352". Case-sensitive state so a
  //    lowercase word ("...office in 90210") can't pose as a state.
  //  - Comma form (zip optional): "WICHITA, KS", "YANKTON, South Dakota".
  const zip = line.match(
    new RegExp(String.raw`^[\s\S]*?[A-Za-z][A-Za-z.'\- ]{0,26}?[, ]\s*(?:${ABBR})\s+\d{5}(?:-\d{4})?(?!\d)`),
  )?.[0]
  const comma = line.match(
    new RegExp(String.raw`^[\s\S]*?[A-Za-z][A-Za-z.'\- ]{0,26},\s*(?:${ABBR}|${FULL})\b(?:\s+\d{5}(?:-\d{4})?(?!\d))?`, 'i'),
  )?.[0]
  const cands = [zip, comma].filter((s): s is string => !!s).map((s) => s.trim())
  return cands.sort((a, b) => a.length - b.length)[0] ?? null
}

/**
 * Pull a stop out VERBATIM. Deliberately not decomposed into name/street/zip: the
 * driver needs the address exactly as the broker wrote it, and every broker writes
 * it differently. Copying beats re-typing.
 */
function parseStop(text: string, labels: RegExp[], endLabels: RegExp): Stop {
  for (const label of labels) {
    for (const m of text.matchAll(label)) {
      if (m.index === undefined) continue
      const rest = text.slice(m.index + m[0].length).replace(/^\s*:?\s*\n?/, '')
      // Stop at the next stop's label, or after a sane window.
      const stopEnd = rest.search(endLabels)
      const section = rest.slice(0, stopEnd > 0 ? stopEnd : 700)

      // The address block runs until the first divider rule or the Time/Ref lines.
      const blockEnd = section.search(new RegExp(`${DIVIDER}|\\n\\s*(?:Time|Ref)\\s*:`, 'i'))
      const block = (blockEnd > 0 ? section.slice(0, blockEnd) : section).trim()
      // Reject rather than emit garbage: the caller falls back to the plain city,
      // which is short and right, instead of a page of table rows.
      if (!looksLikeAddress(block)) continue

      const timeM = section.match(/^\s*Time\s*:\s*(.+)$/im)
      // Ref spans several lines ("SID: …\nBOL: …\nPO: …") and is kept multi-line —
      // that's how the driver reads it. NOTE: no 'm' flag here. With it, `$` means
      // end-of-LINE and the capture stops at the first newline, silently dropping
      // every reference but the first.
      const refM = section.match(
        new RegExp(String.raw`\bRef\s*:\s*([\s\S]*?)(?=${DIVIDER}|\n\s*\n|$)`, 'i'),
      )

      return {
        block,
        time: timeM?.[1]?.trim() ?? null,
        ref: refM?.[1]?.trim() || null,
      }
    }
  }
  return { block: null, time: null, ref: null }
}

// Labels that mark a stop, used to classify anchor addresses. Kept broad — brokers
// name stops every possible way.
const STOP_PU = /\b(?:pick\s*-?\s*up|pickup|pick\b|\bpu\b|shipper|origin|ship\s*from|load(?:ing)?)\b/i
const STOP_DEL = /\b(?:deliver(?:y)?|consignee|receiver|destination|drop|ship\s*to|unload)\b/i

// A line that belongs to a spec table or a header, never to a mailing address.
const JUNK_LINE =
  /\b(?:pallet|lading|volume|density|pieces?|temperature|hazmat|equipment|linear|trailer|appt|appointment|eta|arrival|departure|seal|hours?|phone|contact|fax|status|shipping|carrier|dispatch|notes?|comments?|instruction|description|driver|cell|size|type|mode|reference|bol|dot|miles|charge|total|qty|pcs|class|nmfc|weight|stop\s*\d|freight)\b/i

// A leading stop label sits on the same line as the company in table layouts
// ("Origin ST. CHARLES TRADING, INC." → "ST. CHARLES TRADING, INC.").
const LEADING_LABEL =
  /^\s*(?:pick\s*-?\s*up(?:\s*address)?|pickup|shipper|origin|deliver(?:y)?(?:\s*address)?|consignee|receiver|destination|drop|stop\s*\d*|ship\s*(?:to|from))\s*#?\s*\d*\s*:?\s*/i

/** A short line that reads as a city — "SUN VALLEY CA 91352", not a whole table row. */
function isCityLine(line: string): boolean {
  // Judge the TRIMMED city, not the raw line: trailing junk after the zip ("SUN
  // VALLEY CA 91352 Seal # 3126460101") is cut by trimToCity, while a junk PREFIX
  // ("Current Type TENDER LOAD ELGIN, IL") survives and pushes the word count over
  // the cap — which is exactly how a letterhead row gets rejected.
  const t = trimToCity(line)
  return !!t && t.split(/\s+/).length <= 6
}

/** Normalize a block's last line to "City, ST" for geometry lookup. */
function cityOf(block: string | null): string | null {
  if (!block) return null
  const last = block.split('\n').filter(Boolean).pop() ?? ''
  CITY_ZIP.lastIndex = 0
  const z = CITY_ZIP.exec(last)
  if (z) return `${z[1]!.trim()}, ${z[2]!.toUpperCase()}`
  const a = last.match(new RegExp(String.raw`([A-Z][A-Za-z.'\- ]{1,26}),\s*(${ABBR})\b`))
  if (a) return `${a[1]!.trim()}, ${a[2]!.toUpperCase()}`
  return null
}

/**
 * Label-INDEPENDENT stop finder — the core of the new mechanism.
 *
 * Most brokers don't write "Shipper"/"Origin"; they just print the address. So anchor
 * on the one thing every US stop has — a "City ST ZIP" line — then grab the company
 * and street directly above it, and classify pickup vs delivery by the nearest stop
 * label, or by document order when there are no labels (first stop loads, last drops).
 */
function anchorStops(text: string): { pu: string | null; del: string | null } {
  const lines = text.split('\n').map((l) => l.trim())
  const stops: { block: string; cls: 'pu' | 'del' | null; i: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    // One-line LABELLED stop: "Pickup# 1: ACTUS NUTRITION 2002 SD HWY 314, YANKTON,
    // South Dakota" (FLS / Trinity). The whole address rides on the label line, so
    // the word-cap city test below would reject it — catch it here first.
    const oneLine = lines[i]!.match(
      /^(pick\s*-?\s*up|pickup|shipper|origin|deliver(?:y)?|consignee|receiver|drop|stop)\s*#?\s*\d*\s*:\s*(.+)$/i,
    )
    if (oneLine) {
      const block = trimToCity(oneLine[2]!)
      // Require a digit (a street number) so "Pickup#: 18999631" (a Ref) is skipped.
      if (block && looksLikeAddress(block) && /\d/.test(block)) {
        const cls = /deliv|consign|receiv|drop/i.test(oneLine[1]!) ? 'del' : 'pu'
        stops.push({ block, cls, i })
        continue
      }
    }

    if (!isCityLine(lines[i]!)) continue

    // Walk up: the line above a city is the street, the one above that the company.
    // Stop at a blank, a table row, another city, or a bare heading line.
    const parts: string[] = []
    for (let k = i - 1; k >= 0 && i - k <= 3 && parts.length < 2; k--) {
      const l = lines[k]!
      // Any boundary — blank, another stop's city, a table/appointment row (junk
      // word, a date, a HH:MM window, an over-long line), or a bare heading — ends
      // the block. A clean street+city beats one padded with a schedule row.
      if (
        !l ||
        isCityLine(l) ||
        JUNK_LINE.test(l) ||
        /\d{1,2}\/\d{1,2}\/\d{2,4}|\b\d{1,2}:\d{2}\b/.test(l) ||
        l.length > 45 ||
        /[a-z].*:\s*$/i.test(l)
      )
        break
      // "Destination BLENDTECH, INC." → "BLENDTECH, INC." — drop the label prefix.
      parts.unshift(l.replace(LEADING_LABEL, '').trim() || l)
    }
    const block = [...parts, trimToCity(lines[i]!) ?? lines[i]!].join('\n')
    if (!looksLikeAddress(block)) continue

    let cls: 'pu' | 'del' | null = null
    for (let k = i; k >= 0 && i - k <= 6; k--) {
      if (STOP_DEL.test(lines[k]!)) { cls = 'del'; break }
      if (STOP_PU.test(lines[k]!)) { cls = 'pu'; break }
    }
    stops.push({ block, cls, i })
  }

  // Dedup identical blocks (the same stop can echo in a summary table).
  const uniq = stops.filter((s, idx) => stops.findIndex((t) => t.block === s.block) === idx)
  if (!uniq.length) return { pu: null, del: null }

  // Pickup = the first stop labelled "pickup", else simply the first stop. Delivery =
  // the last stop (among the rest) labelled "delivery", else the last remaining stop.
  // This survives mixed labelling — one broker labels "PICK 1" but leaves "STOP 1"
  // for the drop, another labels neither. Order carries what labels don't.
  const pu = uniq.find((s) => s.cls === 'pu') ?? uniq[0]!
  const rest = uniq.filter((s) => s !== pu)
  const del = [...rest].reverse().find((s) => s.cls === 'del') ?? rest[rest.length - 1] ?? null
  return { pu: pu.block, del: del?.block ?? null }
}

/**
 * Assemble one stop from every source, richest block wins. Divider-style text is
 * tier 1 because it uniquely carries Time/Ref. Then the best of {label-independent
 * anchor block, column geometry} by line count. Bare city only if nothing else.
 */
function pickStop(
  fromText: Stop,
  anchorBlock: string | null,
  items: PositionedText[] | undefined,
  cityFound: Found<string> | null,
): Stop {
  if (fromText.block) return fromText

  const cityStr = cityFound?.value ?? cityOf(anchorBlock)
  const geo = items && cityStr ? blockFromColumn(items, cityStr) : null
  const anchorMulti = anchorBlock && anchorBlock.includes('\n') ? anchorBlock : null

  // Some brokers put the whole stop on ONE line ("Pickup# 1: ACTUS NUTRITION 2002
  // SD HWY 314, YANKTON, South Dakota"). Recover street + city from the label's line;
  // keep only if it carries more than a bare town.
  const oneLine = (() => {
    if (!cityFound?.evidence) return null
    const t = trimToCity(cityFound.evidence.replace(LEADING_LABEL, ''))
    return t && looksLikeAddress(t) && /\s/.test(t.replace(/,.*/, '')) ? t : null
  })()

  const best = [anchorMulti, geo, oneLine]
    .filter((b): b is string => !!b)
    .sort((a, b) => b.split('\n').length - a.split('\n').length || b.length - a.length)[0]

  const block = best ?? anchorBlock ?? oneLine ?? cityStr ?? null
  return { block, time: fromText.time, ref: fromText.ref }
}

const PICKUP_SECTION = [/pick\s*-?\s*up\s*address\s*:?/gi, /\bshipper\s*:?/gi, /\borigin\s*:?/gi]
const DELIVERY_SECTION = [/deliver(?:y)?\s*address\s*:?/gi, /\bconsignee\s*:?/gi, /\bdestination\s*:?/gi]
const NEXT_STOP = /\n\s*(?:deliver(?:y)?\s*address|consignee|destination|rate\s*:)/i
const AFTER_DELIVERY = /\n\s*(?:rate\s*:|commodity\s*:|weight\s*:)/i

/** Same shape as PdfItem in pdf-text.ts, redeclared so this file stays PDF-agnostic. */
export type PositionedText = { x: number; y: number; s: string }

/** Table headings and stop markers that sit directly above an address column. */
const COLUMN_HEADING =
  /^(pick|drop|stop|shipper|carrier|consignee|receiver|origin|destination|bill\s*to|remit|customer|supplier)\b/i

/**
 * Rebuild a stop address by walking DOWN its column from the city line.
 *
 * Why not read the page by line: brokers lay the address out as a narrow column next
 * to a spec table, so line-order text interleaves "1400 MADELINE LANE" with "Max
 * Lading Width 40 in". The address is contiguous vertically, at a near-constant x.
 */
function blockFromColumn(items: PositionedText[], cityState: string): string | null {
  const [city] = cityState.split(',')
  if (!city) return null

  // The city appears several times: the letterhead, the actual stop, and a summary
  // further down. Build a block from each and pick, rather than guessing by position.
  // Comma optional here too — the anchor fragment is often "SUN VALLEY CA 91352".
  const anchors = items.filter(
    (i) => i.s.includes(city.trim()) && (/,\s*[A-Z]{2}\b/.test(i.s) || /[A-Za-z][, ]\s*[A-Z]{2}\s+\d{5}(?!\d)/.test(i.s)),
  )

  const candidates = anchors
    .map((anchor) => {
      const column = items
        .filter((i) => Math.abs(i.x - anchor.x) <= 12 && i.y >= anchor.y && i.y <= anchor.y + 42)
        .sort((a, b) => b.y - a.y)
        .map((i) => i.s)
      // Above the company name sit the column's own labels ("Pick", "Drop") and stop
      // codes ("EL-1", "C00780-S01"). Drop leading one-word lines that are short or
      // carry a digit — a real company name is either multi-word or a plain word
      // ("Walmart"), never "EL-1".
      const lines = [...new Set(column)]
      while (lines.length > 1) {
        const first = lines[0]!
        const oneWord = first.split(/\s+/).length === 1
        // Column headings ("Shipper", "Carrier") must go too — left in, they pad the
        // letterhead block by a line and it wins the "richest block" contest against
        // the real stop.
        if (COLUMN_HEADING.test(first) || (oneWord && (first.length < 6 || /\d/.test(first)))) {
          lines.shift()
        } else break
      }
      return { block: lines.join('\n').trim(), y: anchor.y }
    })
    .filter((c) => {
      if (!looksLikeAddress(c.block)) return false
      // Exactly one city, or the window swallowed the NEXT stop too — a block naming
      // both ELGIN and WICHITA sends the driver to a place that doesn't exist. Count
      // both comma and comma-less zip forms.
      const comma = c.block.match(new RegExp(String.raw`,\s*(?:${ABBR})\b`, 'g')) ?? []
      const zip = c.block.match(new RegExp(String.raw`[A-Za-z][, ]\s*(?:${ABBR})\s+\d{5}(?!\d)`, 'g')) ?? []
      return Math.max(comma.length, zip.length) === 1
    })

  if (!candidates.length) return null

  // Richest block wins — a stop with its street beats the summary line that has only
  // the city. Ties break downward: the letterhead sits at the top of page one.
  candidates.sort((a, b) => b.block.split('\n').length - a.block.split('\n').length || a.y - b.y)
  return candidates[0]!.block
}

export function parseRateCon(raw: string, items?: PositionedText[]): RateConFields {
  const text = normalize(raw)

  return {
    // Regex has no shot at a whole-document briefing or a clean street address —
    // only the AI path fills these.
    importantNotes: null,
    pickupAddress: null,
    deliveryAddress: null,
    commodity: search(text, [/^\s*commodity\s*:\s*(.+)$/im], (m) => m[1]!.trim() || null),
    weight: search(
      text,
      [
        // "Weight: 42945 lbs" / "Weight 22,050 lb" — unit present makes it safe
        // anywhere on the line.
        /\bweight\s*:?\s*([\d,]+(?:\.\d+)?\s*(?:lbs?|pounds?|kg)\b)/i,
        // "Weight: 41000" — no unit, but the colon plus ≥3 digits rules out a bare
        // pallet count ("Weight 16"). Normalize to "lbs" for the driver.
        /\bweight\s*:\s*([\d,]{3,}(?:\.\d+)?)(?!\s*(?:lbs?|kg|pounds?))/i,
      ],
      // Append "lbs" when the doc gave a bare number so the driver sees a unit.
      (m) => (/[a-z]/i.test(m[1]!) ? m[1]!.trim() : `${m[1]!.trim()} lbs`),
    ),
    ...(() => {
      const anch = anchorStops(text)
      return {
        pickupStop: pickStop(
          parseStop(text, PICKUP_SECTION, NEXT_STOP),
          anch.pu,
          items,
          cityAfter(text, ORIGIN_LABELS),
        ),
        deliveryStop: pickStop(
          parseStop(text, DELIVERY_SECTION, AFTER_DELIVERY),
          anch.del,
          items,
          cityAfter(text, DEST_LABELS),
        ),
      }
    })(),
    rate: search(text, RATE_LABELS, (m) => money(m[1]!)),
    loadedMiles: search(text, MILE_LABELS, (m) => money(m[1]!)),
    origin: cityAfter(text, ORIGIN_LABELS),
    destination: cityAfter(text, DEST_LABELS),
    // Deliberately NOT called brokerMc: real docs carry the CARRIER's MC (yours),
    // and telling them apart reliably isn't possible from text alone.
    mcNumber: search(text, [/\bMC\s*#?\s*[:\-]?\s*(\d{5,8})\b/i], (m) => m[1]!),
    brokerPhone: search(text, [/\(?\d{3}\)?[\s\-.]\d{3}[\s\-.]\d{4}/], (m) => m[0]!.trim()),
    brokerEmail: search(text, [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i], (m) => m[0]!),
    referenceId: search(
      text,
      // The `#?` after the colon matters: "LOAD ID: #S4139751" is real, and without
      // it the whole match failed and a BOL number further down won the slot.
      [/(?:load|order|pro|reference|ref)\s*(?:#|number|no\.?|id)?\s*[:\-]?\s*#?\s*([A-Z0-9][A-Z0-9\-]{2,19})\b/i],
      // Must contain a digit: without this the "RATE CONFIRMATION" heading makes the
      // next word ("Broker") a perfectly valid-looking reference number.
      (m) => (/\d/.test(m[1]!) ? m[1]! : null),
    ),
    pickupDate: search(
      text,
      // 200 chars, not 80: real layouts put the company, the street and a divider
      // rule between "Pick up Address:" and its "Time: 07/16/2026".
      [/(?:pick\s*-?\s*up|pickup|ship\s*date|appointment\s*date)\b[\s\S]{0,200}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i],
      (m) => toIso(m[1]!),
    ),
    // Best-effort draft only — the AI pass gives the reliable delivery date, which
    // (with pickup) sets the load's transit days in toQrLoad.
    deliveryDate: search(
      text,
      [/(?:deliver(?:y)?|consignee|drop|unload)\b[\s\S]{0,200}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i],
      (m) => toIso(m[1]!),
    ),
  }
}

/** Whole days between two ISO dates (min 1). null if either is missing/bad. */
function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null
  const da = Date.parse(a)
  const db = Date.parse(b)
  if (Number.isNaN(da) || Number.isNaN(db)) return null
  return Math.max(1, Math.round((db - da) / 86_400_000))
}

/** US rate cons write MM/DD/YYYY. Returns ISO for <input type="date">. */
function toIso(us: string): string | null {
  const [mm, dd, yy] = us.split('/').map(Number)
  if (!mm || !dd || yy === undefined) return null
  const year = yy < 100 ? 2000 + yy : yy
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

const RULE = '__________________________'

/**
 * The block the dispatcher copies and sends to the driver. This is the actual point
 * of reading the PDF: broker's paperwork in, driver's instructions out, no retyping.
 *
 * Shape matches what the dispatcher already sends by hand today, so it lands in a
 * chat looking exactly like it always has.
 */
export function formatDriverInfo(f: RateConFields): string {
  const out: string[] = []
  const money = f.rate ? `$${f.rate.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null

  out.push(`LOAD ID: #${f.referenceId?.value ?? '—'}`, '')

  for (const [title, stop, fallback] of [
    ['Pick up Address:', f.pickupStop, f.origin?.value],
    ['Delivery Address:', f.deliveryStop, f.destination?.value],
  ] as const) {
    out.push(title, '')
    // Fall back to the city when the layout has no quotable block (some brokers
    // scatter the stop across a table) — a city beats an empty line.
    out.push(stop.block ?? fallback ?? '—', '')
    out.push(RULE)
    if (stop.time) out.push(`Time: ${stop.time}`, RULE)
    if (stop.ref) out.push(`Ref: ${stop.ref}`, RULE)
    out.push('')
  }

  if (money) out.push(`Rate: ${money}`)
  if (f.commodity) out.push(`Commodity: ${f.commodity.value}`)
  if (f.weight) out.push(`Weight: ${f.weight.value}`)

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Feeds the same LoadForm the QR path uses. Absent fields keep their defaults. */
export function toQrLoad(f: RateConFields): QrLoad {
  // Transit days come straight from the rate con's pickup→delivery dates when both
  // were read; otherwise keep the 1-day default for the dispatcher to adjust.
  const transitDays = daysBetween(f.pickupDate?.value, f.deliveryDate?.value)
  return {
    ...EMPTY,
    rate: f.rate?.value ?? EMPTY.rate,
    loadedMiles: f.loadedMiles?.value ?? EMPTY.loadedMiles,
    transitDays: transitDays ?? EMPTY.transitDays,
    origin: f.origin?.value ?? null,
    destination: f.destination?.value ?? null,
    brokerMc: f.mcNumber?.value ?? null,
    brokerPhone: f.brokerPhone?.value ?? null,
    brokerEmail: f.brokerEmail?.value ?? null,
    referenceId: f.referenceId?.value ?? null,
    pickupDate: f.pickupDate?.value ?? null,
    deliveryDate: f.deliveryDate?.value ?? null,
    pickupTime: normalizeApptTime(f.pickupStop.time),
    deliveryTime: normalizeApptTime(f.deliveryStop.time),
    pickupAddress: f.pickupAddress?.value ?? null,
    deliveryAddress: f.deliveryAddress?.value ?? null,
    brokerNotes: f.importantNotes?.value ?? null,
  }
}

/** Fields the parser could not find — the UI rings these amber. */
export function missingFields(f: RateConFields): string[] {
  const gaps: string[] = []
  if (!f.rate) gaps.push('rate')
  if (!f.loadedMiles) gaps.push('loadedMiles')
  // Deadhead depends on the truck's position, never on the document. Transit days
  // now come from the rate con's dates — only flag them if those weren't found.
  gaps.push('deadheadMiles')
  if (!(f.pickupDate && f.deliveryDate)) gaps.push('transitDays')
  return gaps
}
