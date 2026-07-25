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

  // Merge in every broker we've CHECKED (the FMCSA cache), even those never on a
  // load — so a manual MC/DOT lookup lands in the database too. Existing rows get
  // enriched; unseen ones are added with a zero load count.
  // ponytail: the FMCSA cache is shared across companies (public data); a truly
  // multi-tenant "who did WE check" needs a per-company checks table later.
  const cached = (await sql`
    SELECT mc, legal_name, dba_name, authority_status, phone, checked_at FROM brokers`) as {
    mc: string
    legal_name: string | null
    dba_name: string | null
    authority_status: string | null
    phone: string | null
    checked_at: string
  }[]
  for (const c of cached) {
    const checkedAt = c.checked_at ? String(c.checked_at).slice(0, 10) : null
    const existing = byKey.get(c.mc)
    if (existing) {
      existing.authorityStatus = c.authority_status
      existing.checkedAt = checkedAt
      existing.name ??= c.legal_name ?? c.dba_name
      existing.phone ??= c.phone
    } else {
      byKey.set(c.mc, {
        mc: c.mc,
        name: c.legal_name ?? c.dba_name,
        phone: c.phone,
        email: null,
        loadCount: 0,
        lastLoad: null,
        authorityStatus: c.authority_status,
        checkedAt,
      })
    }
  }

  for (const b of byKey.values()) if (!b.name && b.email) b.name = nameFromEmail(b.email)

  // Brokers with loads first (by count), then checked-only brokers newest first.
  return [...byKey.values()].sort(
    (a, b) => b.loadCount - a.loadCount || (b.checkedAt ?? '').localeCompare(a.checkedAt ?? ''),
  )
}
