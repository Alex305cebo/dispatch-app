import Link from 'next/link'
import { notFound } from 'next/navigation'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { listLoads } from '@/lib/loads'
import { allStopEvents } from '@/lib/load-events'
import { detentionTerms, getSettings } from '@/lib/settings'
import { avgDwell, facilityIndex, facilityNoteKey } from '@/lib/facilities'
import { listOurBrokers } from '@/lib/brokers'
import { brokerKeyOf, prettyCompany } from '@/lib/broker-key'
import { driveTime, usd, usDate } from '@/lib/fmt'
import { Stat } from '@/components/stat'
import { ShowMore } from '@/components/collapse'
import { FacilityNote } from '@/components/facility-note'

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
 * Карточка склада: сколько раз были, сколько стоим, как часто детеншн, как заехать и
 * заметка (она уходит водителю), кто из брокеров возит сюда и сами грузы. Всё — из прошлых
 * грузов и отметок водителя, ничего не вводится руками, кроме заметки.
 */
export default async function FacilityPage({ params }: { params: Promise<{ key: string }> }) {
  const key = safeDecode((await params).key)
  const companyId = await companyScope()
  const locale = await getLocale()
  const [loads, events, terms, notes, brokers] = await Promise.all([
    listLoads(companyId),
    allStopEvents(companyId),
    detentionTerms(),
    getSettings([facilityNoteKey(key)]),
    listOurBrokers(companyId),
  ])
  const f = facilityIndex(loads, events, terms.free).get(key)
  if (!f) notFound()

  const when = (l: { pickupDate: string | null; createdAt: string }) => l.pickupDate ?? l.createdAt
  const here = loads.filter((l) => f.loadIds.includes(l.id)).sort((x, y) => when(y).localeCompare(when(x)))
  const brokerName = new Map(brokers.map((b) => [b.key, prettyCompany(b.registryName) ?? b.name ?? b.key]))
  const who = [
    ...here
      .reduce((m, l) => {
        const k = brokerKeyOf({ mc: l.brokerMc, email: l.brokerEmail, name: l.brokerName })
        return k ? m.set(k, (m.get(k) ?? 0) + 1) : m
      }, new Map<string, number>())
      .entries(),
  ].sort((x, y) => y[1] - x[1])

  const dwell = avgDwell(f)
  const title = f.name ?? f.address ?? f.city ?? '—'
  const where = f.address ?? f.city
  const mapQuery = [f.name, f.address ?? f.city].filter(Boolean).join(', ')
  const h2 = 'mb-2 text-base leading-6 font-semibold text-white/90'

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <Link href="/brokers?view=facilities" className="text-[12.5px] text-white/55 hover:text-white">
        ← {t(locale, 'nav.brokers')}
      </Link>
      <h1 className="mt-2 break-words text-xl font-bold tracking-tight">{title}</h1>
      {where && (
        <p className="text-[13px] text-white/60">
          {where} ·{' '}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-haul-400 hover:underline"
          >
            {t(locale, 'facilities.card.map')}
          </a>
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <Stat
          label={t(locale, 'facilities.card.visits')}
          value={t(locale, 'facilities.card.times').replace('{n}', String(f.visits))}
          sub={f.lastDate ? t(locale, 'brokers.lastLoad').replace('{date}', usDate(f.lastDate)) : undefined}
        />
        <Stat
          label={t(locale, 'facilities.card.dwell')}
          value={dwell != null ? driveTime(dwell, locale) : '—'}
          tone={dwell != null && dwell >= terms.free * 60 ? 'bad' : undefined}
          sub={
            f.dwell.length
              ? t(locale, 'facilities.card.dwellSub').replace('{n}', String(f.dwell.length))
              : t(locale, 'facilities.card.noDwell')
          }
        />
        <Stat
          label={t(locale, 'facilities.card.detention')}
          value={t(locale, 'facilities.card.detentionOf').replace('{n}', String(f.detentions)).replace('{m}', String(f.dwell.length))}
          tone={f.detentions >= 2 ? 'bad' : undefined}
        />
      </div>

      <section className="panel mt-4 p-4">
        {f.directions && (
          <p className="mb-2 rounded-lg bg-warn-500/10 px-3 py-2 text-[13px] text-white/85">
            <span className="font-semibold text-warn-400">⚠ {t(locale, 'facilities.lastDirections')}:</span> {f.directions}
          </p>
        )}
        <FacilityNote facilityKey={f.key} note={notes.get(facilityNoteKey(f.key)) ?? null} />
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="panel min-w-0 p-4">
          <h2 className={h2}>{t(locale, 'facilities.card.brokers')}</h2>
          {who.length === 0 ? (
            <p className="text-[13px] text-white/50">—</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px]">
              {who.map(([k, n]) => (
                <li key={k} className="flex justify-between gap-3">
                  <Link href={`/brokers/${encodeURIComponent(k)}`} className="min-w-0 truncate text-haul-300 hover:underline">
                    {brokerName.get(k) ?? k}
                  </Link>
                  <span className="nums shrink-0 text-white/50">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel min-w-0 p-4">
          <h2 className={h2}>{t(locale, 'facilities.card.history')}</h2>
          <div className="flex flex-col gap-1.5">
            <ShowMore
              limit={8}
              label={t(locale, 'brokers.dir.more')}
              items={here.map((l) => (
                <Link
                  key={l.id}
                  href={`/loads/${l.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-white/8 px-3 py-2 text-[13px] hover:border-white/20"
                >
                  <span className="nums w-[70px] shrink-0 text-white/50">{usDate(when(l))}</span>
                  <span className="min-w-0 flex-1 truncate text-white/85">
                    {l.origin ?? '—'} → {l.destination ?? '—'}
                  </span>
                  <span className="nums text-white/70">{usd.format(Number(l.rate) || 0)}</span>
                </Link>
              ))}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
