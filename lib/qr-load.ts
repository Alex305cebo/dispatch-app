// The bridge between the Chrome extension on DAT and this app.
//
// The extension already has the load structured (its parseLoad()), so nothing is
// ever recognized from pixels — these params ARE the data. Both sides must agree
// on this contract; qr-load.test.ts is what keeps them agreeing.
//
// Params live in the URL hash, so the phone computes the analysis locally and the
// broker's rate never reaches a server.

export type QrLoad = {
  rate: number
  loadedMiles: number
  deadheadMiles: number
  transitDays: number
  origin: string | null
  destination: string | null
  /** Where the truck sits now — DAT's Origin search field, not a load property. */
  truckLocation: string | null
  /** DAT's own market spot rate per mile. The answer to "is this below market?" */
  spotRpm: number | null
  brokerName: string | null
  brokerMc: string | null
  brokerEmail: string | null
  payVia: string | null
  brokerPhone: string | null
  referenceId: string | null
  /** Printed on the rate con, not something the DAT extension can ever supply. */
  pickupDate?: string | null
  deliveryDate?: string | null
  /** Raw appointment text as printed ("07/15/26 12:00 Appt") — the map pin shows this. */
  pickupTime?: string | null
  deliveryTime?: string | null
  /** Full street address, when the RC printed one — geocodes to the exact building, not just the city. */
  pickupAddress?: string | null
  deliveryAddress?: string | null
  brokerNotes?: string | null
  /** Facility names and reference numbers — what the driver actually needs on site.
   * Only a rate con carries these; the DAT extension never sees them. */
  pickupName?: string | null
  deliveryName?: string | null
  pickupRefs?: string | null
  deliveryRefs?: string | null
  weight?: string | null
  commodity?: string | null
  equipment?: string | null
}

const NUMS = ['rate', 'miles', 'dh', 'days', 'spot'] as const
const STRS = [
  'origin', 'dest', 'truck', 'bn', 'mc', 'email', 'phone', 'ref',
  // Rate-con-only detail: the Telegram bot fills these in, the DAT extension can't.
  'pn', 'pa', 'pt', 'pd', 'pr', 'dn', 'da', 'dt', 'dd', 'dr', 'wt', 'cm', 'eq', 'notes',
] as const

export const EMPTY: QrLoad = {
  rate: 0,
  loadedMiles: 0,
  // A load board can't know either of these: deadhead depends on where the truck
  // is, transit days on the dispatch plan. The dispatcher supplies them.
  deadheadMiles: 0,
  transitDays: 1,
  origin: null,
  destination: null,
  truckLocation: null,
  spotRpm: null,
  brokerName: null,
  brokerMc: null,
  brokerEmail: null,
  payVia: null,
  brokerPhone: null,
  referenceId: null,
  // Rate-con detail: absent from a DAT listing, present when the Telegram bot
  // built the link. Listed explicitly so EMPTY stays the exact shape parseLoadHash
  // returns — qr-load.test.ts compares them key for key.
  pickupName: null,
  pickupAddress: null,
  pickupTime: null,
  pickupDate: null,
  pickupRefs: null,
  deliveryName: null,
  deliveryAddress: null,
  deliveryTime: null,
  deliveryDate: null,
  deliveryRefs: null,
  weight: null,
  commodity: null,
  equipment: null,
  brokerNotes: null,
}

export function buildLoadHash(load: Partial<QrLoad>): string {
  const p = new URLSearchParams()
  const put = (k: string, v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === '') return
    p.set(k, String(v))
  }
  put('rate', load.rate)
  put('miles', load.loadedMiles)
  put('dh', load.deadheadMiles)
  put('days', load.transitDays)
  put('spot', load.spotRpm)
  put('origin', load.origin)
  put('dest', load.destination)
  put('truck', load.truckLocation)
  put('bn', load.brokerName)
  put('mc', load.brokerMc)
  put('email', load.brokerEmail)
  put('phone', load.brokerPhone)
  put('ref', load.referenceId)
  put('pn', load.pickupName)
  put('pa', load.pickupAddress)
  put('pt', load.pickupTime)
  put('pd', load.pickupDate)
  put('pr', load.pickupRefs)
  put('dn', load.deliveryName)
  put('da', load.deliveryAddress)
  put('dt', load.deliveryTime)
  put('dd', load.deliveryDate)
  put('dr', load.deliveryRefs)
  put('wt', load.weight)
  put('cm', load.commodity)
  put('eq', load.equipment)
  put('notes', load.brokerNotes)
  return p.toString()
}

export function parseLoadHash(hash: string): QrLoad {
  const p = new URLSearchParams(hash.replace(/^#/, ''))

  // A garbled param must not fabricate a number — a wrong rate is worse than a
  // missing one, since the dispatcher would never think to double-check it.
  const num = (k: (typeof NUMS)[number]): number | null => {
    const raw = p.get(k)
    if (raw === null || raw.trim() === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const str = (k: (typeof STRS)[number]): string | null => {
    const raw = p.get(k)?.trim()
    return raw ? raw : null
  }

  return {
    rate: num('rate') ?? EMPTY.rate,
    loadedMiles: num('miles') ?? EMPTY.loadedMiles,
    deadheadMiles: num('dh') ?? EMPTY.deadheadMiles,
    transitDays: num('days') ?? EMPTY.transitDays,
    spotRpm: num('spot'),
    origin: str('origin'),
    destination: str('dest'),
    truckLocation: str('truck'),
    brokerName: str('bn'),
    brokerMc: str('mc'),
    brokerEmail: str('email'),
    payVia: null,
    brokerPhone: str('phone'),
    referenceId: str('ref'),
    pickupName: str('pn'),
    pickupAddress: str('pa'),
    pickupTime: str('pt'),
    pickupDate: str('pd'),
    pickupRefs: str('pr'),
    deliveryName: str('dn'),
    deliveryAddress: str('da'),
    deliveryTime: str('dt'),
    deliveryDate: str('dd'),
    deliveryRefs: str('dr'),
    weight: str('wt'),
    commodity: str('cm'),
    equipment: str('eq'),
    brokerNotes: str('notes'),
  }
}

/** calcLoad throws on these; the QR page uses this to ask instead of crashing. */
export function missingForAnalysis(load: QrLoad): string[] {
  const gaps: string[] = []
  if (!(load.loadedMiles > 0)) gaps.push('loadedMiles')
  if (!(load.transitDays > 0)) gaps.push('transitDays')
  return gaps
}
