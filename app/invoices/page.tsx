import Link from 'next/link'
import {
  listLoads,
  listLoadsByDispatcher,
  listPaidLoads,
  listReceivables,
  listTrucks,
  listUninvoicedDelivered,
  rateConByLoad,
  type LoadWithDispatcher,
  type Receivable,
} from '@/lib/loads'
import type { LoadRecord } from '@/lib/map'
import { calcLoad, type Breakdown } from '@/lib/profit'
import { usd, usd2, weekAnchorOf, weekLabel, weekStart } from '@/lib/fmt'
import { truckLabel, type TruckRecord } from '@/lib/map'
import { redirect } from 'next/navigation'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale } from '@/lib/i18n'
import { getSetting } from '@/lib/settings'
import { can } from '@/lib/capabilities-server'
import { PaidToggle } from '@/components/invoice-actions'
import { RateConButton } from '@/components/ratecon-button'
import { Info } from '@/components/info'
import { CircleCheckBig, Wallet } from 'lucide-react'
import { Collapse } from '@/components/collapse'
import { Empty } from '@/components/empty'

export const dynamic = 'force-dynamic'

function tabDescription(locale: Locale): Record<string, string> {
  return {
    weeks: t(locale, 'finances.tabDesc.weeks'),
    unpaid: t(locale, 'finances.tabDesc.unpaid'),
    paid: t(locale, 'finances.tabDesc.paid'),
    dispatchers: t(locale, 'finances.tabDesc.dispatchers'),
    drivers: t(locale, 'finances.tabDesc.drivers'),
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser()
  // Whole section is capability-gated — a dispatcher without it can't even URL in.
  if (!(await can(user, 'finances'))) redirect('/')
  // "По диспетчерам" is its own capability (default on) — a cross-dispatcher earnings
  // view. A user without it who lands on ?tab=dispatchers falls back to "unpaid".
  const canReport = await can(user, 'dispatcher_report')
  const tabParam = (await searchParams).tab
  // «Недели» — по умолчанию: владельца в первую очередь интересует, сколько парк
  // привёз за неделю (гросс) и из чего это сложилось. Оплачено/не оплачено — вопрос
  // бухгалтера, он идёт за ним отдельной вкладкой.
  const tab =
    tabParam === 'paid'
      ? 'paid'
      : tabParam === 'unpaid'
        ? 'unpaid'
        : tabParam === 'drivers'
          ? 'drivers'
          : tabParam === 'dispatchers' && canReport
            ? 'dispatchers'
            : 'weeks'
  const companyId = await companyScope()
  const locale = await getLocale()
  const rateCons = await rateConByLoad(companyId)

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          {t(locale, 'finances.title')}
          <Info
            side="bottom"
            text={
              t(locale, 'finances.info.main') +
              (canReport ? t(locale, 'finances.info.dispatchers') : '') +
              t(locale, 'finances.info.tail')
            }
          />
        </h1>
        <p className="text-[13px] text-white/65">{tabDescription(locale)[tab]}</p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-white/8">
        <Tab href="/invoices" active={tab === 'weeks'}>
          {t(locale, 'finances.tab.weeks')}
        </Tab>
        {canReport && (
          <Tab href="/invoices?tab=dispatchers" active={tab === 'dispatchers'}>
            {t(locale, 'finances.tab.dispatchers')}
          </Tab>
        )}
        <Tab href="/invoices?tab=unpaid" active={tab === 'unpaid'}>
          {t(locale, 'finances.tab.unpaid')}
        </Tab>
        <Tab href="/invoices?tab=paid" active={tab === 'paid'}>
          {t(locale, 'finances.tab.paid')}
        </Tab>
        <Tab href="/invoices?tab=drivers" active={tab === 'drivers'}>
          {t(locale, 'finances.tab.drivers')}
        </Tab>
      </div>

      {tab === 'weeks' ? (
        <ByWeek companyId={companyId} rateCons={rateCons} locale={locale} />
      ) : tab === 'unpaid' ? (
        <Unpaid companyId={companyId} rateCons={rateCons} locale={locale} />
      ) : tab === 'paid' ? (
        <Paid companyId={companyId} rateCons={rateCons} locale={locale} />
      ) : tab === 'drivers' ? (
        <ByDriver companyId={companyId} locale={locale} />
      ) : (
        <ByDispatcher companyId={companyId} locale={locale} />
      )}

      {/* Реквизиты компании — в Админе (одно место, а не два); IFTA-заглушка убрана. */}
    </main>
  )
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        active ? 'border-haul-500 text-white' : 'border-transparent text-white/55 hover:text-white/85'
      }`}
    >
      {children}
    </Link>
  )
}

async function Unpaid({
  companyId,
  rateCons,
  locale,
}: {
  companyId: 'default' | 'demo'
  rateCons: Map<number, number>
  locale: Locale
}) {
  const [rec, uninvoiced] = await Promise.all([listReceivables(companyId), listUninvoicedDelivered(companyId)])
  const total = rec.reduce((s, r) => s + r.load.rate, 0)
  const uninvoicedTotal = uninvoiced.reduce((s, l) => s + l.rate, 0)
  const overdue = rec.filter((r) => r.overdue)
  const buckets = {
    '0-30': rec.filter((r) => r.bucket === '0-30'),
    '31-45': rec.filter((r) => r.bucket === '31-45'),
    '45+': rec.filter((r) => r.bucket === '45+'),
  }

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t(locale, 'finances.stat.waitingTotal')}
          value={usd.format(total + uninvoicedTotal)}
          info={
            uninvoicedTotal > 0
              ? t(locale, 'finances.stat.waitingInfo').replace('{amt}', usd.format(uninvoicedTotal))
              : undefined
          }
        />
        <Stat
          label={t(locale, 'finances.stat.bucket030')}
          value={usd.format(buckets['0-30'].reduce((s, r) => s + r.load.rate, 0))}
        />
        <Stat
          label={t(locale, 'finances.stat.bucket3145')}
          value={usd.format(buckets['31-45'].reduce((s, r) => s + r.load.rate, 0))}
          tone={buckets['31-45'].length ? 'warn' : undefined}
        />
        <Stat
          label={t(locale, 'finances.stat.bucket45plus')}
          value={usd.format(buckets['45+'].reduce((s, r) => s + r.load.rate, 0))}
          tone={buckets['45+'].length || overdue.length ? 'bad' : undefined}
        />
      </div>

      {/* Delivered but never invoiced — these used to just vanish: not in this list
          (no invoiced_at yet), not visible anywhere else either. */}
      {uninvoiced.length > 0 && (
        <div className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'finances.uninvoiced.heading')} · {usd.format(uninvoicedTotal)}
            <Info text={t(locale, 'finances.uninvoiced.info')} />
          </h2>
          <div className="flex flex-col gap-2">
            {uninvoiced.map((load) => (
              <div key={load.id} className="panel flex items-center gap-4 p-4 border-warn-400/20">
                <Link href={`/loads/${load.id}`} className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">
                    {load.origin ?? '—'} → {load.destination ?? '—'}
                  </div>
                  <div className="mt-0.5 text-[12px] text-white/60">
                    {load.brokerMc ? `MC ${load.brokerMc} · ` : ''}
                    {t(locale, 'finances.uninvoiced.cta')}
                  </div>
                </Link>
                <span className="nums shrink-0 text-[15px] font-bold">{usd.format(load.rate)}</span>
                {rateCons.get(load.id) && <RateConButton docId={rateCons.get(load.id)!} compact />}
              </div>
            ))}
          </div>
        </div>
      )}

      {rec.length === 0 ? (
        uninvoiced.length === 0 && (
          <Empty icon={CircleCheckBig} title={t(locale, 'finances.unpaid.empty')} />
        )
      ) : (
        /* Was one flat column of every outstanding invoice — fine at eight rows, a
           scrolling wall at eighty, with the overdue ones buried somewhere inside it.
           Now grouped by how late the money is: overdue opens by default because it
           is the only group that needs acting on today; the healthy buckets stay
           collapsed but still state their count and total in the header. */
        <div className="flex flex-col gap-2">
          {AGING_GROUPS.map((g) => {
            const rows = g.pick(rec, overdue)
            if (rows.length === 0) return null
            return (
              <Collapse
                key={g.key}
                title={t(locale, g.labelKey)}
                count={rows.length}
                amount={usd.format(rows.reduce((s, r) => s + r.load.rate, 0))}
                tone={g.tone}
                defaultOpen={g.open}
              >
                <div className="flex flex-col gap-2">{rows.map((r) => renderReceivable(r))}</div>
              </Collapse>
            )
          })}
        </div>
      )}
    </>
  )

  function renderReceivable(r: Receivable) {
    return (
            <div
              key={r.load.id}
              className={`panel flex items-center gap-4 p-4 ${r.overdue ? 'border-bad-500/30' : ''}`}
            >
              <Link href={`/loads/${r.load.id}`} className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">
                  {r.load.invoiceNumber} · {r.load.origin ?? '—'} → {r.load.destination ?? '—'}
                </div>
                <div className="mt-0.5 text-[12px] text-white/60">
                  {r.load.brokerMc ? `MC ${r.load.brokerMc} · ` : ''}
                  <span className={r.overdue ? 'text-bad-400' : 'text-white/60'}>
                    {t(locale, 'finances.unpaid.daysOut')
                      .replace('{d}', String(r.daysOut))
                      .replace('{n}', String(r.load.paymentTermsDays))}
                    {r.overdue ? t(locale, 'finances.unpaid.overdue') : ''}
                  </span>
                </div>
              </Link>
              <span className="nums shrink-0 text-[15px] font-bold">{usd.format(r.load.rate)}</span>
              {rateCons.get(r.load.id) && <RateConButton docId={rateCons.get(r.load.id)!} compact />}
              <PaidToggle loadId={r.load.id} />
            </div>
    )
  }
}

/** Aging groups for the unpaid tab, in the order a dispatcher works them: what is
 * already late first, then the healthy buckets by age. `overdue` is deliberately its
 * own group rather than a tint inside the buckets — a 20-day-old invoice past its
 * terms and a 20-day-old invoice inside them call for different actions. */
const AGING_GROUPS = [
  {
    key: 'overdue',
    labelKey: 'finances.group.overdue' as const,
    tone: 'bad' as const,
    open: true,
    pick: (_rec: Receivable[], overdue: Receivable[]) => overdue,
  },
  {
    key: '0-30',
    labelKey: 'finances.stat.bucket030' as const,
    tone: 'plain' as const,
    open: false,
    pick: (rec: Receivable[]) => rec.filter((r) => !r.overdue && r.bucket === '0-30'),
  },
  {
    key: '31-45',
    labelKey: 'finances.stat.bucket3145' as const,
    tone: 'warn' as const,
    open: false,
    pick: (rec: Receivable[]) => rec.filter((r) => !r.overdue && r.bucket === '31-45'),
  },
  {
    key: '45+',
    labelKey: 'finances.stat.bucket45plus' as const,
    tone: 'bad' as const,
    open: true,
    pick: (rec: Receivable[]) => rec.filter((r) => !r.overdue && r.bucket === '45+'),
  },
]

async function Paid({
  companyId,
  rateCons,
  locale,
}: {
  companyId: 'default' | 'demo'
  rateCons: Map<number, number>
  locale: Locale
}) {
  // One listTrucks, not one getTruck per load. truckForLoad() inside a .map() was a
  // query per paid row — and getTruck is not cached, so ten loads on the same truck were
  // ten identical queries. The tab grows without bound as paid loads pile up, which is
  // the one direction this list only ever moves. Both sibling tabs below already do it
  // this way; this one was the outlier.
  const [loads, allTrucks] = await Promise.all([listPaidLoads(companyId), listTrucks(companyId)])
  const byTruckId = new Map<number, TruckRecord>(allTrucks.map((tr) => [tr.id, tr]))
  // Same fallback truckForLoad() had: a load with no truck (or a dangling truck_id)
  // still needs SOME cost model to price against, and the first truck is what the rest
  // of the app uses for that.
  const trucks = loads.map((l) => (l.truckId !== null ? byTruckId.get(l.truckId) : undefined) ?? allTrucks[0]!)
  // Old/incomplete loads can be missing miles or transit days — calcLoad throws on
  // those rather than guess, so a paid row without clean economics just shows the
  // rate with no breakdown instead of taking the whole tab down.
  const rows = loads.map((load, i) => {
    let r: Breakdown | null = null
    try {
      r = calcLoad(load, trucks[i])
    } catch {
      r = null
    }
    return { load, r }
  })

  const totalGross = rows.reduce((s, x) => s + x.load.rate, 0)
  const totalMiles = rows.reduce((s, x) => s + (x.r?.totalMiles ?? 0), 0)
  const avgRpm = totalMiles > 0 ? rows.reduce((s, x) => s + (x.r ? x.r.gross : 0), 0) / totalMiles : 0

  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label={t(locale, 'finances.stat.paidTotal')} value={usd.format(totalGross)} />
        <Stat label={t(locale, 'finances.stat.loadsCount')} value={String(rows.length)} />
        <Stat label={t(locale, 'finances.stat.avgRpm')} value={totalMiles > 0 ? `$${avgRpm.toFixed(2)}/mi` : '—'} />
      </div>

      {rows.length === 0 ? (
        <Empty icon={Wallet} title={t(locale, 'finances.paid.empty')} />
      ) : (
        /* Grouped by the month the money landed, newest month open. Paid loads only
           accumulate — this list is 25 rows on a demo fleet and will be hundreds on a
           real one, at which point a single flat column stops being a record you can
           read and becomes one you have to scroll past. The month header carries its
           own total, which is the figure anyone actually opens this tab for. */
        <div className="flex flex-col gap-2">
          {groupByMonth(rows, locale).map((g, i) => (
            <Collapse
              key={g.key}
              title={g.title}
              count={g.rows.length}
              amount={usd.format(g.gross)}
              tone={i === 0 ? 'good' : 'plain'}
              defaultOpen={i === 0}
            >
              <div className="flex flex-col gap-2">{g.rows.map(({ load, r }) => (
            <div key={load.id} className="panel flex items-center gap-4 p-4">
              <Link href={`/loads/${load.id}`} className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">
                  {load.invoiceNumber} · {load.origin ?? '—'} → {load.destination ?? '—'}
                </div>
                <div className="mt-0.5 text-[12px] text-white/60">
                  {load.paidAt
                    ? new Date(load.paidAt).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')
                    : '—'}
                  {r ? (
                    <>
                      {' '}
                      · {r.allInRpm.toFixed(2)} $/mi · {r.totalMiles} mi
                    </>
                  ) : null}
                </div>
              </Link>
              <span className="nums shrink-0 text-[15px] font-bold">{usd.format(load.rate)}</span>
              {rateCons.get(load.id) && <RateConButton docId={rateCons.get(load.id)!} compact />}
              <PaidToggle loadId={load.id} paid />
            </div>
          ))}</div>
            </Collapse>
          ))}
        </div>
      )}
    </>
  )
}

/** Paid rows bucketed by payment month, newest first. Rows with no paidAt (legacy
 * data marked paid before the timestamp existed) fall into their own trailing group
 * rather than being dropped or dumped into whatever month happens to be first. */
function groupByMonth<T extends { load: { paidAt: string | null } }>(rows: T[], locale: Locale) {
  const fmt = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
  const groups = new Map<string, { key: string; title: string; rows: T[]; gross: number }>()
  for (const row of rows) {
    const d = row.load.paidAt ? new Date(row.load.paidAt) : null
    const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'zzz-unknown'
    const title = d ? fmt.format(d) : '—'
    if (!groups.has(key)) groups.set(key, { key, title, rows: [], gross: 0 })
    const g = groups.get(key)!
    g.rows.push(row)
    g.gross += (row as unknown as { load: { rate: number } }).load.rate
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key))
}

type DriverBucket = {
  truckId: number
  label: string
  loads: LoadWithDispatcher[]
  gross: number
  net: number
  miles: number
}
type DispatcherBucket = { key: string; name: string; drivers: Map<number, DriverBucket>; gross: number; net: number }
type WeekBucket = { weekStartMs: number; dispatchers: Map<string, DispatcherBucket>; gross: number; net: number }

/** Weekly settlement view: every load, grouped by the calendar week it was booked
 * in, then by which dispatcher created it, then by that dispatcher's driver/truck —
 * "who earned what, with which driver, which week" in one place. Dispatcher is
 * whoever was actually signed in when the load was created (auto, not assigned by
 * hand) — loads from before this was tracked land under "Без диспетчера". */
async function ByDispatcher({ companyId, locale }: { companyId: 'default' | 'demo'; locale: Locale }) {
  const [loads, trucks, openAccess] = await Promise.all([
    listLoadsByDispatcher(companyId),
    listTrucks(companyId),
    getSetting('open_access'),
  ])
  const byTruckId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const fallback = trucks[0]

  const weeks = new Map<number, WeekBucket>()
  for (const load of loads) {
    const truck = (load.truckId !== null ? byTruckId.get(load.truckId) : undefined) ?? fallback
    if (!truck) continue // no truck configured at all — nothing sensible to cost against
    let r: Breakdown | null = null
    try {
      r = calcLoad(load, truck)
    } catch {
      r = null
    }
    const gross = load.rate
    const net = r?.net ?? 0
    // Straight from the load, not r.totalMiles — calcLoad can throw for reasons that
    // have nothing to do with mileage (e.g. transitDays <= 0), which would silently
    // zero out this driver's mile total while the row right below it still shows the
    // load's real miles. Raw miles don't need calcLoad to be valid.
    const miles = load.loadedMiles + load.deadheadMiles

    const weekMs = weekAnchorOf(new Date(load.createdAt).getTime())
    let week = weeks.get(weekMs)
    if (!week) {
      week = { weekStartMs: weekMs, dispatchers: new Map(), gross: 0, net: 0 }
      weeks.set(weekMs, week)
    }
    const dKey = load.dispatcherId != null ? String(load.dispatcherId) : 'none'
    let disp = week.dispatchers.get(dKey)
    if (!disp) {
      disp = {
        key: dKey,
        name: load.dispatcherName ?? t(locale, 'finances.dispatcher.none'),
        drivers: new Map(),
        gross: 0,
        net: 0,
      }
      week.dispatchers.set(dKey, disp)
    }
    let drv = disp.drivers.get(truck.id)
    if (!drv) {
      drv = { truckId: truck.id, label: truckLabel(truck), loads: [], gross: 0, net: 0, miles: 0 }
      disp.drivers.set(truck.id, drv)
    }

    drv.loads.push(load)
    drv.gross += gross
    drv.net += net
    drv.miles += miles
    disp.gross += gross
    disp.net += net
    week.gross += gross
    week.net += net
  }

  const sortedWeeks = [...weeks.values()].sort((a, b) => b.weekStartMs - a.weekStartMs)
  const thisWeek = weekStart()

  // Open access bypasses login entirely (app/admin's own toggle) — while it's on,
  // getCurrentUser() returns null for everyone, so every load created during that
  // window gets no dispatcher at all. Without this, the whole report would just
  // silently go quiet with no clue why.
  const openAccessWarning = openAccess === '1' && (
    <p className="mb-3 rounded-lg border border-warn-400/25 bg-warn-400/[0.06] px-3 py-2 text-[12px] leading-relaxed text-warn-300">
      {t(locale, 'finances.openAccessWarning')}
    </p>
  )

  if (sortedWeeks.length === 0) {
    return (
      <>
        {openAccessWarning}
        <p className="panel p-6 text-[13px] text-white/60">{t(locale, 'finances.noLoads')}</p>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {openAccessWarning}
      {/* Период расчёта назван прямо: под ним суммы к выплате. */}
      <p className="text-[11.5px] text-white/45">{t(locale, 'finances.payWeekNote')}</p>
      {sortedWeeks.map((week) => (
        <details key={week.weekStartMs} className="panel p-4" open={week.weekStartMs === thisWeek}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold">
            <span className="capitalize">{weekLabel(week.weekStartMs, locale)}</span>
            <span className="nums shrink-0 text-[12.5px] font-normal text-white/60">
              {usd.format(week.gross)}
            </span>
          </summary>

          <div className="mt-3 flex flex-col gap-2.5">
            {[...week.dispatchers.values()]
              .sort((a, b) => b.gross - a.gross)
              .map((disp) => (
                <div key={disp.key} className="rounded-xl border border-white/8 p-3">
                  <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-haul-300">
                    <span>{disp.name}</span>
                    <span className="nums shrink-0 text-[12px] font-normal text-white/60">
                      {usd.format(disp.gross)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    {[...disp.drivers.values()]
                      .sort((a, b) => b.gross - a.gross)
                      .map((drv) => (
                        <div key={drv.truckId} className="rounded-lg border border-white/6 bg-white/[0.015] p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] font-medium">
                            <span>{drv.label}</span>
                            <span className="nums shrink-0 text-[11.5px] font-normal text-white/60">
                              {t(locale, 'finances.loadsCountSuffix').replace('{n}', String(drv.loads.length))} ·{' '}
                              {usd.format(drv.gross)} ·{' '}
                              {Math.round(drv.miles)} mi
                            </span>
                          </div>
                          <ul className="mt-1.5 flex flex-col gap-1">
                            {drv.loads.map((load) => (
                              <li key={load.id}>
                                <Link
                                  href={`/loads/${load.id}`}
                                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11.5px] text-white/60 transition-colors hover:bg-white/5 hover:text-white/85"
                                >
                                  <span className="min-w-0 truncate">
                                    {load.referenceId ? `#${load.referenceId} · ` : ''}
                                    {load.origin ?? '—'} → {load.destination ?? '—'}
                                  </span>
                                  <span className="nums shrink-0">
                                    {Math.round(load.loadedMiles + load.deadheadMiles)} mi ·{' '}
                                    {usd.format(load.rate)}
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </details>
      ))}
    </div>
  )
}

