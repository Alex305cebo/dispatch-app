// Раздел «Гараж» (10/21/26) — всё про каждый трак в одном месте: пробег сейчас, масло
// кольцом (когда, где и при каком пробеге меняли, сколько осталось и к какому числу),
// сроки бумаг, что надо починить, последний ремонт и расходы. Ниже — журнал всего
// парка с чеками и ремонтные бумаги, которые ещё не стали записью.
//
// Раньше это жило только во вкладке «Обслуживание» карточки трака, внизу, и владелец
// его не находил: «непонятно, когда была замена масла, где бумаги и чеки». Вкладка
// осталась — там тот же журнал одного трака (components/service-log.tsx).
//
// 10/22/26 владелец: «сделай интереснее, визуально привлекательнее, больше движения и
// картинок». Сверху — сводка парка цифрами-счётчиками, дальше карточки траков с
// картинкой трака и кольцом масла вместо таблицы.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, Droplet, Fuel, Gauge, ShieldCheck, Wrench } from 'lucide-react'
import { listTrucks } from '@/lib/loads'
import { truckShortLabel } from '@/lib/map'
import {
  costByMonth,
  expiries,
  fleetMaintenance,
  fleetStatusByUnit,
  looseTruckDocs,
  maintenanceDocs,
  milesPerDay,
  oilCard,
  oilDueDate,
  openTodoCounts,
  serviceKind,
  truckMetas,
  type MaintenanceRecord,
  type TruckMeta,
} from '@/lib/maintenance'
import { truckModelSrc, isTruckModel } from '@/lib/truck-models'
import { todayEt } from '@/lib/payments'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { usd, usd2, usDate, shortName } from '@/lib/fmt'
import { PageHeader } from '@/components/page-header'
import { AddEntryButton, CostBars, KIND_CHIP, ServiceLog, type LogTruck } from '@/components/service-log'
import { CountUp } from '@/components/garage-ui'

export const dynamic = 'force-dynamic'

type Tone = 'good' | 'warn' | 'bad'
const TONE_TEXT: Record<Tone, string> = { good: 'text-good-400', warn: 'text-warn-400', bad: 'text-bad-400' }
const TONE_STROKE: Record<Tone, string> = { good: 'stroke-good-400', warn: 'stroke-warn-400', bad: 'stroke-bad-500' }
const TONE_PILL: Record<Tone, string> = {
  good: 'bg-good-500/12 text-good-400',
  warn: 'bg-warn-400/15 text-warn-400',
  bad: 'bg-bad-500/12 text-bad-400',
}
const mi = (n: number) => `${Math.round(n).toLocaleString('en-US')} mi`

const truckImg = (id: number, meta: TruckMeta | null) =>
  meta?.hasTruckPhoto ? `/api/truck-photo/${id}` : isTruckModel(meta?.truckModel) ? truckModelSrc(meta!.truckModel!) : '/truck.png'

