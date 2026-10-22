'use client'

// Клиентская половина «Аналитики»: бенто с 21st.dev плюс свои карточки (цифры-ключи,
// траки, брокеры, маршруты, $/mi по неделям, деньги по этапам) и окно со списком
// грузов. Владелец 10/22/26: «всё должно нажиматься» — любой график, плитка, полоса и
// строка открывают ровно те грузы, из которых сложена цифра, с Rate Con и ссылкой на груз.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { AnalyticsBento, type AnalyticsBentoProps } from '@/components/ui/analytics-bento'
import { RateConButton } from '@/components/ratecon-button'
import { DocModal } from '@/components/doc-modal'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import { usd, usDate } from '@/lib/fmt'
import { STAGES, type Analytics, type ARow } from '@/lib/analytics-core'

type Pick = { title: string; ids: number[]; href?: { to: string; label: string } }

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const rpmFmt = (v: number) => (v > 0 ? `$${v.toFixed(2)}` : '—')
const short = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : `$${Math.round(v)}`)

export function AnalyticsClient({ a, bento, rateCons }: { a: Analytics; bento: Omit<AnalyticsBentoProps, 'onOpenLoads'>; rateCons: [number, number][] }) {
  const locale = useLocale()
  const L = (k: MsgKey) => t(locale, k)
  const [pick, setPick] = useState<Pick | null>(null)
  const open = (title: string, ids: number[], href?: Pick["href"]) => {
    if (ids.length) setPick({ title, ids, href })
  }

  const k = a.kpi
  const kpis: { key: MsgKey; v: string; delta: string; weeks: number[]; good?: 'down' }[] = [
    { key: 'analytics.kpi.revenue', v: usd.format(k.revenue.now), delta: k.revenue.delta, weeks: k.revenue.weeks },
    { key: 'analytics.kpi.loads', v: num.format(k.loads.now), delta: k.loads.delta, weeks: k.loads.weeks },
    { key: 'analytics.kpi.miles', v: num.format(k.miles.now), delta: k.miles.delta, weeks: k.miles.weeks },
    { key: 'analytics.kpi.rpm', v: rpmFmt(k.rpm.now), delta: k.rpm.delta, weeks: k.rpm.weeks },
    { key: 'analytics.avg', v: usd.format(k.avg.now), delta: k.avg.delta, weeks: k.avg.weeks },
    // Пустой пробег: меньше — лучше, поэтому рост красный.
    { key: 'analytics.kpi.deadhead', v: `${k.deadhead.now.toFixed(1)}%`, delta: k.deadhead.delta, weeks: k.deadhead.weeks, good: 'down' },
  ]
  const days30 = L('analytics.days30')

  const truckMax = Math.max(1, ...a.trucks.map((x) => x.total))
  const brokerMax = Math.max(1, ...a.brokers.map((x) => x.values[2] ?? 0))
  const brokerSum = a.brokers.reduce((s, b) => s + (b.values[2] ?? 0), 0) || 1
  const laneMax = Math.max(1, ...a.lanes.map((x) => x.count))
  const rpmMax = Math.max(0.01, ...a.rpmWeeks.map((w) => w.rpm))
  const stageSum = STAGES.reduce((s, x) => s + a.stages[x].total, 0) || 1
  const STAGE_COLOR = { booked: '#94a3b8', in_transit: '#38bdf8', delivered: '#fbbf24', invoiced: '#fb923c', paid: '#4ade80' } as const

  return (
    <>
      {/* Цифры-ключи: 30 дней, стрелка к прошлым 30, полоски — 12 недель. */}
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label={L('analytics.kpi.note')}>
        {kpis.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => open(`${L(x.key)} · ${days30}`, k.ids30)}
            className="panel panel-interactive flex min-w-0 flex-col gap-2 p-3 text-left"
          >
            <span className="flex items-start justify-between gap-2 text-xs text-t3">
              <span className="line-clamp-2 leading-tight">{L(x.key)}</span>
              <DeltaPill delta={x.delta} goodDown={x.good === 'down'} />
            </span>
            <span className="nums truncate text-xl font-semibold leading-none text-t1">{x.v}</span>
            <Spark values={x.weeks} />
          </button>
        ))}
      </section>
      <p className="mb-4 text-xs text-t3">{L('analytics.kpi.note')}</p>

      <AnalyticsBento {...bento} onOpenLoads={(title, ids) => open(title, ids)} />

      <div className="mt-4 grid grid-cols-12 gap-4">
        {/* Траки: выручка полосой, рядом грузы и $/mi. */}
        <Card title={L('analytics.trucks')} className="lg:col-span-6">
          {a.trucks.length === 0 && <Empty />}
          {a.trucks.map((tr) => (
            <Row
              key={tr.id}
              onClick={() => open(`${tr.name} · ${days30}`, tr.ids, { to: `/trucks/${tr.id}`, label: L('analytics.openTruck') })}
              disabled={!tr.ids.length}
            >
              <span className="w-28 shrink-0 truncate text-t2 sm:w-36">{tr.name}</span>
              <Bar share={tr.total / truckMax} />
              <span className="nums w-20 shrink-0 text-right font-semibold text-t1">{usd.format(tr.total)}</span>
              <span className="nums hidden w-16 shrink-0 text-right text-t3 sm:block">{rpmFmt(tr.rpm)}</span>
              <span className="nums w-8 shrink-0 text-right text-t3">{tr.loads}</span>
            </Row>
          ))}
        </Card>

        {/* Брокеры за год: доля полосой. */}
        <Card title={L('analytics.brokers')} className="lg:col-span-6">
          {a.brokers.length === 0 && <Empty />}
          {a.brokers.map((b) => (
            <Row
              key={b.key ?? b.name}
              onClick={() => open(`${b.name} · ${L('analytics.year')}`, b.ids[2] ?? [], b.key ? { to: `/brokers/${encodeURIComponent(b.key)}`, label: L('analytics.openBroker') } : undefined)}
              disabled={!b.ids[2]?.length}
            >
              <span className="w-28 shrink-0 truncate text-t2 sm:w-36">{b.name}</span>
              <Bar share={(b.values[2] ?? 0) / brokerMax} />
              <span className="nums w-20 shrink-0 text-right font-semibold text-t1">{usd.format(b.values[2] ?? 0)}</span>
              <span className="nums hidden w-16 shrink-0 text-right text-t3 sm:block">{rpmFmt(b.rpm)}</span>
              <span className="nums w-10 shrink-0 text-right text-t3">{Math.round(((b.values[2] ?? 0) / brokerSum) * 100)}%</span>
            </Row>
          ))}
        </Card>

        {/* $/mi по неделям столбиками: высота — ставка, подпись — начало недели. */}
        <Card title={L('analytics.rpmWeeks')} className="lg:col-span-7">
          <div className="flex h-44 items-end gap-1.5 sm:gap-2">
            {a.rpmWeeks.map((w) => (
              <button
                key={w.from}
                type="button"
                disabled={!w.ids.length}
                onClick={() => open(`${L('analytics.kpi.rpm')} · ${usDate(w.from)}`, w.ids)}
                title={`${usDate(w.from)}: ${rpmFmt(w.rpm)} · ${num.format(w.miles)} ${L('analytics.mi')}`}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-haul-400"
              >
                <span className="nums text-2xs font-semibold text-t2">{w.rpm > 0 ? w.rpm.toFixed(2) : ''}</span>
                <span
                  className="w-full rounded-t-md bg-haul-500 transition-opacity group-enabled:group-hover:opacity-80"
                  style={{ height: `${Math.max(w.rpm ? 8 : 2, (w.rpm / rpmMax) * 100)}%`, opacity: w.rpm ? 1 : 0.2 }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5 sm:gap-2">
            {a.rpmWeeks.map((w, i) => (
              <span key={w.from} className="nums flex min-w-0 flex-1 justify-center whitespace-nowrap text-2xs text-t3">
                {(a.rpmWeeks.length - 1 - i) % 3 === 0 ? w.from.slice(5).replace('-', '/') : ''}
              </span>
            ))}
          </div>
        </Card>

        {/* Деньги по этапам: одна полоса из пяти цветов и строки под ней. */}
        <Card title={L('analytics.stages')} className="lg:col-span-5">
          <div className="flex h-4 overflow-hidden rounded-full bg-white/5">
            {STAGES.map((s) =>
              a.stages[s].total > 0 ? (
                <button
                  key={s}
                  type="button"
                  aria-label={L(`analytics.stage.${s}` as MsgKey)}
                  onClick={() => open(L(`analytics.stage.${s}` as MsgKey), a.stages[s].ids)}
                  className="h-full hover:opacity-80"
                  style={{ width: `${(a.stages[s].total / stageSum) * 100}%`, background: STAGE_COLOR[s] }}
                />
              ) : null,
            )}
          </div>
          <div className="mt-3">
            {STAGES.map((s) => (
              <Row key={s} onClick={() => open(L(`analytics.stage.${s}` as MsgKey), a.stages[s].ids)} disabled={!a.stages[s].ids.length}>
                <i className="size-2.5 shrink-0 rounded-[3px]" style={{ background: STAGE_COLOR[s] }} />
                <span className="min-w-0 flex-1 truncate text-t2">{L(`analytics.stage.${s}` as MsgKey)}</span>
                <span className="nums w-8 shrink-0 text-right text-t3">{a.stages[s].ids.length}</span>
                <span className="nums w-24 shrink-0 text-right font-semibold text-t1">{usd.format(a.stages[s].total)}</span>
              </Row>
            ))}
          </div>
        </Card>

        {/* Маршруты за год: штат → штат, сколько раз, $/mi. */}
        <Card title={L('analytics.lanes')} className="lg:col-span-12">
          {a.lanes.length === 0 && <Empty />}
          <div className="grid gap-x-6 md:grid-cols-2">
            {a.lanes.map((ln) => (
              <Row key={`${ln.from}${ln.to}`} onClick={() => open(`${ln.from} → ${ln.to} · ${L('analytics.year')}`, ln.ids)}>
                <span className="nums w-20 shrink-0 font-semibold text-t1">
                  {ln.from} → {ln.to}
                </span>
                <Bar share={ln.count / laneMax} />
                <span className="nums w-8 shrink-0 text-right text-t2">{ln.count}</span>
                <span className="nums w-16 shrink-0 text-right text-t3">{rpmFmt(ln.rpm)}</span>
                <span className="nums w-16 shrink-0 text-right font-semibold text-t1">{short(ln.total)}</span>
              </Row>
            ))}
          </div>
        </Card>
      </div>

      {pick && <Drill pick={pick} rows={a.rows} rateCons={rateCons} onClose={() => setPick(null)} />}
    </>
  )
}

function Card({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`panel col-span-12 min-w-0 p-4 sm:p-5 ${className}`}>
      <h2 className="mb-3 text-lg font-semibold tracking-[-0.02em] text-t1">{title}</h2>
      {children}
    </section>
  )
}

function Row({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-lg border-t border-white/10 px-2 py-2 text-left text-sm outline-none transition-colors first:border-t-0 focus-visible:ring-2 focus-visible:ring-haul-400 enabled:hover:bg-white/5 disabled:opacity-60"
    >
      {children}
    </button>
  )
}

function Bar({ share }: { share: number }) {
  return (
    <span className="h-2 min-w-6 flex-1 overflow-hidden rounded-full bg-white/5">
      <span className="block h-full rounded-full bg-haul-500" style={{ width: `${Math.max(2, Math.min(1, share) * 100)}%` }} />
    </span>
  )
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values, 0) || 1
  return (
    <span className="flex h-7 items-end gap-[3px]" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] ${i === values.length - 1 ? 'bg-haul-500' : 'bg-haul-500/35'}`}
          style={{ height: `${Math.max(v ? 10 : 4, (v / max) * 100)}%` }}
        />
      ))}
    </span>
  )
}

function DeltaPill({ delta, goodDown }: { delta: string; goodDown?: boolean }) {
  if (!delta) return null
  const up = !delta.startsWith('-')
  const good = goodDown ? !up : up
  return (
    <span className={`nums shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-semibold ${good ? 'bg-good-500/15 text-good-400' : 'bg-bad-500/15 text-bad-400'}`}>
      {up ? '↑' : '↓'} {delta.replace(/^[+-]/, '')}
    </span>
  )
}

function Empty() {
  const locale = useLocale()
  return <p className="py-6 text-center text-sm text-t3">{t(locale, 'analytics.noLoads')}</p>
}

/** Окно со списком грузов за нажатой точкой. ✕ и Escape закрывают (правило проекта). */
function Drill({ pick, rows, rateCons, onClose }: { pick: Pick; rows: ARow[]; rateCons: [number, number][]; onClose: () => void }) {
  const locale = useLocale()
  const [doc, setDoc] = useState<number | null>(null)
  const rc = useMemo(() => new Map(rateCons), [rateCons])
  const list = useMemo(() => {
    const want = new Set(pick.ids)
    return rows.filter((r) => want.has(r.id)).sort((x, y) => (y.day ?? '').localeCompare(x.day ?? ''))
  }, [pick, rows])
  const total = list.reduce((s, r) => s + r.rate, 0)
  const miles = list.reduce((s, r) => s + r.miles, 0)

  // Escape закрывает список, но не тогда, когда поверх открыт Rate Con: тот закрывается сам.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && doc == null && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [doc, onClose])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={pick.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-ink-900 shadow-e3 sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-white/10 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-t1">{pick.title}</h2>
            <p className="nums mt-0.5 text-sm text-t3">
              {list.length} {t(locale, 'analytics.loadsShort')} · <span className="font-semibold text-t1">{usd.format(total)}</span> ·{' '}
              {rpmFmt(miles > 0 ? total / miles : 0)}/mi
            </p>
          </div>
          {pick.href && (
            <Link href={pick.href.to} className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-haul-300 hover:border-haul-500">
              {pick.href.label} →
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'analytics.close')}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-t2 hover:border-white/25 hover:text-t1"
          >
            <X size={18} />
          </button>
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {list.length === 0 && <li className="p-6 text-center text-sm text-t3">{t(locale, 'analytics.noLoads')}</li>}
          {list.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/5">
              <Link href={`/loads/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="nums w-[4.5rem] shrink-0 text-xs text-t3">{usDate(r.day)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-t1">
                    {r.from ?? '—'} → {r.to ?? '—'}
                  </span>
                  <span className="block truncate text-xs text-t3">
                    {[r.broker, r.truck, t(locale, `status.${r.status}` as MsgKey)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="nums block text-sm font-semibold text-t1">{usd.format(r.rate)}</span>
                  <span className="nums block text-2xs text-t3">{rpmFmt(r.miles > 0 ? r.rate / r.miles : 0)}/mi</span>
                </span>
              </Link>
              {rc.has(r.id) && <RateConButton docId={rc.get(r.id)!} compact onOpen={() => setDoc(rc.get(r.id)!)} />}
            </li>
          ))}
        </ul>
      </div>
      {doc != null && (
        <div onClick={(e) => e.stopPropagation()}>
          <DocModal docId={doc} onClose={() => setDoc(null)} />
        </div>
      )}
    </div>
  )
}
