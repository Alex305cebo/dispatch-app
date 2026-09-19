'use client'

// Раскрытая строка «Рынка»: всё, что было на старых страницах «Брокеры» и «Склады»
// прямо в списке, без перехода в карточку. Владелец 19.09.2026: «Куда ты дел все
// функции с двух страниц? Сейчас я вижу просто какой-то список» — функции были в
// карточках по нажатию, а с виду их не было. Теперь строка раскрывается на месте, а
// карточка по адресу остаётся для ссылок.

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Stat } from '@/components/stat'
import { ShowMore } from '@/components/collapse'
import { BrokerNote, FacilityNote } from '@/components/facility-note'
import { BrokerTools } from '@/app/brokers/[key]/broker-tools'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { driveTime, usd, usd2 } from '@/lib/fmt'

export type DetailLoad = {
  id: number
  /** Дата, уже в US-формате. */
  date: string
  route: string
  ref: string | null
  rate: number
  /** Подпись статуса на языке страницы — считается на сервере. */
  statusText: string
  /** Сколько дней ждём денег по этому счёту; null — оплачен или не выставлен. */
  waiting: number | null
  /** Куда идти отмечать оплату («Документы»). */
  moneyHref: string | null
}

export type BrokerDetail = {
  name: string | null
  phone: string | null
  email: string | null
  payVia: string | null
  authorityStatus: string | null
  loadCount: number
  lastLoad: string | null
  gross: number
  rpm: number
  /** «платит на 12% ниже рынка» — уже на языке страницы. */
  vsText: string | null
  vsTone: 'good' | 'bad' | 'warn' | null
  vsInfo: string | null
  payGrade: 'good' | 'ok' | 'slow' | null
  unpaidCount: number
  reps: { name: string | null; email: string | null; phone: string | null; loads: number; lastAt: string | null }[]
  lanes: [string, number][]
  facilities: { key: string; name: string; visits: number }[]
  /** Последние грузы, неоплаченные первыми; остальное — в карточке. */
  loads: DetailLoad[]
  note: string | null
}

export type FacilityDetail = {
  where: string | null
  mapQuery: string
  lastDate: string | null
  dwellCount: number
  detentions: number
  freeMinutes: number
  directions: string | null
  note: string | null
  brokers: { key: string; name: string; n: number }[]
  loads: { id: number; date: string; route: string; rate: number }[]
}

const h3 = 'mb-1.5 text-sm font-semibold text-t1'
const loadRow = 'flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-white/8 px-3 py-2 text-base'

/** Ссылка на полную карточку — в правом верхнем углу раскрытой строки. */
function OpenCard({ href }: { href: string }) {
  const locale = useLocale()
  return (
    <Link href={href} className="inline-flex min-h-8 items-center gap-1 text-sm text-haul-300 hover:underline max-md:min-h-10">
      {t(locale, 'brokers.dir.open')}
      <ExternalLink size={13} aria-hidden />
    </Link>
  )
}

