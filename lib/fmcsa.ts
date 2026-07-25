// Broker vetting via FMCSA QCMobile — the only real free carrier-authority API.
// SERVER ONLY (uses the DB cache + a WebKey that must never reach the browser).
//
// Free WebKey: mobile.fmcsa.dot.gov/QCDevsite (Login.gov) → env FMCSA_WEBKEY.
// Without a key the check degrades to "not configured" — nothing breaks.

import { sql } from './db'
import { t, type Locale } from './i18n.ts'

export type BrokerFlag = { level: 'block' | 'warn'; text: string }

export type BrokerCheck = {
  mc: string | null
  legalName: string | null
  dbaName: string | null
  dotNumber: string | null
  authorityStatus: 'active' | 'inactive' | 'none' | 'unknown'
  bondOnFile: boolean | null
  authorityGranted: string | null
  address: string | null
  phone: string | null
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
async function fmcsaGet(path: string, key: string): Promise<any | null> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://mobile.fmcsa.dot.gov/qc/services/${path}${sep}webKey=${key}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

/** Both endpoints wrap the carrier the same two or three ways — unwrap defensively. */
function unwrapCarrier(data: any): any | null {
  return data?.content?.[0]?.carrier ?? data?.content?.carrier ?? data?.carrier ?? null
}

function statusFromRec(rec: any): BrokerCheck['authorityStatus'] {
  return rec.brokerAuthorityStatus === 'A' || rec.allowedToOperate === 'Y'
    ? 'active'
    : rec.brokerAuthorityStatus === 'I'
      ? 'inactive'
      : rec.brokerAuthorityStatus === 'N'
        ? 'none'
        : 'unknown'
}

/** Derive the red flags from FMCSA data + what the rate con claimed. */
function computeFlags(c: BrokerCheck, ctx: RcContext, locale: Locale): BrokerFlag[] {
  const flags: BrokerFlag[] = []
  if (c.authorityStatus === 'inactive' || c.authorityStatus === 'none')
    flags.push({ level: 'block', text: t(locale, 'fmcsa.authorityInactive') })
  if (c.bondOnFile === false)
    flags.push({ level: 'block', text: t(locale, 'fmcsa.noBond') })

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

/** Turn a fetched FMCSA carrier record into a BrokerCheck, making the extra
 * authority-date call and caching by MC when we have one. `mc` may be null for a
 * DOT lookup whose docket we couldn't resolve — then we skip the cache write. */
async function buildFromRecord(
  mc: string | null,
  rec: any,
  key: string,
): Promise<BrokerCheck> {
  let granted: string | null = null
  if (rec.dotNumber) {
    const auth = await fmcsaGet(`carriers/${rec.dotNumber}/authority`, key)
    const a = Array.isArray(auth?.content) ? auth.content[0] : auth?.content
    granted = a?.authGrantDate ?? a?.applicantDate ?? a?.originalActionDate ?? null
  }

  const base: BrokerCheck = {
    mc,
    legalName: rec.legalName ?? null,
    dbaName: rec.dbaName ?? null,
    dotNumber: rec.dotNumber ? String(rec.dotNumber) : null,
    authorityStatus: statusFromRec(rec),
    bondOnFile: rec.bondInsuranceOnFile === 'Y' ? true : rec.bondInsuranceOnFile === 'N' ? false : null,
    authorityGranted: granted ? String(granted).slice(0, 10) : null,
    address: [rec.phyStreet, rec.phyCity, rec.phyState, rec.phyZipcode].filter(Boolean).join(', ') || null,
    phone: rec.telephone ?? null,
    flags: [],
    cached: false,
  }

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
  const key = process.env.FMCSA_WEBKEY
  if (!key) return { error: 'no_key' }

  const cachedRow = (await sql`SELECT * FROM brokers WHERE mc = ${mc}`)[0] as any
  const fresh =
    cachedRow && Date.now() - new Date(cachedRow.checked_at).getTime() < 24 * 60 * 60 * 1000

  let base: BrokerCheck
  if (fresh) {
    base = {
      mc,
      legalName: cachedRow.legal_name,
      dbaName: cachedRow.dba_name,
      dotNumber: cachedRow.dot_number,
      authorityStatus: cachedRow.authority_status ?? 'unknown',
      bondOnFile: cachedRow.bond_on_file,
      authorityGranted: cachedRow.authority_granted ? String(cachedRow.authority_granted).slice(0, 10) : null,
      address: cachedRow.address,
      phone: cachedRow.phone,
      flags: [],
      cached: true,
    }
  } else {
    const data = await fmcsaGet(`carriers/docket-number/${mc}`, key)
    const rec = unwrapCarrier(data)
    if (!rec) return { error: t(locale, 'fmcsa.mcNotFound').replace('{mc}', mc) }
    base = await buildFromRecord(mc, rec, key)
  }

  base.flags = computeFlags(base, ctx, locale)
  return base
}

/** Check a broker by USDOT number. FMCSA keys the census by DOT; we resolve the MC
 * from its docket-numbers so the result still caches and lines up with MC lookups. */
export async function checkBrokerByDot(
  dotRaw: string,
  ctx: RcContext = {},
  locale: Locale = 'en',
): Promise<BrokerCheck | { error: string }> {
  const dot = digits(dotRaw)
  if (!dot) return { error: t(locale, 'fmcsa.noMcToCheck') }
  const key = process.env.FMCSA_WEBKEY
  if (!key) return { error: 'no_key' }

  const data = await fmcsaGet(`carriers/${dot}`, key)
  const rec = unwrapCarrier(data)
  if (!rec) return { error: t(locale, 'fmcsa.dotNotFound').replace('{dot}', dot) }

  // Resolve the MC docket so the row caches under the same key as an MC lookup.
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
