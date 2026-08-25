// Our broker database: everyone the company has actually dealt with, aggregated
// from the brokers named on our loads, joined to the FMCSA cache (`brokers`) so a
// row can carry authority status when it's been checked. SERVER ONLY (queries DB).

import { sql } from './db'
import { emailDomain, foldReps, type BrokerRep } from './broker-key.ts'
import { foldMoney, type MoneyRow } from './broker-money.ts'

export type OurBroker = {
  /** Digits-only MC, or null if only a name was ever captured. */
  mc: string | null
  name: string | null
  phone: string | null
  email: string | null
  loadCount: number
  lastLoad: string | null
  /** Сумма ставок по всем рейсам с этим брокером. */
  gross: number
  /** Ставка за милю по всем его рейсам: весь гросс ÷ все мили. Не среднее от
   * средних — иначе один короткий дорогой рейс задирал бы всю строку. */
  rpm: number
  /** Сколько дней РЕАЛЬНО проходит от счёта до денег — среднее по оплаченным
   * рейсам. Этого числа нет ни в одном справочнике: брокер обещает «30 дней» на
   * бумаге, а платит как платит, и узнать это можно только по своей истории. */
  payDays: number | null
  /** Сколько он должен прямо сейчас: выставлено, но не оплачено. */
  owed: number
  /** Сами неоплаченные рейсы — чтобы отметить оплату прямо здесь, не заходя в каждый
   * груз по отдельности. Деньги приходят одной суммой за несколько рейсов, и раньше
   * на это уходило столько же открытых страниц, сколько рейсов в переводе. */
  unpaid: { id: number; ref: string | null; route: string; rate: number; days: number }[]
  /** Люди со стороны брокера: кто подписывал рейт-коны и с кем идёт переписка.
   * У крупного брокера их несколько, и в карточке они лежат под именем компании. */
  reps: BrokerRep[]
  /** Название компании из реестра — им подписана карточка, когда оно известно.
   * В грузе может стоять имя менеджера, а карточка должна называться компанией. */
  registryName: string | null
  /** Payment service named on this broker's rate cons (TriumphPay, Comdata…), newest first. */
  payVia: string | null
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

/** Group the loads' broker fields into one row per broker, newest activity first.
 *
 * Key priority: MC → email domain → lower-cased name.
 *
 * The email domain sits in the middle because of a real case: a rate con is signed by a
 * person, and the parser stored that person as the broker, so two C.H. Robinson loads
 * arrived as "Tyler Simpson" and a third from another rep would have opened a third
 * row. All of them carry @chrobinson.com, which identifies the company far better than
 * a name typed differently on every document.
 *
 * What this still cannot do: join a load with NO MC to the FMCSA-checked row that has
 * one. An FMCSA record contains no email, so there is no bridge — the MC has to be on
 * the load itself. That is a data problem, not a grouping one. */
export async function listOurBrokers(companyId: string): Promise<OurBroker[]> {
  const rows = (await sql`
    SELECT id, origin, destination, reference_id,
           broker_mc, broker_name, broker_phone, broker_email, pay_via, created_at,
           rate, loaded_miles, deadhead_miles, invoiced_at, paid_at, status
    FROM loads
    WHERE company_id = ${companyId}
      AND (broker_name IS NOT NULL OR broker_mc IS NOT NULL)
    ORDER BY created_at DESC`) as {
    id: number
    origin: string | null
    destination: string | null
    reference_id: string | null
    broker_mc: string | null
    broker_name: string | null
    broker_phone: string | null
    broker_email: string | null
    pay_via: string | null
    created_at: string
    rate: number | string
    loaded_miles: number | string
    deadhead_miles: number | string
    invoiced_at: string | null
    paid_at: string | null
    status: string
  }[]

  const money: MoneyRow[] = []
  // Люди копятся отдельно и сворачиваются в конце: один и тот же менеджер приходит
  // столько раз, сколько у него грузов.
  const repRows = new Map<string, { name: string | null; email: string | null; phone: string | null; at: string | null }[]>()
  const byKey = new Map<string, OurBroker>()
  for (const r of rows) {
    const mc = digits(r.broker_mc) || null
    const key = mc ?? emailDomain(r.broker_email) ?? (r.broker_name ?? '').toLowerCase().trim()
    if (!key) continue
    money.push({
      key,
      rate: Number(r.rate) || 0,
      miles: (Number(r.loaded_miles) || 0) + (Number(r.deadhead_miles) || 0),
      status: r.status,
      invoicedAt: r.invoiced_at && String(r.invoiced_at),
      paidAt: r.paid_at && String(r.paid_at),
    })

    // Неоплаченный = счёт выставлен, деньги не пришли. Не выставленный счёт сюда не
    // попадает: там нечего отмечать оплаченным, там надо выставлять.
    const unpaidRow =
      r.status !== 'cancelled' && r.invoiced_at && !r.paid_at
        ? {
            id: r.id,
            ref: r.reference_id,
            route: `${r.origin ?? '—'} → ${r.destination ?? '—'}`,
            rate: Number(r.rate) || 0,
            days: Math.max(0, Math.round((Date.now() - Date.parse(String(r.invoiced_at))) / 86400000)),
          }
        : null

    const seen = repRows.get(key) ?? []
    seen.push({
      name: r.broker_name,
      email: r.broker_email,
      phone: r.broker_phone,
      at: r.created_at ? String(r.created_at).slice(0, 10) : null,
    })
    repRows.set(key, seen)

    const existing = byKey.get(key)
    if (existing) {
      existing.loadCount++
      if (unpaidRow) existing.unpaid.push(unpaidRow)
      // rows are newest-first, so the first-seen values are already the freshest
      existing.name ??= r.broker_name
      existing.phone ??= r.broker_phone
      existing.email ??= r.broker_email
      existing.mc ??= mc
      existing.payVia ??= r.pay_via
    } else {
      byKey.set(key, {
        mc,
        name: r.broker_name,
        phone: r.broker_phone,
        email: r.broker_email,
        payVia: r.pay_via,
        loadCount: 1,
        lastLoad: r.created_at ? String(r.created_at).slice(0, 10) : null,
        gross: 0,
        rpm: 0,
        payDays: null,
        owed: 0,
        unpaid: unpaidRow ? [unpaidRow] : [],
        reps: [],
        registryName: null,
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
  // Проверяли когда-то и свою собственную компанию — в справочник брокеров она
  // попадать не должна: мы не брокер, и строка «MAYA LOGISTICS INC · НЕ активна»
  // говорит лишь о том, что у перевозчика нет брокерской authority.
  const { getCompany } = await import('./invoice')
  const ownMc = /\bMC\s*#?\s*[:\-]?\s*(\d{5,8})\b/i.exec((await getCompany()).mcdot ?? '')?.[1] ?? null

  for (const c of cached) {
    if (ownMc && c.mc === ownMc) continue
    const checkedAt = c.checked_at ? String(c.checked_at).slice(0, 10) : null
    const existing = byKey.get(c.mc)
    if (existing) {
      existing.authorityStatus = c.authority_status
      existing.checkedAt = checkedAt
      existing.registryName = c.legal_name ?? c.dba_name
      existing.name ??= c.legal_name ?? c.dba_name
      existing.phone ??= c.phone
    } else {
      byKey.set(c.mc, {
        mc: c.mc,
        name: c.legal_name ?? c.dba_name,
        phone: c.phone,
        email: null,
        payVia: null,
        loadCount: 0,
        lastLoad: null,
        gross: 0,
        rpm: 0,
        payDays: null,
        owed: 0,
        unpaid: [],
        reps: [],
        registryName: c.legal_name ?? c.dba_name,
        authorityStatus: c.authority_status,
        checkedAt,
      })
    }
  }

  const byMoney = foldMoney(money)
  for (const [key, b] of byKey) {
    if (!b.name && b.email) b.name = nameFromEmail(b.email)
    b.reps = foldReps(repRows.get(key) ?? [])
    const m = byMoney.get(key)
    if (m) Object.assign(b, m)
  }

  // Brokers with loads first (by count), then checked-only brokers newest first.
  return [...byKey.values()].sort(
    (a, b) => b.loadCount - a.loadCount || (b.checkedAt ?? '').localeCompare(a.checkedAt ?? ''),
  )
}

/**
 * MC этого брокера по НАШИМ прошлым грузам — когда в новом документе его нет.
 *
 * Рейт-кон печатает MC далеко не всегда: имя, телефон, номер груза — и всё. Но если
 * этот же брокер уже возил у нас и номер тогда нашёлся (или его проставили руками),
 * второй раз искать его негде и незачем. Сверяем по имени и по домену почты — тому
 * же ключу, по которому брокеры группируются в списке.
 *
 * Запрос к своей же базе, без похода в реестр: это делается на сохранении груза, и
 * ждать там чужую службу нельзя.
 */
export async function knownBrokerMc(
  companyId: string,
  name: string | null,
  email: string | null,
): Promise<string | null> {
  const key = (name ?? '').trim().toLowerCase()
  const domain = emailDomain(email)
  if (!key && !domain) return null
  const rows = (await sql`
    SELECT broker_mc FROM loads
    WHERE company_id = ${companyId}
      AND coalesce(broker_mc, '') <> ''
      AND (
        (${key} <> '' AND lower(coalesce(broker_name, '')) = ${key})
        OR (${domain ?? ''} <> '' AND lower(split_part(coalesce(broker_email, ''), '@', 2)) = ${domain ?? ''})
      )
    ORDER BY created_at DESC
    LIMIT 1`) as { broker_mc: string | null }[]
  const mc = digits(rows[0]?.broker_mc)
  return mc || null
}
