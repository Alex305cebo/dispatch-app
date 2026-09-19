import Link from 'next/link'
import { notFound } from 'next/navigation'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { listOurBrokers } from '@/lib/brokers'
import { brokerKeyOf, brokerNoteKey, prettyCompany } from '@/lib/broker-key'
import { listLoads } from '@/lib/loads'
import { allStopEvents } from '@/lib/load-events'
import { detentionTerms, getSettings } from '@/lib/settings'
import { facilityIndex } from '@/lib/facilities'
import { stateOfCity } from '@/lib/toll-spend'
import { financesHref } from '@/lib/payments'
import { pctText } from '@/lib/dat-market-core'
import { usd, usd2, usDate } from '@/lib/fmt'
import { Stat } from '@/components/stat'
import { ShowMore } from '@/components/collapse'
import { BrokerNote } from '@/components/facility-note'
import { BrokerTools } from './broker-tools'

export const dynamic = 'force-dynamic'

/** Ключ мог прийти уже раскодированным: «100% Logistics» второй раз не раскодировать. */
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Карточка брокера: всё, чтобы решить «брать ли у него груз» и «кому звонить». Сверху
 * реестр и четыре цифры по своей истории, ниже люди, куда с ним возим, грузы (неоплаченные
 * первыми) и заметка. Ключ в адресе — brokerKeyOf: MC, домен почты или название.
 */