/** Кольцо-шкала: заполняется при открытии (CSS .garage-ring), цвет — по тону. */
function Ring({ pct, tone, size = 92, children }: { pct: number; tone: Tone | null; size?: number; children: ReactNode }) {
  const r = size / 2 - 7
  const len = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={8} className="fill-none stroke-white/[0.07]" />
        {tone && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={8}
            strokeLinecap="round"
            className={`garage-ring fill-none ${TONE_STROKE[tone]}`}
            style={{ strokeDasharray: len, strokeDashoffset: len * (1 - Math.max(0.02, pct / 100)), ['--ring-len' as string]: len }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">{children}</div>
    </div>
  )
}

/** Пробег цифрами «одометра» — по ячейке на знак. */
function Odometer({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-[2px] font-mono text-sm font-semibold text-t1">
      {Math.round(value)
        .toLocaleString('en-US')
        .split('')
        .map((ch, i) =>
          ch === ',' ? (
            <span key={i} className="w-1 text-t3">
              ,
            </span>
          ) : (
            <span key={i} className="rounded-[4px] bg-white/[0.07] px-[3px] py-px shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]">
              {ch}
            </span>
          ),
        )}
    </span>
  )
}

export default async function Page({ searchParams }: { searchParams: Promise<{ truck?: string }> }) {
  const { truck: truckParam } = await searchParams
  const companyId = await companyScope()
  const locale = await getLocale()
  const [trucks, metas, records, docs, fleet, todos, loose] = await Promise.all([
    listTrucks(companyId),
    truckMetas(companyId),
    fleetMaintenance(companyId),
    maintenanceDocs(companyId),
    fleetStatusByUnit(),
    openTodoCounts(companyId),
    looseTruckDocs(companyId),
  ])
  const today = todayEt()
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`
  const monthAgo = (() => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 30)
    return d.toISOString().slice(0, 10)
  })()

  const byTruck = new Map<number, MaintenanceRecord[]>()
  for (const r of records) byTruck.set(r.truckId, [...(byTruck.get(r.truckId) ?? []), r])

  const rows = trucks.map((tr) => {
    const recs = byTruck.get(tr.id) ?? []
    const meta = metas.get(tr.id) ?? null
    const live = tr.number ? fleet.get(tr.number) : undefined
    const eldOdo = live?.odometer ?? null
    // Без ELD — самый большой пробег из журнала: лучше, чем ничего, и подписан «из журнала».
    const logOdo = recs.reduce<number | null>((a, r) => (r.odometer != null && (a == null || r.odometer > a) ? r.odometer : a), null)
    const odo = eldOdo ?? logOdo
    const oil = oilCard(recs, meta, odo)
    const perDay = milesPerDay(recs, odo, today)
    const due = oilDueDate(oil.left, perDay, today)
    const lastRepair = recs.find((r) => serviceKind(r) === 'repair') ?? null
    const cost12 = recs.filter((r) => r.doneAt >= yearAgo).reduce((a, r) => a + (r.cost ?? 0), 0)
    // Цена обслуживания за милю: расходы за год ÷ мили за год (по журналу и ELD).
    const firstOdo = recs.filter((r) => r.odometer != null && r.doneAt >= yearAgo).sort((a, b) => a.doneAt.localeCompare(b.doneAt))[0]
    const cpm = firstOdo && odo && odo - firstOdo.odometer! > 1000 ? cost12 / (odo - firstOdo.odometer!) : null
    const exp = expiries(meta, locale)
    const worstExp = exp[0] && exp[0].tone !== 'good' ? exp[0] : null
    const todo = todos.get(tr.id) ?? 0
    const tone: Tone =
      oil.tone === 'bad' || worstExp?.tone === 'bad' ? 'bad' : oil.tone === 'warn' || worstExp || todo ? 'warn' : 'good'
    const status =
      oil.tone === 'bad'
        ? t(locale, 'service.st.oilOver')
        : worstExp?.tone === 'bad'
          ? t(locale, 'service.st.docs')
          : oil.tone === 'warn'
            ? t(locale, 'service.st.oilSoon')
            : worstExp
              ? t(locale, 'service.st.docs')
              : todo
                ? t(locale, 'service.st.fix')
                : t(locale, 'service.st.ok')
    return { tr, meta, odo, fromLog: eldOdo == null && logOdo != null, fuel: live?.fuel ?? null, oil, due, lastRepair, cost12, cpm, exp, worstExp, todo, tone, status }
  })
  // Сверху — у кого хуже: красные, жёлтые, потом кому раньше масло.
  const rank = { bad: 0, warn: 1, good: 2 }
  rows.sort((a, b) => rank[a.tone] - rank[b.tone] || (a.oil.left ?? Infinity) - (b.oil.left ?? Infinity))

  const selected = Number(truckParam) || null
  const sel = rows.find((r) => r.tr.id === selected) ?? null
  const logTrucks: LogTruck[] = rows.map((r) => ({ id: r.tr.id, label: truckShortLabel(r.tr), odometer: r.odo }))
  const months = costByMonth(sel ? (byTruck.get(sel.tr.id) ?? []) : records, today)

  // Сводка парка.
  const okCount = rows.filter((r) => r.tone === 'good').length
  const oilSoon = rows.filter((r) => r.oil.tone && r.oil.tone !== 'good')
  const docsSoon = rows.flatMap((r) => r.exp.filter((e) => e.tone !== 'good').map((e) => ({ r, e }))).sort((a, b) => a.e.daysLeft - b.e.daysLeft)
  const spent30 = records.filter((r) => r.doneAt >= monthAgo).reduce((a, r) => a + (r.cost ?? 0), 0)
  const spark = costByMonth(records, today, 6)
  const sparkMax = Math.max(1, ...spark.map((x) => x.total))

  const href = (id: number) => (id === selected ? '/garage#log' : `/garage?truck=${id}#log`)

  return (
    <main className="page">
      <PageHeader
        title={t(locale, 'nav.garage')}
        subtitle={t(locale, 'service.subtitle')}
        info={t(locale, 'service.info')}
        actions={<AddEntryButton locale={locale} />}
      />

      {trucks.length === 0 ? (
        <div className="panel p-5 text-base text-t3">{t(locale, 'service.noTrucks')}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Сводка парка — четыре плитки, числа досчитывают при открытии. */}
          <section className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="panel flex items-center gap-3 p-4">
              <Ring pct={rows.length ? (okCount / rows.length) * 100 : 0} tone={okCount === rows.length ? 'good' : okCount ? 'warn' : 'bad'} size={64}>
                <ShieldCheck size={20} className="text-good-400" />
              </Ring>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-t1">
                  <CountUp value={okCount} />
                  <span className="text-base font-semibold text-t3"> / {rows.length}</span>
                </div>
                <div className="text-sm text-t2">{t(locale, 'service.h.ok')}</div>
              </div>
            </div>
            <div className="panel p-4">
              <div className="flex items-center gap-2 text-sm text-t2">
                <span className="flex size-8 items-center justify-center rounded-full bg-warn-400/15 text-warn-400">
                  <Droplet size={16} />
                </span>
                {t(locale, 'service.h.oil')}
              </div>
              <div className="mt-1 text-2xl font-bold text-t1">
                <CountUp value={oilSoon.length} />
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {rows.map((r) => (
                  <span
                    key={r.tr.id}
                    title={truckShortLabel(r.tr)}
                    className={`size-2.5 rounded-full ${r.oil.tone === 'bad' ? 'animate-pulse bg-bad-500' : r.oil.tone === 'warn' ? 'bg-warn-400' : r.oil.tone ? 'bg-good-400' : 'bg-white/15'}`}
                  />
                ))}
              </div>
            </div>
            <div className="panel p-4">
              <div className="flex items-center gap-2 text-sm text-t2">
                <span className="flex size-8 items-center justify-center rounded-full bg-bad-500/12 text-bad-400">
                  <CalendarClock size={16} />
                </span>
                {t(locale, 'service.h.docs')}
              </div>
              <div className="mt-1 text-2xl font-bold text-t1">
                <CountUp value={docsSoon.length} />
              </div>
              <div className="truncate text-sm text-t3">
                {docsSoon[0]
                  ? `${docsSoon[0].r.tr.number ?? ''} · ${docsSoon[0].e.label} · ${docsSoon[0].e.daysLeft < 0 ? t(locale, 'trucks.common.overdue') : `${docsSoon[0].e.daysLeft} ${t(locale, 'trucks.common.daysSuffix')}`}`
                  : t(locale, 'service.allOk')}
              </div>
            </div>
            <div className="panel p-4">
              <div className="flex items-center gap-2 text-sm text-t2">
                <span className="flex size-8 items-center justify-center rounded-full bg-haul-500/15 text-haul-300">
                  <Wrench size={16} />
                </span>
                {t(locale, 'service.h.spent30')}
              </div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <span className="text-2xl font-bold text-t1">
                  <CountUp value={spent30} format="usd" />
                </span>
                <span className="flex h-8 items-end gap-[3px]" aria-hidden>
                  {spark.map((x, i) => (
                    <span
                      key={x.month}
                      className={`garage-bar w-2 rounded-t-sm ${i === spark.length - 1 ? 'bg-haul-400' : 'bg-haul-400/40'}`}
                      style={{ height: `${x.total ? Math.max(12, (x.total / sparkMax) * 100) : 8}%`, animationDelay: `${i * 60}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          </section>

          {/* Траки карточками: картинка трака, кольцо масла, одометр, бак, сроки. */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-t1">{t(locale, 'service.allTrucks')}</h2>
            <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => (
                <Link
                  key={r.tr.id}
                  href={href(r.tr.id)}
                  className={`group panel relative block overflow-hidden p-0 transition-shadow hover:shadow-lg ${r.tr.id === selected ? 'ring-2 ring-haul-400' : ''}`}
                >
                  {/* Шапка: номер, водитель, статус — и трак, который въезжает справа. */}
                  <div className="relative h-28 overflow-hidden bg-gradient-to-br from-haul-500/[0.10] via-transparent to-transparent px-4 pt-3">
                    <div className="relative z-10 max-w-[58%]">
                      <div className="text-2xl font-bold tracking-tight text-t1">{r.tr.number ?? r.tr.name}</div>
                      <div className="truncate text-sm text-t2">{shortName(r.tr.driverName) || '—'}</div>
                      <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_PILL[r.tone]}`}>
                        {r.tone === 'good' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                        {r.status}
                      </span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={truckImg(r.tr.id, r.meta)}
                      alt=""
                      loading="lazy"
                      className="garage-truck pointer-events-none absolute -right-2 bottom-0 h-24 w-auto max-w-[55%] object-contain object-right-bottom"
                    />
                  </div>

                  <div className="flex items-center gap-4 px-4 py-3">
                    <Ring pct={r.oil.pct ?? 0} tone={r.oil.tone}>
                      {r.oil.left != null ? (
                        <>
                          <span className={`nums text-base font-bold ${TONE_TEXT[r.oil.tone!]}`}>{Math.abs(Math.round(r.oil.left / 100) / 10).toLocaleString('en-US')}k</span>
                          <span className="text-2xs text-t3">{t(locale, r.oil.left < 0 ? 'service.over' : 'service.left')}</span>
                        </>
                      ) : (
                        <Droplet size={18} className="text-t3" />
                      )}
                    </Ring>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div>
                        <div className="text-2xs tracking-wide text-t3 uppercase">{t(locale, 'service.colOdoNow')}</div>
                        {r.odo != null ? (
                          <div className="flex items-center gap-1.5">
                            <Odometer value={r.odo} />
                            {r.fromLog && <span className="text-2xs text-t3">{t(locale, 'service.odoFromLog')}</span>}
                          </div>
                        ) : (
                          <span className="text-sm text-t3">{t(locale, 'service.noOdo')}</span>
                        )}
                      </div>
                      <div className="text-sm text-t2">
                        <Droplet size={12} className="mr-1 inline text-haul-300" />
                        {r.due ? (
                          <>
                            {r.due.days === 0 ? t(locale, 'service.oilNow') : t(locale, 'service.oilInDays').replace('{n}', String(r.due.days))}
                            <span className="nums text-t3"> · {usDate(r.due.date)}</span>
                          </>
                        ) : r.oil.last ? (
                          <span className="nums">
                            {usDate(r.oil.last.doneAt)}
                            {r.oil.atOdometer != null && ` · ${mi(r.oil.atOdometer)}`}
                          </span>
                        ) : (
                          <span className="text-t3">{t(locale, 'service.noOil')}</span>
                        )}
                      </div>
                      {r.fuel != null && (
                        <div className="flex items-center gap-1.5">
                          <Fuel size={12} className="text-t3" />
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                            <div
                              className={`garage-grow h-full rounded-full ${r.fuel < 25 ? 'bg-bad-500' : r.fuel < 50 ? 'bg-warn-400' : 'bg-good-400'}`}
                              style={{ width: `${Math.max(0, Math.min(100, r.fuel))}%` }}
                            />
                          </div>
                          <span className="nums text-2xs text-t3">{Math.round(r.fuel)}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] px-4 py-2.5 text-xs">
                    {r.worstExp && (
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${TONE_PILL[r.worstExp.tone]}`}>
                        {r.worstExp.label} {r.worstExp.daysLeft < 0 ? t(locale, 'trucks.common.overdue') : `${r.worstExp.daysLeft} ${t(locale, 'trucks.common.daysSuffix')}`}
                      </span>
                    )}
                    {r.todo > 0 && <span className="rounded-full bg-bad-500/12 px-2 py-0.5 font-semibold text-bad-400">🔧 {r.todo}</span>}
                    {r.lastRepair && (
                      <span className="max-w-full truncate rounded-full bg-white/[0.06] px-2 py-0.5 text-t2">
                        <Wrench size={11} className="mr-1 inline" />
                        {usDate(r.lastRepair.doneAt)} · {r.lastRepair.title}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-t3">
                      <Gauge size={12} />
                      {r.cpm != null ? `${usd2.format(r.cpm)}/mi` : r.cost12 ? usd.format(r.cost12) : '—'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Выбранный трак: паспорт, сроки — и ссылка в его карточку. */}
          {sel && (
            <section className="garage-pop panel relative overflow-hidden p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={truckImg(sel.tr.id, sel.meta)} alt="" className="garage-truck pointer-events-none absolute right-2 bottom-0 h-28 opacity-90 max-sm:hidden" />
              <div className="relative flex flex-wrap items-center justify-between gap-2 sm:pr-48">
                <h2 className="text-lg font-semibold text-t1">{truckShortLabel(sel.tr)}</h2>
                <div className="flex gap-2">
                  <Link href={`/trucks/${sel.tr.id}#care`} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-semibold text-t2 hover:text-t1">
                    {t(locale, 'service.openTruck')} →
                  </Link>
                  <Link href="/garage" aria-label={t(locale, 'common.close')} className="rounded-xl px-2.5 py-1.5 text-sm text-t3 hover:bg-white/10 hover:text-t1">
                    ✕
                  </Link>
                </div>
              </div>
              <dl className="relative mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4 sm:pr-48">
                {[
                  ['VIN', sel.meta?.vin],
                  [t(locale, 'trucks.care.plateLabel'), sel.meta?.plate],
                  [t(locale, 'trucks.care.trailerNumberLabel'), sel.meta?.trailerNumber],
                  [t(locale, 'service.passport'), [sel.meta?.year, sel.meta?.make, sel.meta?.model].filter(Boolean).join(' ') || null],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs text-t3">{k}</dt>
                    <dd className="truncate text-t1">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
              {sel.exp.length > 0 && (
                <div className="relative mt-3 flex flex-wrap gap-1.5">
                  {sel.exp.map((e) => (
                    <span key={e.label} className={`rounded-lg px-2.5 py-1 text-sm ${e.tone === 'good' ? 'bg-white/[0.05] text-t2' : TONE_PILL[e.tone]}`}>
                      {e.label} <b className="nums">{usDate(e.date)}</b>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                {(['oil', 'repair', 'service', 'inspection'] as const).map((k) => {
                  const n = (byTruck.get(sel.tr.id) ?? []).filter((r) => serviceKind(r) === k).length
                  return n ? (
                    <span key={k} className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${KIND_CHIP[k]}`}>
                      {t(locale, `service.kind.${k}`)} · {n}
                    </span>
                  ) : null
                })}
              </div>
            </section>
          )}

          <CostBars months={months} locale={locale} />

          <ServiceLog records={records} docs={docs} looseDocs={loose} trucks={logTrucks} initialTruck={selected} locale={locale} />
        </div>
      )}
    </main>
  )
}
