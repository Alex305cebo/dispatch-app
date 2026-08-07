// Broker vetting via FMCSA QCMobile — the only real free carrier-authority API.
// SERVER ONLY (uses the DB cache + a WebKey that must never reach the browser).
//
// Free WebKey: mobile.fmcsa.dot.gov/QCDevsite (Login.gov) → env FMCSA_WEBKEY.
// Without a key the check degrades to "not configured" — nothing breaks.
//
// The QCMobile carrier record is rich (authority × 3, insurance amounts, safety,
// crashes, census). parseRecord pulls all of it; the checklist surfaces the lot.

import { sql } from './db'
import { fmcsaKey } from './keys.ts'
import { t, type Locale } from './i18n.ts'

export type BrokerFlag = { level: 'block' | 'warn'; text: string }
export type Authority = 'active' | 'inactive' | 'none' | 'unknown'

export type BrokerCheck = {
  mc: string | null
  legalName: string | null
  dbaName: string | null
  dotNumber: string | null
  ein: string | null
  // Authority + operating status
  operatingStatus: Authority // statusCode / allowedToOperate
  authorityStatus: Authority // broker authority — kept name for the RC-import panel
  commonAuthority: Authority
  contractAuthority: Authority
  outOfService: boolean
  oosDate: string | null
  // Insurance / bond (amounts are USD thousands as FMCSA reports them)
  bondRequired: boolean
  bondAmount: number | null
  bondOnFile: boolean | null // derived, kept for the RC-import panel
  cargoOnFile: number | null
  bipdOnFile: number | null
  bipdRequired: boolean
  // Census / identity
  operation: string | null
  mcs150Current: boolean | null
  address: string | null
  phone: string | null
  authorityGranted: string | null
  // Safety / fleet
  safetyRating: string | null
  safetyRatingDate: string | null
  powerUnits: number | null
  drivers: number | null
  crashTotal: number | null
  fatalCrash: number | null
  injCrash: number | null
  towawayCrash: number | null
  vehicleOosRate: number | null
  vehicleOosNational: number | null
  driverOosRate: number | null
  driverOosNational: number | null
  flags: BrokerFlag[]
  cached: boolean
}

/** Context pulled from the rate con, so we can flag mismatches. */
export type RcContext = { name?: string | null; phone?: string | null; email?: string | null }

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

