// Our broker database: everyone the company has actually dealt with, aggregated
// from the brokers named on our loads, joined to the FMCSA cache (`brokers`) so a
// row can carry authority status when it's been checked. SERVER ONLY (queries DB).

import { sql } from './db'

export type OurBroker = {
  /** Digits-only MC, or null if only a name was ever captured. */
  mc: string | null
  name: string | null
  phone: string | null
  email: string | null
  loadCount: number
  lastLoad: string | null
  /** From the FMCSA cache, when this MC has been checked. */
  authorityStatus: string | null
  checkedAt: string | null
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** Fallback display name when a load never captured broker_name — read it off the
 * email domain, e.g. ops@apex-logistics.com → "Apex Logistics". */
function nameFromEmail(email: string | null): string | null {
  const label = (email?.split('@')[1] ?? '').split('.')[0]?.replace(/-?demo/i, '').replace(/[-_]+/g, ' ').trim()
  return label ? label.replace(/\b\w/g, (c) => c.toUpperCase()) : null
}

/** Group the loads' broker fields into one row per broker (by MC when present,
 * else by lower-cased name), newest activity first. */
export async function listOurBrokers(companyId: string): Promise<OurBroker[]> {
  const rows = (await sql`
    SELECT broker_mc, broker_name, broker_phone, broker_email, created_at
    FROM loads
    WHERE company_id = ${companyId}
      AND (broker_name IS NOT NULL OR broker_mc IS NOT NULL)
    ORDER BY created_at DESC`) as {
    broker_mc: string | null
    broker_name: string | null
    broker_phone: string | null
    broker_email: string | null
    created_at: string
  }[]

  const byKey = new Map<string, OurBroker>()
  for (const r of rows) {
    const mc = digits(r.broker_mc) || null
    const key = mc ?? (r.broker_name ?? '').toLowerCase().trim()
    if (!key) continue
    const existing = byKey.get(key)
    if (existing) {
      existing.loadCount++
      // rows are newest-first, so the first-seen values are already the freshest
      existing.name ??= r.broker_name
      existing.phone ??= r.broker_phone
      existing.email ??= r.broker_email
      existing.mc ??= mc
    } else {
      byKey.set(key, {
        mc,
        name: r.broker_name,
        phone: r.broker_phone,
        email: r.broker_email,
        loadCount: 1,
        lastLoad: r.created_at ? String(r.created_at).slice(0, 10) : null,
        authorityStatus: null,
        checkedAt: null,
      })
    }
  }

  // Enrich with any cached FMCSA data for the MCs we have.
  const mcs = [...byKey.values()].map((b) => b.mc).filter((m): m is string => !!m)
  if (mcs.length) {
    const cached = (await sql`
      SELECT mc, authority_status, checked_at FROM brokers WHERE mc = ANY(${mcs})`) as {
      mc: string
      authority_status: string | null
      checked_at: string
    }[]
    const cacheByMc = new Map(cached.map((c) => [c.mc, c]))
    for (const b of byKey.values()) {
      if (b.mc && cacheByMc.has(b.mc)) {
        const c = cacheByMc.get(b.mc)!
        b.authorityStatus = c.authority_status
        b.checkedAt = c.checked_at ? String(c.checked_at).slice(0, 10) : null
      }
    }
  }

  for (const b of byKey.values()) if (!b.name && b.email) b.name = nameFromEmail(b.email)

  return [...byKey.values()].sort((a, b) => b.loadCount - a.loadCount)
}
