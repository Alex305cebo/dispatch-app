'use client'

// Клиентская половина «Аналитики»: кнопки сверху (период, трак, брокер), цифры-ключи,
// бенто с 21st.dev и свои карточки (траки, брокеры, ставки $/mi, деньги по этапам,
// маршруты) плюс окно со списком грузов.
//
// Владелец 10/22/26: «графики должны меняться по нажатию кнопок, а не показывать одно и
// то же». Поэтому всё считается здесь, в браузере: любое нажатие — период, трак, брокер,
// цифра-ключ — заново зовёт buildAnalytics, и графики перетекают в новые значения.
// Нажатие на точку, плитку, месяц или строку по-прежнему открывает ровно эти грузы.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { List, X } from 'lucide-react'
import { AnalyticsBento } from '@/components/ui/analytics-bento'
import { RateConButton } from '@/components/ratecon-button'
import { DocModal } from '@/components/doc-modal'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import { usd, usDate } from '@/lib/fmt'
import {
  buildAnalytics,
  metricValue,
  METRICS,
  PERIODS,
  REGIONS,
  RPM_BINS,
  STAGES,
  type ALoad,
  type ATruck,
  type Metric,
  type Region,
  type Totals,
} from '@/lib/analytics-core'

type Pick = { title: string; ids: number[]; href?: { to: string; label: string } }

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const rpmFmt = (v: number) => (v > 0 ? `$${v.toFixed(2)}` : '—')
const short = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : `$${Math.round(v)}`)
const mmdd = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`

// Цвета регионов — светлые, с тёмным текстом поверх: читаются в обеих темах.
const REGION_COLOR: Record<Region, string> = {
  west: '#38bdf8',
  midwest: '#fbbf24',
  south: '#fb923c',
  southeast: '#4ade80',
  northeast: '#c4b5fd',
  other: '#cbd5e1',
}
const STAGE_COLOR = { booked: '#94a3b8', in_transit: '#38bdf8', delivered: '#fbbf24', invoiced: '#fb923c', paid: '#4ade80' } as const
const PERIOD_KEY: MsgKey[] = ['analytics.days7', 'analytics.days30', 'analytics.days90', 'analytics.year']
const METRIC_KEY: Record<Metric, MsgKey> = {
  revenue: 'analytics.kpi.revenue',
  loads: 'analytics.kpi.loads',
  miles: 'analytics.kpi.miles',
  rpm: 'analytics.kpi.rpm',
  avg: 'analytics.avg',
  deadhead: 'analytics.kpi.deadhead',
}
const UNIT: Record<Metric, { prefix?: string; suffix?: string; digits?: number }> = {
  revenue: { prefix: '$' },
  loads: {},
  miles: {},
  rpm: { prefix: '$', digits: 2 },
  avg: { prefix: '$' },
  deadhead: { suffix: '%', digits: 1 },
}
const show = (m: Metric, v: number) => {
  const u = UNIT[m]
  return (u.prefix ?? '') + v.toLocaleString('en-US', { minimumFractionDigits: u.digits ?? 0, maximumFractionDigits: u.digits ?? 0 }) + (u.suffix ?? '')
}

export function AnalyticsClient({
  rows,
  trucks,
  today,
  weekdays,
  months,
  rateCons,
}: {
  rows: ALoad[]
  trucks: ATruck[]
  today: string
  weekdays: string[]
  months: string[]
  rateCons: [number, number][]
}) {
  const locale = useLocale()
  const L = (k: MsgKey) => t(locale, k)
  const [days, setDays] = useState<number>(30)
  const [truckId, setTruckId] = useState<number | null>(null)
  const [broker, setBroker] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('revenue')
  const [cum, setCum] = useState(true)
  const [pick, setPick] = useState<Pick | null>(null)
  const open = (title: string, ids: number[], href?: Pick['href']) => {
    if (ids.length) setPick({ title, ids, href })
  }

  // Карточка траков считается без фильтра по траку (иначе остальные траки пропадут и
  // переключиться будет не на что), брокеров — без фильтра по брокеру. Всё прочее — по обоим.
  const byTruck = (l: ALoad) => truckId == null || l.truckId === truckId
  const byBroker = (l: ALoad) => broker == null || l.bkey === broker
  const a = useMemo(
    () => buildAnalytics(rows.filter((l) => byTruck(l) && byBroker(l)), trucks, today, days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, trucks, today, days, truckId, broker],
  )
  const truckCard = useMemo(
    () => (truckId == null ? a.trucks : buildAnalytics(rows.filter(byBroker), trucks, today, days).trucks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, rows, trucks, today, days, broker],
  )
  const brokerCard = useMemo(
    () => (broker == null ? a.brokers : buildAnalytics(rows.filter(byTruck), trucks, today, days).brokers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, rows, trucks, today, days, truckId],
  )
  // Все брокеры для выбора сверху — по числу грузов за всё время.
  const brokerOptions = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>()
    for (const l of rows) if (l.bkey) m.set(l.bkey, { name: m.get(l.bkey)?.name ?? l.broker ?? l.bkey, n: (m.get(l.bkey)?.n ?? 0) + 1 })
    return [...m].sort((x, y) => y[1].n - x[1].n).slice(0, 60)
  }, [rows])

  const pi = Math.max(0, PERIODS.findIndex((p) => p === days))
  const periodLabel = L(PERIOD_KEY[pi]!)
  const truckName = trucks.find((x) => x.id === truckId)?.name
  const brokerName = broker ? (brokerOptions.find(([key]) => key === broker)?.[1].name ?? broker) : undefined
  const scope = [truckName, brokerName, periodLabel].filter(Boolean).join(' · ')

  // Главный график: выбранная цифра по дням (год — по неделям), по желанию накопительно.
  const weekly = days > 90
  const series = useMemo(() => {
    const run: Totals = { revenue: 0, loads: 0, miles: 0, dh: 0 }
    return a.series.map((b) => {
      let x: Totals = b
      if (cum) {
        run.revenue += b.revenue
        run.loads += b.loads
        run.miles += b.miles
        run.dh += b.dh
        x = run
      }
      return { label: weekly ? `${mmdd(b.from)}–${mmdd(b.to)}` : mmdd(b.to), value: metricValue(metric, x), ids: b.ids }
    })
  }, [a, metric, cum, weekly])

  const k = a.kpi
  const groups = [...REGIONS, 'other' as const].map((id) => ({
    id,
    name: L(`analytics.region.${id}` as MsgKey),
    color: REGION_COLOR[id],
    ink: 'dark' as const,
  }))
  const weekLabel = days <= 28 ? L('analytics.current') : periodLabel
  const loadsWord = L('analytics.loadsShort')

  const truckMax = Math.max(1, ...truckCard.map((x) => x.total))
  const brokerMax = Math.max(1, ...brokerCard.map((x) => x.total))
  const brokerSum = brokerCard.reduce((s, b) => s + b.total, 0) || 1
  const laneMax = Math.max(1, ...a.lanes.map((x) => x.count))
  const distMax = Math.max(1, ...a.rpmDist.map((x) => x.count))
  const stageSum = STAGES.reduce((s, x) => s + a.stages[x].total, 0) || 1
  const binLabel = (i: number) => (i === RPM_BINS.length - 1 ? `$${RPM_BINS[i]}+` : i === 0 ? `<$${RPM_BINS[1]}` : `$${RPM_BINS[i]}–${RPM_BINS[i + 1]}`)

  return (
    <>
      {/* Кнопки сверху: всё ниже пересчитывается сразу. */}
      <section className="panel mb-4 flex flex-wrap items-center gap-2 p-2 lg:sticky lg:top-3 lg:z-30" aria-label={L('analytics.period')}>
        <div role="tablist" aria-label={L('analytics.period')} className="grid w-full grid-cols-4 gap-1 rounded-xl bg-white/5 p-1 sm:w-auto">
          {PERIODS.map((p, i) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={p === days}
              onClick={() => setDays(p)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-haul-400 ${p === days ? 'bg-haul-500 text-[#fff] shadow-e1' : 'text-t2 hover:bg-white/5 hover:text-t1'}`}
            >
              {L(PERIOD_KEY[i]!)}
            </button>
          ))}
        </div>
        <Select value={truckId == null ? '' : String(truckId)} onChange={(v) => setTruckId(v ? Number(v) : null)} label={L('analytics.allTrucks')}>
          {trucks.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
        <Select value={broker ?? ''} onChange={(v) => setBroker(v || null)} label={L('analytics.allBrokers')}>
          {brokerOptions.map(([key, b]) => (
            <option key={key} value={key}>
              {b.name}
            </option>
          ))}
        </Select>
        {(truckId != null || broker != null) && (
          <button
            type="button"
            onClick={() => {
              setTruckId(null)
              setBroker(null)
            }}
            className="inline-flex h-10 items-center gap-1 rounded-xl border border-white/10 px-3 text-sm font-medium text-t2 hover:border-haul-500 hover:text-t1"
          >
            <X size={14} /> {L('analytics.reset')}
          </button>
        )}
      </section>

      {/* Цифры-ключи: нажатая цифра становится главным графиком ниже. */}
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label={L('analytics.kpi.note')}>
        {METRICS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === metric}
            onClick={() => setMetric(m)}
            className={`panel panel-interactive flex min-w-0 flex-col gap-2 p-3 text-left ${m === metric ? 'ring-2 ring-haul-500' : ''}`}
          >
            <span className="flex items-start justify-between gap-2 text-xs text-t3">
              <span className="line-clamp-2 leading-tight">{L(METRIC_KEY[m])}</span>
              {/* Пустой пробег: меньше — лучше, поэтому рост красный. */}
              <DeltaPill delta={k[m].delta} goodDown={m === 'deadhead'} />
            </span>
            <span className="nums truncate text-xl font-semibold leading-none text-t1">{m === 'rpm' ? rpmFmt(k.rpm.now) : show(m, k[m].now)}</span>
            <Spark values={k[m].spark} active={m === metric} />
          </button>
        ))}
      </section>

      <AnalyticsBento
        onOpenLoads={(title, ids) => open(title, ids)}
        labels={{ revenue: L(METRIC_KEY[metric]), share: L('analytics.share'), value: L('analytics.kpi.revenue'), year: L('analytics.year') }}
        revenue={{
          label: `${L(METRIC_KEY[metric])} · ${scope}`,
          value: k[metric].now,
          delta: k[metric].delta,
          unit: UNIT[metric],
          series,
          tools: (
            <div className="flex gap-1 rounded-xl bg-white/5 p-1" role="group">
              {[false, true].map((c) => (
                <button
                  key={String(c)}
                  type="button"
                  aria-pressed={cum === c}
                  onClick={() => setCum(c)}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-haul-400 ${cum === c ? 'bg-ink-900 text-t1 shadow-e1 ring-1 ring-white/10' : 'text-t3 hover:text-t1'}`}
                >
                  {c ? L('analytics.caption') : weekly ? L('analytics.perWeek') : L('analytics.perDay')}
                </button>
              ))}
            </div>
          ),
        }}
        sessions={{
          label: `${L('analytics.kpi.loads')} · ${weekLabel}`,
          value: a.week.count,
          delta: a.week.delta,
          desktop: a.week.pickups,
          mobile: a.week.deliveries,
          axis: weekdays,
          ids: a.week.ids,
          labels: { desktop: L('analytics.pickups'), mobile: L('analytics.deliveries'), prior: L('analytics.prior'), current: weekLabel },
        }}
        categories={{
          title: L('analytics.states'),
          groups: groups.filter((g) => a.states.some((s) => s.group === g.id)),
          period: pi,
          onPeriod: (i) => setDays(PERIODS[i]!),
          periods: a.periods.map((p, i) => ({
            label: L(PERIOD_KEY[i]!),
            total: p.total,
            delta: p.delta,
            compare: p.before ? `${L('analytics.was')} ${usd.format(p.before)}` : '',
            ids: p.ids,
          })),
          items: a.states.map((s) => ({ name: s.name === 'other' ? L('analytics.region.other') : s.name, group: s.group, values: s.values, ids: s.ids })),
        }}
        seasonality={{
          title: L('analytics.season'),
          axis: months,
          years: a.years.map((y) => ({
            label: y.year,
            values: y.months,
            ids: y.monthIds,
            stats: [
              { label: L('analytics.monthAvg'), value: y.monthAvg, delta: y.avgDelta, note: '' },
              { label: L('analytics.yearTotal'), value: y.total, delta: y.totalDelta, note: `${y.count} ${loadsWord}` },
            ],
            rows: y.trucks.map((tr) => ({ label: tr.name, value: usd.format(tr.total), ids: tr.ids })),
          })),
        }}
      />

      <div className="mt-4 grid grid-cols-12 gap-4">
        {/* Траки: нажатие — все графики только по этому траку; значок справа — его грузы. */}
        <Card title={`${L('analytics.trucks')} · ${periodLabel}`} className="lg:col-span-6">
          {truckCard.length === 0 && <Empty />}
          {truckCard.map((tr) => (
            <PickRow
              key={tr.id}
              active={tr.id === truckId}
              onClick={() => setTruckId(tr.id === truckId ? null : tr.id)}
              onList={tr.ids.length ? () => open(`${tr.name} · ${periodLabel}`, tr.ids, { to: `/trucks/${tr.id}`, label: L('analytics.openTruck') }) : undefined}
              listLabel={L('analytics.list')}
            >
              <span className="w-28 shrink-0 truncate text-t2 sm:w-36">{tr.name}</span>
              <Bar share={tr.total / truckMax} />
              <span className="nums w-20 shrink-0 text-right font-semibold text-t1">{usd.format(tr.total)}</span>
              <span className="nums hidden w-14 shrink-0 text-right text-t3 sm:block">{rpmFmt(tr.rpm)}</span>
              <span className="nums w-7 shrink-0 text-right text-t3">{tr.loads}</span>
            </PickRow>
          ))}
        </Card>

        {/* Брокеры: доля выручки полосой; нажатие — графики только по брокеру. */}
        <Card title={`${L('analytics.brokers')} · ${periodLabel}`} className="lg:col-span-6">
          {brokerCard.length === 0 && <Empty />}
          {brokerCard.map((b) => (
            <PickRow
              key={b.key ?? b.name}
              active={b.key === broker}
              onClick={() => setBroker(b.key === broker ? null : b.key)}
              onList={() => open(`${b.name} · ${periodLabel}`, b.ids, b.key ? { to: `/brokers/${encodeURIComponent(b.key)}`, label: L('analytics.openBroker') } : undefined)}
              listLabel={L('analytics.list')}
            >
              <span className="w-28 shrink-0 truncate text-t2 sm:w-36">{b.name}</span>
              <Bar share={b.total / brokerMax} />
              <span className="nums w-20 shrink-0 text-right font-semibold text-t1">{usd.format(b.total)}</span>
              <span className="nums hidden w-14 shrink-0 text-right text-t3 sm:block">{rpmFmt(b.rpm)}</span>
              <span className="nums w-9 shrink-0 text-right text-t3">{Math.round((b.total / brokerSum) * 100)}%</span>
            </PickRow>
          ))}
        </Card>

        {/* Сколько грузов по какой ставке $/mi: столбик — грузы, нажатие — список. */}
        <Card title={`${L('analytics.rpmDist')} · ${scope}`} className="lg:col-span-7">
          <div className="flex h-44 items-end gap-2 sm:gap-3">
            {a.rpmDist.map((b, i) => (
              <button
                key={i}
                type="button"
                disabled={!b.ids.length}
                onClick={() => open(`${binLabel(i)}/mi · ${scope}`, b.ids)}
                title={`${binLabel(i)}/mi: ${b.count} ${loadsWord} · ${usd.format(b.total)}`}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-haul-400"
              >
                <span className="nums text-xs font-semibold text-t2">{b.count ? num.format(b.count) : ''}</span>
                <span
                  className="w-full rounded-t-md bg-haul-500 transition-[height,opacity] duration-500 group-enabled:group-hover:opacity-80"
                  style={{ height: `${Math.max(b.count ? 8 : 2, (b.count / distMax) * 100)}%`, opacity: b.count ? 1 : 0.2 }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2 sm:gap-3">
            {a.rpmDist.map((_, i) => (
              <span key={i} className="nums flex min-w-0 flex-1 justify-center whitespace-nowrap text-2xs text-t3">
                {binLabel(i)}
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
                  className="h-full transition-[width] duration-500 hover:opacity-80"
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

        {/* Маршруты: штат → штат, сколько раз, $/mi. */}
        <Card title={`${L('analytics.lanes')} · ${scope}`} className="lg:col-span-12">
          {a.lanes.length === 0 && <Empty />}
          <div className="grid gap-x-6 md:grid-cols-2">
            {a.lanes.map((ln) => (
              <Row key={`${ln.from}${ln.to}`} onClick={() => open(`${ln.from} → ${ln.to} · ${scope}`, ln.ids)}>
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

      {pick && <Drill pick={pick} rows={rows} rateCons={rateCons} onClose={() => setPick(null)} />}
    </>
  )
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`h-10 min-w-0 flex-1 rounded-xl border bg-ink-900 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-haul-400 sm:max-w-[15rem] ${value ? 'border-haul-500 text-t1' : 'border-white/10 text-t2'}`}
    >
      <option value="">{label}</option>
      {children}
    </select>
  )
}

function Card({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`panel col-span-12 min-w-0 p-4 sm:p-5 ${className}`}>
      <h2 className="mb-3 truncate text-lg font-semibold tracking-[-0.02em] text-t1">{title}</h2>
      {children}
    </section>
  )
}

const rowCls =
  'flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-haul-400'

function Row({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${rowCls} border-t border-white/10 first:border-t-0 enabled:hover:bg-white/5 disabled:opacity-60`}>
      {children}
    </button>
  )
}

/** Строка-фильтр: сама строка включает и снимает фильтр, значок справа открывает грузы. */
function PickRow({ active, onClick, onList, listLabel, children }: { active: boolean; onClick: () => void; onList?: () => void; listLabel: string; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-1 rounded-lg border-t border-white/10 first:border-t-0 ${active ? 'bg-haul-500/15 ring-1 ring-haul-500' : ''}`}>
      <button type="button" aria-pressed={active} onClick={onClick} className={`${rowCls} flex-1 hover:bg-white/5`}>
        {children}
      </button>
      <button
        type="button"
        onClick={onList}
        disabled={!onList}
        aria-label={listLabel}
        title={listLabel}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-t3 outline-none hover:bg-white/5 hover:text-t1 focus-visible:ring-2 focus-visible:ring-haul-400 disabled:opacity-30"
      >
        <List size={16} />
      </button>
    </div>
  )
}

function Bar({ share }: { share: number }) {
  return (
    <span className="h-2 min-w-6 flex-1 overflow-hidden rounded-full bg-white/5">
      <span className="block h-full rounded-full bg-haul-500 transition-[width] duration-500" style={{ width: `${Math.max(2, Math.min(1, share) * 100)}%` }} />
    </span>
  )
}

function Spark({ values, active }: { values: number[]; active: boolean }) {
  const max = Math.max(...values, 0) || 1
  return (
    <span className="flex h-7 items-end gap-[3px]" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] transition-[height] duration-500 ${i === values.length - 1 || active ? 'bg-haul-500' : 'bg-haul-500/35'}`}
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
function Drill({ pick, rows, rateCons, onClose }: { pick: Pick; rows: ALoad[]; rateCons: [number, number][]; onClose: () => void }) {
  const locale = useLocale()
  const [doc, setDoc] = useState<number | null>(null)
  const rc = useMemo(() => new Map(rateCons), [rateCons])
  const list = useMemo(() => {
    const want = new Set(pick.ids)
    return rows.filter((r) => want.has(r.id)).sort((x, y) => (y.day ?? '').localeCompare(x.day ?? ''))
  }, [pick, rows])
  const total = list.reduce((s, r) => s + r.rate, 0)
  const miles = list.reduce((s, r) => s + r.loaded + r.dh, 0)

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
          {list.map((r) => {
            const m = r.loaded + r.dh
            return (
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
                    <span className="nums block text-2xs text-t3">{rpmFmt(m > 0 ? r.rate / m : 0)}/mi</span>
                  </span>
                </Link>
                {rc.has(r.id) && <RateConButton docId={rc.get(r.id)!} compact onOpen={() => setDoc(rc.get(r.id)!)} />}
              </li>
            )
          })}
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