function monthsSince(date: string | null): number | null {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const authFrom = (code: any): Authority =>
  code === 'A' ? 'active' : code === 'I' ? 'inactive' : code === 'N' ? 'none' : 'unknown'

async function fmcsaGet(path: string, key: string): Promise<any | null> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://mobile.fmcsa.dot.gov/qc/services/${path}${sep}webKey=${key}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

function unwrapCarrier(data: any): any | null {
  return data?.content?.[0]?.carrier ?? data?.content?.carrier ?? data?.carrier ?? null
}

/** Pull every field we surface out of one FMCSA carrier record. `mc`, `granted` and
 * `cached` are threaded in by the caller; everything else comes from `rec`. */
function parseRecord(rec: any, mc: string | null, granted: string | null, cached: boolean): BrokerCheck {
  const operatingStatus: Authority =
    rec.statusCode === 'A' || rec.allowedToOperate === 'Y'
      ? 'active'
      : rec.statusCode === 'I'
        ? 'inactive'
        : 'unknown'
  const bondRequired = rec.bondInsuranceRequired === 'Y'
  const bondAmount = num(rec.bondInsuranceOnFile)
  return {
    mc,
    legalName: rec.legalName ?? null,
    dbaName: rec.dbaName ?? null,
    dotNumber: rec.dotNumber != null ? String(rec.dotNumber) : null,
    ein: rec.ein != null ? String(rec.ein) : null,
    operatingStatus,
    authorityStatus: authFrom(rec.brokerAuthorityStatus),
    commonAuthority: authFrom(rec.commonAuthorityStatus),
    contractAuthority: authFrom(rec.contractAuthorityStatus),
    outOfService: !!rec.oosDate,
    oosDate: rec.oosDate ? String(rec.oosDate).slice(0, 10) : null,
    bondRequired,
    bondAmount,
    bondOnFile: bondRequired ? bondAmount != null && bondAmount > 0 : null,
    cargoOnFile: num(rec.cargoInsuranceOnFile),
    bipdOnFile: num(rec.bipdInsuranceOnFile),
    bipdRequired: rec.bipdInsuranceRequired === 'Y',
    operation: rec.carrierOperation?.carrierOperationDesc ?? null,
    mcs150Current: rec.mcs150Outdated === 'N' ? true : rec.mcs150Outdated === 'Y' ? false : null,
    address: [rec.phyStreet, rec.phyCity, rec.phyState, rec.phyZipcode].filter(Boolean).join(', ') || null,
    phone: rec.telephone ?? null,
    authorityGranted: granted ? String(granted).slice(0, 10) : null,
    safetyRating: rec.safetyRating ?? null,
    safetyRatingDate: rec.safetyRatingDate ? String(rec.safetyRatingDate).slice(0, 10) : null,
    powerUnits: num(rec.totalPowerUnits),
    drivers: num(rec.totalDrivers),
    crashTotal: num(rec.crashTotal),
    fatalCrash: num(rec.fatalCrash),
    injCrash: num(rec.injCrash),
    towawayCrash: num(rec.towawayCrash),
    vehicleOosRate: num(rec.vehicleOosRate),
    vehicleOosNational: num(rec.vehicleOosRateNationalAverage),
    driverOosRate: num(rec.driverOosRate),
    driverOosNational: num(rec.driverOosRateNationalAverage),
    flags: [],
    cached,
  }
}

/** Derive the red flags from FMCSA data + what the rate con claimed. */
function computeFlags(c: BrokerCheck, ctx: RcContext, locale: Locale): BrokerFlag[] {
  const flags: BrokerFlag[] = []
  if (c.authorityStatus === 'inactive' || c.authorityStatus === 'none')
    flags.push({ level: 'block', text: t(locale, 'fmcsa.authorityInactive') })
  if (c.outOfService) flags.push({ level: 'block', text: t(locale, 'fmcsa.outOfService') })
  if (c.bondOnFile === false) flags.push({ level: 'block', text: t(locale, 'fmcsa.noBond') })
  if (c.mcs150Current === false) flags.push({ level: 'warn', text: t(locale, 'fmcsa.mcs150Outdated') })

  const months = monthsSince(c.authorityGranted)
  if (months !== null && months < 3)
    flags.push({ level: 'warn', text: t(locale, 'fmcsa.mcYoungerThan3').replace('{months}', String(Math.round(months))) })
  else if (months !== null && months < 6)
    flags.push({ level: 'warn', text: t(locale, 'fmcsa.mcYoungerThan6').replace('{months}', String(Math.round(months))) })

  const fmcsaNames = [c.legalName, c.dbaName].map(norm).filter(Boolean)
  if (ctx.name && fmcsaNames.length && !fmcsaNames.some((n) => n.includes(norm(ctx.name)) || norm(ctx.name).includes(n)))
    flags.push({
      level: 'warn',
      text: t(locale, 'fmcsa.nameMismatch').replace('{rcName}', ctx.name).replace('{fmcsaName}', c.legalName ?? ''),
    })

  if (ctx.phone && c.phone && digits(ctx.phone).slice(-10) !== digits(c.phone).slice(-10))
    flags.push({ level: 'warn', text: t(locale, 'fmcsa.phoneMismatch') })

  if (ctx.email) {
    const domain = ctx.email.split('@')[1]?.toLowerCase() ?? ''
    if (/^(gmail|yahoo|outlook|hotmail|aol|mail)\./.test(domain))
      flags.push({ level: 'warn', text: t(locale, 'fmcsa.publicEmailDomain').replace('{domain}', domain) })
  }
  return flags
}

/** Given a fetched record + its MC, make the authority-date call, cache by MC, parse. */
async function buildFromRecord(mc: string | null, rec: any, key: string): Promise<BrokerCheck> {
  let granted: string | null = null
  if (rec.dotNumber) {
    const auth = await fmcsaGet(`carriers/${rec.dotNumber}/authority`, key)
    const a = Array.isArray(auth?.content) ? auth.content[0] : auth?.content
    granted = a?.authGrantDate ?? a?.applicantDate ?? a?.originalActionDate ?? null
  }
  const base = parseRecord(rec, mc, granted, false)

  if (mc) {
    await sql`
      INSERT INTO brokers (mc, legal_name, dba_name, dot_number, authority_status,
                           bond_on_file, authority_granted, address, phone, raw, checked_at)
      VALUES (${mc}, ${base.legalName}, ${base.dbaName}, ${base.dotNumber}, ${base.authorityStatus},
              ${base.bondOnFile}, ${base.authorityGranted}, ${base.address}, ${base.phone},
              ${JSON.stringify(rec)}, now())
      ON CONFLICT (mc) DO UPDATE SET
        legal_name = EXCLUDED.legal_name, dba_name = EXCLUDED.dba_name,
        dot_number = EXCLUDED.dot_number, authority_status = EXCLUDED.authority_status,
        bond_on_file = EXCLUDED.bond_on_file, authority_granted = EXCLUDED.authority_granted,
        address = EXCLUDED.address, phone = EXCLUDED.phone, raw = EXCLUDED.raw, checked_at = now()`
  }
  return base
}

/** Check a broker by MC (docket) number. Cache-first: re-hits FMCSA at most once a
 * day; flags are recomputed every call since the RC context can change. */
export async function checkBroker(
  mcRaw: string,
  ctx: RcContext = {},
  locale: Locale = 'en',
): Promise<BrokerCheck | { error: string }> {
  const mc = digits(mcRaw)
  if (!mc) return { error: t(locale, 'fmcsa.noMcToCheck') }

  // Fresh cache shows without a key — only refreshing needs FMCSA.
  const cachedRow = (await sql`SELECT raw, authority_granted, checked_at FROM brokers WHERE mc = ${mc}`)[0] as any
  const fresh =
    cachedRow?.raw && Date.now() - new Date(cachedRow.checked_at).getTime() < 24 * 60 * 60 * 1000

  let base: BrokerCheck
  if (fresh) {
    const granted = cachedRow.authority_granted ? String(cachedRow.authority_granted).slice(0, 10) : null
    base = parseRecord(cachedRow.raw, mc, granted, true)
  } else {
    const key = await fmcsaKey()
    if (!key) return { error: 'no_key' }
    const data = await fmcsaGet(`carriers/docket-number/${mc}`, key)
    const rec = unwrapCarrier(data)
    if (!rec) return { error: t(locale, 'fmcsa.mcNotFound').replace('{mc}', mc) }
    base = await buildFromRecord(mc, rec, key)
  }

  base.flags = computeFlags(base, ctx, locale)
  return base
}

/** Check a broker by USDOT number. Resolves the MC docket so DOT and MC lookups
 * share one cache row. */
export async function checkBrokerByDot(
  dotRaw: string,
  ctx: RcContext = {},
  locale: Locale = 'en',
): Promise<BrokerCheck | { error: string }> {
  const dot = digits(dotRaw)
  if (!dot) return { error: t(locale, 'fmcsa.noMcToCheck') }
  const key = await fmcsaKey()
  if (!key) return { error: 'no_key' }

  const data = await fmcsaGet(`carriers/${dot}`, key)
  const rec = unwrapCarrier(data)
  if (!rec) return { error: t(locale, 'fmcsa.dotNotFound').replace('{dot}', dot) }

  let mc: string | null = null
  const dk = await fmcsaGet(`carriers/${rec.dotNumber ?? dot}/docket-numbers`, key)
  const docket = (Array.isArray(dk?.content) ? dk.content : dk?.content ? [dk.content] : [])
    .map((d: any) => digits(d?.docketNumber ?? d?.docket))
    .find((d: string) => d)
  if (docket) mc = docket

  const base = await buildFromRecord(mc, rec, key)
  base.flags = computeFlags(base, ctx, locale)
  return base
}