export default async function BrokerPage({ params }: { params: Promise<{ key: string }> }) {
  const key = safeDecode((await params).key)
  const companyId = await companyScope()
  const locale = await getLocale()
  const [brokers, loads, events, terms, notes] = await Promise.all([
    listOurBrokers(companyId),
    listLoads(companyId),
    allStopEvents(companyId),
    detentionTerms(),
    getSettings([brokerNoteKey(key)]),
  ])
  const b = brokers.find((x) => x.key === key)
  if (!b) notFound()

  const when = (l: { pickupDate: string | null; createdAt: string }) => l.pickupDate ?? l.createdAt
  const mine = loads
    .filter((l) => l.status !== 'cancelled' && brokerKeyOf({ mc: l.brokerMc, email: l.brokerEmail, name: l.brokerName }) === key)
    .sort((x, y) => when(y).localeCompare(when(x)))
  const unpaid = new Map(b.unpaid.map((u) => [u.id, u]))
  const lanes = [
    ...mine
      .reduce((m, l) => {
        const lane = `${stateOfCity(l.origin) ?? '—'} → ${stateOfCity(l.destination) ?? '—'}`
        return m.set(lane, (m.get(lane) ?? 0) + 1)
      }, new Map<string, number>())
      .entries(),
  ]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5)
  const facilities = [...facilityIndex(mine, events, terms.free).values()].sort((x, y) => y.visits - x.visits).slice(0, 6)

  const name = prettyCompany(b.registryName) ?? b.name ?? '—'
  const oldest = Math.max(0, ...b.unpaid.map((u) => u.days))
  const vs = b.vsMarket
  const vsText = vs
    ? vs.tone === 'warn'
      ? t(locale, 'brokers.vsMarketIn').replace('{pct}', pctText(vs.diff))
      : t(locale, vs.diff > 0 ? 'brokers.vsMarketAbove' : 'brokers.vsMarketBelow').replace('{pct}', String(Math.abs(Math.round(vs.diff))))
    : null
  // Неоплаченные первыми: с ними разговор нужен сегодня.
  const ordered = [...mine.filter((l) => unpaid.has(l.id)), ...mine.filter((l) => !unpaid.has(l.id))]
  const h2 = 'mb-2 text-base leading-6 font-semibold text-t1'

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <Link href="/brokers" className="text-[12.5px] text-t3 hover:text-white">
        ← {t(locale, 'nav.brokers')}
      </Link>
      <h1 className="mt-2 break-words text-xl font-bold tracking-tight">{name}</h1>
      <p className="nums text-[13px] text-t2">
        {b.mc ? `MC ${b.mc}` : t(locale, 'brokers.noMc')}
        {b.payVia && ` · ${t(locale, 'brokers.payVia').replace('{name}', b.payVia)}`}
      </p>
      <BrokerTools
        broker={{
          key: b.key,
          mc: b.mc,
          name: b.name,
          phone: b.phone,
          email: b.email,
          loadCount: b.loadCount,
          authorityStatus: b.authorityStatus,
          checked: b.checkedAt ? usDate(b.checkedAt) : null,
        }}
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat
          label={t(locale, 'brokers.card.loads')}
          value={String(b.loadCount)}
          sub={b.lastLoad ? t(locale, 'brokers.lastLoad').replace('{date}', usDate(b.lastLoad)) : undefined}
        />
        <Stat
          label={t(locale, 'brokers.card.rate')}
          value={b.rpm > 0 ? `${usd2.format(b.rpm)}/mi` : '—'}
          sub={vsText ?? t(locale, 'brokers.card.rateSub')}
          subTone={vs?.tone === 'good' ? 'good' : vs?.tone === 'bad' ? 'bad' : undefined}
        />
        <Stat
          label={t(locale, 'brokers.card.pays')}
          value={b.payDays != null ? t(locale, 'brokers.card.days').replace('{n}', String(b.payDays)) : '—'}
          tone={b.payDays == null ? undefined : b.payDays <= 30 ? 'good' : 'bad'}
          sub={b.payGrade ? t(locale, `brokers.grade.${b.payGrade}`) : undefined}
        />
        <Stat
          label={t(locale, 'brokers.card.owed')}
          value={usd.format(b.owed)}
          tone={b.owed > 0 && oldest > 30 ? 'bad' : undefined}
          sub={
            b.unpaid.length
              ? t(locale, 'brokers.card.owedSub').replace('{n}', String(b.unpaid.length)).replace('{d}', String(oldest))
              : undefined
          }
        />
      </div>

      {b.loadCount === 0 ? (
        <p className="mt-4 text-[13px] text-t3">{t(locale, 'brokers.card.none')}</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <section className="panel min-w-0 p-4">
              <h2 className={h2}>{t(locale, 'brokers.card.people')}</h2>
              {b.reps.length === 0 ? (
                <p className="nums text-[13px] text-t2">
                  {[b.phone, b.email].filter(Boolean).join(' · ') || '—'}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {b.reps.map((p, i) => (
                    <li key={(p.email ?? p.name ?? '') + i} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px]">
                      <span className="min-w-0 font-medium text-t1">{p.name ?? p.email}</span>
                      {p.phone && (
                        <a href={`tel:${p.phone.replace(/[^+\d]/g, '')}`} className="nums text-t2 hover:text-white hover:underline">
                          {p.phone}
                        </a>
                      )}
                      {p.email && p.name && (
                        <a href={`mailto:${p.email}`} className="min-w-0 truncate text-t2 hover:text-white hover:underline">
                          {p.email}
                        </a>
                      )}
                      <span className="nums ml-auto text-[12px] text-t3">
                        {t(locale, 'brokers.repLoads').replace('{n}', String(p.loads))}
                        {p.lastAt ? ` · ${usDate(p.lastAt)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel min-w-0 p-4">
              <h2 className={h2}>{t(locale, 'brokers.card.lanes')}</h2>
              <ul className="nums flex flex-col gap-1 text-[13px] text-t1">
                {lanes.map(([lane, n]) => (
                  <li key={lane} className="flex justify-between gap-3">
                    <span>{lane}</span>
                    <span className="text-t3">{n}</span>
                  </li>
                ))}
              </ul>
              {facilities.length > 0 && (
                <>
                  <h3 className="mb-1 mt-3 text-[12px] font-medium text-t3">{t(locale, 'brokers.card.facilities')}</h3>
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {facilities.map((f) => (
                      <li key={f.key} className="flex justify-between gap-3">
                        <Link href={`/facilities/${encodeURIComponent(f.key)}`} className="min-w-0 truncate text-haul-300 hover:underline">
                          {f.name ?? f.address ?? f.city}
                          {f.name && f.city ? ` · ${f.city}` : ''}
                        </Link>
                        <span className="nums shrink-0 text-t3">{f.visits}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>

          <section className="panel mt-4 p-4">
            <h2 className={h2}>{t(locale, 'brokers.card.loads')}</h2>
            <div className="flex flex-col gap-1.5">
              <ShowMore
                limit={8}
                label={t(locale, 'brokers.dir.more')}
                items={ordered.map((l) => {
                  const u = unpaid.get(l.id)
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-white/8 px-3 py-2 text-[13px]">
                      <span className="nums w-[70px] shrink-0 text-t3">{usDate(when(l))}</span>
                      <Link href={`/loads/${l.id}`} className="min-w-0 flex-1 truncate text-t1 hover:underline">
                        {l.origin ?? '—'} → {l.destination ?? '—'}
                        {l.referenceId ? ` · ${l.referenceId}` : ''}
                      </Link>
                      <span className="nums font-semibold text-t1">{usd.format(Number(l.rate) || 0)}</span>
                      {u ? (
                        <Link
                          href={financesHref({ id: l.id, referenceId: l.referenceId })}
                          className={`nums text-[12px] hover:underline ${u.days > 30 ? 'text-warn-400' : 'text-t3'}`}
                        >
                          {t(locale, 'brokers.waitingDays').replace('{n}', String(u.days))} →
                        </Link>
                      ) : (
                        <span className="text-[12px] text-t3">{t(locale, `status.${l.status}`)}</span>
                      )}
                    </div>
                  )
                })}
              />
            </div>
          </section>
        </>
      )}

      <section className="panel mt-4 p-4">
        <BrokerNote brokerKey={b.key} note={notes.get(brokerNoteKey(b.key)) ?? null} />
      </section>
    </main>
  )
}