type GrossWeek = {
  weekStartMs: number
  trucks: Map<number, { label: string; loads: LoadRecord[]; gross: number; miles: number }>
  gross: number
  miles: number
  count: number
}

/** Гросс по неделям — то, что владелец смотрит первым: сколько парк привёз за неделю
 * (ставки из рейт-конов, без вычетов) и из чего это сложилось — по тракам и грузам.
 * Неделя — с пятницы по пятницу, как и зарплата; груз ложится в неделю пикапа. */
async function ByWeek({
  companyId,
  rateCons,
  locale,
}: {
  companyId: 'default' | 'demo'
  rateCons: Map<number, number>
  locale: Locale
}) {
  const [loads, trucks] = await Promise.all([listLoads(companyId), listTrucks(companyId)])
  const byTruckId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const committed = loads.filter((l) => l.status !== 'quoted' && l.status !== 'cancelled')

  const weeks = new Map<number, GrossWeek>()
  for (const load of committed) {
    const weekMs = weekAnchorOf(new Date(load.pickupDate ?? load.createdAt).getTime())
    let week = weeks.get(weekMs)
    if (!week) {
      week = { weekStartMs: weekMs, trucks: new Map(), gross: 0, miles: 0, count: 0 }
      weeks.set(weekMs, week)
    }
    const truck = load.truckId !== null ? byTruckId.get(load.truckId) : undefined
    const key = truck?.id ?? 0
    let row = week.trucks.get(key)
    if (!row) {
      row = { label: truck ? truckLabel(truck) : t(locale, 'finances.noTruck'), loads: [], gross: 0, miles: 0 }
      week.trucks.set(key, row)
    }
    const miles = load.loadedMiles + load.deadheadMiles
    row.loads.push(load)
    row.gross += load.rate
    row.miles += miles
    week.gross += load.rate
    week.miles += miles
    week.count += 1
  }

  const sortedWeeks = [...weeks.values()].sort((a, b) => b.weekStartMs - a.weekStartMs)
  const thisWeek = weekStart()
  if (sortedWeeks.length === 0) {
    return <p className="panel p-6 text-[13px] text-white/60">{t(locale, 'finances.noLoads')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] text-white/45">{t(locale, 'finances.payWeekNote')}</p>
      {sortedWeeks.map((week) => (
        <details key={week.weekStartMs} className="panel p-4" open={week.weekStartMs === thisWeek}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold">
            <span className="capitalize">{weekLabel(week.weekStartMs, locale)}</span>
            <span className="nums shrink-0 text-right">
              <span className="text-[15px] text-good-400">{usd.format(week.gross)}</span>
              <span className="ml-2 text-[11.5px] font-normal text-white/50">
                {t(locale, 'finances.loadsCountSuffix').replace('{n}', String(week.count))} · {Math.round(week.miles)} mi
                {week.miles > 0 && ` · ${usd2.format(week.gross / week.miles)}/mi`}
              </span>
              {/* Неделя одним файлом для бухгалтера: грузы, мили, ставки, счета, зарплата. */}
              <a
                href={`/api/export/week?start=${week.weekStartMs}`}
                className="ml-2 rounded-md border border-white/12 px-2 py-0.5 text-[11px] font-medium text-white/70 hover:border-white/30 hover:text-white"
              >
                CSV
              </a>
            </span>
          </summary>

          <div className="mt-3 flex flex-col gap-2">
            {[...week.trucks.values()]
              .sort((a, b) => b.gross - a.gross)
              .map((row) => (
                <div key={row.label} className="rounded-lg border border-white/6 bg-white/[0.015] p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] font-medium">
                    <span className="text-haul-300">{row.label}</span>
                    <span className="nums shrink-0 text-[11.5px] font-normal text-white/60">
                      {t(locale, 'finances.loadsCountSuffix').replace('{n}', String(row.loads.length))} ·{' '}
                      {Math.round(row.miles)} mi · <span className="font-semibold text-white/85">{usd.format(row.gross)}</span>
                    </span>
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {row.loads.map((load) => (
                      <li key={load.id} className="flex items-center gap-2">
                        <Link
                          href={`/loads/${load.id}`}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1 text-[11.5px] text-white/60 transition-colors hover:bg-white/5 hover:text-white/85"
                        >
                          <span className="min-w-0 truncate">
                            {load.referenceId ? `#${load.referenceId} · ` : ''}
                            {load.origin ?? '—'} → {load.destination ?? '—'}
                            {load.brokerName ? ` · ${load.brokerName}` : ''}
                          </span>
                          <span className="nums shrink-0">
                            {Math.round(load.loadedMiles + load.deadheadMiles)} mi · {usd.format(load.rate)}
                          </span>
                        </Link>
                        {rateCons.get(load.id) && <RateConButton docId={rateCons.get(load.id)!} compact />}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </details>
      ))}
    </div>
  )
}

type DriverWeek = {
  weekStartMs: number
  trucks: Map<number, { label: string; loads: { load: LoadRecord; pay: number | null; miles: number }[]; pay: number; miles: number }>
  pay: number
}

/** Driver settlements — EZLoads-style недельная ведомость: every committed load,
 * grouped by week → driver/truck, with THAT load's driver pay from calcLoad (the
 * same cpm/percent settings the truck's economics already hold). No new pay math:
 * the settlement shows exactly the driver line every profit breakdown charges. */
async function ByDriver({ companyId, locale }: { companyId: 'default' | 'demo'; locale: Locale }) {
  const [loads, trucks] = await Promise.all([listLoads(companyId), listTrucks(companyId)])
  const byTruckId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const fallback = trucks[0]
  // Committed work only — a dead quote or a cancelled load never owes driver pay.
  const committed = loads.filter((l) => l.status !== 'quoted' && l.status !== 'cancelled')

  const weeks = new Map<number, DriverWeek>()
  for (const load of committed) {
    const truck = (load.truckId !== null ? byTruckId.get(load.truckId) : undefined) ?? fallback
    if (!truck) continue
    let pay: number | null = null
    try {
      pay = calcLoad(load, truck).driver
    } catch {
      pay = null // legacy rows with broken economics — listed, just without a pay figure
    }
    const miles = load.loadedMiles + load.deadheadMiles

    const weekMs = weekAnchorOf(new Date(load.createdAt).getTime())
    let week = weeks.get(weekMs)
    if (!week) {
      week = { weekStartMs: weekMs, trucks: new Map(), pay: 0 }
      weeks.set(weekMs, week)
    }
    let drv = week.trucks.get(truck.id)
    if (!drv) {
      drv = { label: truckLabel(truck), loads: [], pay: 0, miles: 0 }
      week.trucks.set(truck.id, drv)
    }
    drv.loads.push({ load, pay, miles })
    drv.pay += pay ?? 0
    drv.miles += miles
    week.pay += pay ?? 0
  }

  const sortedWeeks = [...weeks.values()].sort((a, b) => b.weekStartMs - a.weekStartMs)
  const thisWeek = weekStart()

  if (sortedWeeks.length === 0) {
    return <p className="panel p-6 text-[13px] text-white/60">{t(locale, 'finances.driver.noCommitted')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Период расчёта назван прямо: под ним суммы к выплате. */}
      <p className="text-[11.5px] text-white/45">{t(locale, 'finances.payWeekNote')}</p>
      {sortedWeeks.map((week) => (
        <details key={week.weekStartMs} className="panel p-4" open={week.weekStartMs === thisWeek}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold">
            <span className="capitalize">{weekLabel(week.weekStartMs, locale)}</span>
            <span className="nums shrink-0 text-[12.5px] font-normal text-white/60">
              {t(locale, 'finances.payDue')} <span className="font-semibold text-good-400">{usd.format(week.pay)}</span>
            </span>
          </summary>

          <div className="mt-3 flex flex-col gap-2.5">
            {[...week.trucks.values()]
              .sort((a, b) => b.pay - a.pay)
              .map((drv) => (
                <div key={drv.label} className="rounded-xl border border-white/8 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold">
                    <span className="text-haul-300">{drv.label}</span>
                    <span className="nums text-[12.5px] font-normal text-white/60">
                      {t(locale, 'finances.loadsCountSuffix').replace('{n}', String(drv.loads.length))} ·{' '}
                      {Math.round(drv.miles)} mi · {t(locale, 'finances.payDue')}{' '}
                      <span className="font-semibold text-good-400">{usd.format(drv.pay)}</span>
                    </span>
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {drv.loads.map(({ load, pay, miles }) => (
                      <li key={load.id}>
                        <Link
                          href={`/loads/${load.id}`}
                          className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11.5px] text-white/60 transition-colors hover:bg-white/5 hover:text-white/85"
                        >
                          <span className="min-w-0 truncate">
                            {load.referenceId ? `#${load.referenceId} · ` : ''}
                            {load.origin ?? '—'} → {load.destination ?? '—'}
                          </span>
                          <span className="nums shrink-0">
                            {Math.round(miles)} mi · {pay !== null ? usd.format(pay) : '—'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </details>
      ))}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  info,
}: {
  label: string
  value: string
  tone?: 'warn' | 'bad'
  info?: string
}) {
  return (
    <div className="panel px-4 py-3">
      <div
        className={`nums text-lg font-bold ${
          tone === 'bad' ? 'text-bad-400' : tone === 'warn' ? 'text-warn-400' : ''
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/62">
        {label}
        {info && <Info text={info} />}
      </div>
    </div>
  )
}