export function BrokerDetails({ brokerKey, mc, checked, payDays, owed, oldest, d }: {
  brokerKey: string
  mc: string | null
  checked: string | null
  payDays: number | null
  owed: number
  oldest: number
  d: BrokerDetail
}) {
  const locale = useLocale()
  const href = `/brokers/${encodeURIComponent(brokerKey)}`
  return (
    <div className="mt-2 border-t border-white/8 pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="nums text-sm text-t2">
          {mc ? `MC ${mc}` : t(locale, 'brokers.noMc')}
          {d.payVia && ` · ${t(locale, 'brokers.payVia').replace('{name}', d.payVia)}`}
        </p>
        <OpenCard href={href} />
      </div>
      {/* Реестр FMCSA, «Проверить», «Изменить» — как на старой странице, в строке. */}
      <BrokerTools
        broker={{
          key: brokerKey,
          mc,
          name: d.name,
          phone: d.phone,
          email: d.email,
          loadCount: d.loadCount,
          authorityStatus: d.authorityStatus,
          checked,
        }}
      />

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          compact
          label={t(locale, 'brokers.card.loads')}
          value={String(d.loadCount)}
          sub={d.lastLoad ? t(locale, 'brokers.lastLoad').replace('{date}', d.lastLoad) : undefined}
        />
        <Stat
          compact
          label={t(locale, 'brokers.card.rate')}
          value={d.rpm > 0 ? `${usd2.format(d.rpm)}/mi` : '—'}
          sub={d.vsText ?? t(locale, 'brokers.card.rateSub')}
          subTone={d.vsTone === 'good' ? 'good' : d.vsTone === 'bad' ? 'bad' : undefined}
          info={d.vsInfo ?? undefined}
        />
        <Stat
          compact
          label={t(locale, 'brokers.card.pays')}
          value={payDays != null ? t(locale, 'brokers.card.days').replace('{n}', String(payDays)) : '—'}
          tone={payDays == null ? undefined : payDays <= 30 ? 'good' : 'bad'}
          sub={d.payGrade ? t(locale, `brokers.grade.${d.payGrade}`) : undefined}
        />
        <Stat
          compact
          label={t(locale, 'brokers.card.owed')}
          value={usd.format(owed)}
          tone={owed > 0 && oldest > 30 ? 'bad' : undefined}
          sub={d.unpaidCount ? t(locale, 'brokers.card.owedSub').replace('{n}', String(d.unpaidCount)).replace('{d}', String(oldest)) : undefined}
        />
      </div>
      {/* Выручка — строкой под плитками: сколько этот брокер нам привёз за всё время. */}
      {d.loadCount > 0 && (
        <p className="nums mt-2 text-sm text-t2">
          {t(locale, 'brokers.gross').replace('{sum}', usd.format(d.gross))}
          {d.rpm > 0 && ` · ${t(locale, 'brokers.rpm').replace('{v}', usd2.format(d.rpm))}`}
        </p>
      )}

      {d.loadCount === 0 ? (
        <p className="mt-3 text-base text-t3">{t(locale, 'brokers.card.none')}</p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <section className="min-w-0">
            <h3 className={h3}>{t(locale, 'brokers.card.people')}</h3>
            {d.reps.length === 0 ? (
              <p className="nums text-base text-t2">{[d.phone, d.email].filter(Boolean).join(' · ') || '—'}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {d.reps.map((p, i) => (
                  <li key={(p.email ?? p.name ?? '') + i} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-base">
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
                    <span className="nums ml-auto text-sm text-t3">
                      {t(locale, 'brokers.repLoads').replace('{n}', String(p.loads))}
                      {p.lastAt ? ` · ${p.lastAt}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0">
            <h3 className={h3}>{t(locale, 'brokers.card.lanes')}</h3>
            <ul className="nums flex flex-col gap-0.5 text-base text-t1">
              {d.lanes.map(([lane, n]) => (
                <li key={lane} className="flex justify-between gap-3">
                  <span>{lane}</span>
                  <span className="text-t3">{n}</span>
                </li>
              ))}
            </ul>
            {d.facilities.length > 0 && (
              <>
                <h3 className={`${h3} mt-2.5`}>{t(locale, 'brokers.card.facilities')}</h3>
                <ul className="flex flex-col gap-0.5 text-base">
                  {d.facilities.map((f) => (
                    <li key={f.key} className="flex justify-between gap-3">
                      <Link href={`/facilities/${encodeURIComponent(f.key)}`} className="min-w-0 truncate text-haul-300 hover:underline">
                        {f.name}
                      </Link>
                      <span className="nums shrink-0 text-t3">{f.visits}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="min-w-0 md:col-span-2">
            <h3 className={h3}>
              {t(locale, 'brokers.card.loads')}
              {d.loadCount > d.loads.length && (
                <Link href={href} className="ml-2 font-normal text-haul-300 hover:underline">
                  {t(locale, 'brokers.dir.allLoads').replace('{n}', String(d.loadCount))} →
                </Link>
              )}
            </h3>
            <div className="flex flex-col gap-1.5">
              <ShowMore
                limit={4}
                label={t(locale, 'brokers.dir.more')}
                items={d.loads.map((l) => (
                  <div key={l.id} className={loadRow}>
                    <span className="nums w-[70px] shrink-0 text-t3">{l.date}</span>
                    <Link href={`/loads/${l.id}`} className="min-w-0 flex-1 truncate text-t1 hover:underline">
                      {l.route}
                      {l.ref ? ` · ${l.ref}` : ''}
                    </Link>
                    <span className="nums font-semibold text-t1">{usd.format(l.rate)}</span>
                    {l.waiting != null && l.moneyHref ? (
                      <Link href={l.moneyHref} className={`nums text-sm hover:underline ${l.waiting > 30 ? 'text-warn-400' : 'text-t3'}`}>
                        {t(locale, 'brokers.waitingDays').replace('{n}', String(l.waiting))} →
                      </Link>
                    ) : (
                      <span className="text-sm text-t3">{l.statusText}</span>
                    )}
                  </div>
                ))}
              />
            </div>
          </section>
        </div>
      )}

      <div className="mt-3">
        <BrokerNote brokerKey={brokerKey} note={d.note} />
      </div>
    </div>
  )
}

export function FacilityDetails({ facilityKey, visits, dwell, d }: { facilityKey: string; visits: number; dwell: number | null; d: FacilityDetail }) {
  const locale = useLocale()
  const href = `/facilities/${encodeURIComponent(facilityKey)}`
  return (
    <div className="mt-2 border-t border-white/8 pt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-sm text-t2">
          {d.where}
          {d.where && ' · '}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.mapQuery)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-haul-300 hover:underline"
          >
            {t(locale, 'facilities.card.map')}
          </a>
        </p>
        <OpenCard href={href} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat
          compact
          label={t(locale, 'facilities.card.visits')}
          value={t(locale, 'facilities.card.times').replace('{n}', String(visits))}
          sub={d.lastDate ? t(locale, 'brokers.lastLoad').replace('{date}', d.lastDate) : undefined}
        />
        <Stat
          compact
          label={t(locale, 'facilities.card.dwell')}
          value={dwell != null ? driveTime(dwell, locale) : '—'}
          tone={dwell != null && dwell >= d.freeMinutes ? 'bad' : undefined}
          sub={d.dwellCount ? t(locale, 'facilities.card.dwellSub').replace('{n}', String(d.dwellCount)) : t(locale, 'facilities.card.noDwell')}
        />
        <Stat
          compact
          label={t(locale, 'facilities.card.detention')}
          value={t(locale, 'facilities.card.detentionOf').replace('{n}', String(d.detentions)).replace('{m}', String(d.dwellCount))}
          tone={d.detentions >= 2 ? 'bad' : undefined}
        />
      </div>

      {d.directions && (
        <p className="mt-3 rounded-lg bg-warn-500/10 px-3 py-2 text-base text-t1">
          <span className="font-semibold text-warn-400">⚠ {t(locale, 'facilities.lastDirections')}:</span> {d.directions}
        </p>
      )}
      <div className="mt-2">
        <FacilityNote facilityKey={facilityKey} note={d.note} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="min-w-0">
          <h3 className={h3}>{t(locale, 'facilities.card.brokers')}</h3>
          {d.brokers.length === 0 ? (
            <p className="text-base text-t3">—</p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-base">
              {d.brokers.map((b) => (
                <li key={b.key} className="flex justify-between gap-3">
                  <Link href={`/brokers/${encodeURIComponent(b.key)}`} className="min-w-0 truncate text-haul-300 hover:underline">
                    {b.name}
                  </Link>
                  <span className="nums shrink-0 text-t3">{b.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="min-w-0">
          <h3 className={h3}>
            {t(locale, 'facilities.card.history')}
            {visits > d.loads.length && (
              <Link href={href} className="ml-2 font-normal text-haul-300 hover:underline">
                {t(locale, 'brokers.dir.allLoads').replace('{n}', String(visits))} →
              </Link>
            )}
          </h3>
          <div className="flex flex-col gap-1.5">
            <ShowMore
              limit={4}
              label={t(locale, 'brokers.dir.more')}
              items={d.loads.map((l) => (
                <Link key={l.id} href={`/loads/${l.id}`} className={`${loadRow} hover:border-white/20`}>
                  <span className="nums w-[70px] shrink-0 text-t3">{l.date}</span>
                  <span className="min-w-0 flex-1 truncate text-t1">{l.route}</span>
                  <span className="nums text-t2">{usd.format(l.rate)}</span>
                </Link>
              ))}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
