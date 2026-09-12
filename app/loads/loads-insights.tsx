'use client'

// Верх страницы «Грузы»: плитки недели, очередь внимания и недельный график.
// Считается на клиенте из той же выборки, что и список, — новых данных не нужно.
// Оформление — как на обзоре: плитки Stat, тонированный баннер внимания, секции с ⓘ.

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, DollarSign, Truck, TrendingUp } from 'lucide-react'
import type { LoadRecord, TruckRecord } from '@/lib/map'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { weekStats, shiftDay } from '@/lib/loads-dashboard'
import { usd, usd2 } from '@/lib/fmt'
import { Info } from '@/components/info'
import { Stat } from '@/components/stat'

/** Выборка для списка ниже: какие грузы показать и как подписать чип. */
export type Selection = { ids: number[]; label: string } | null

const dateLabel = (day: string, locale: Locale) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
export const weekdayLabel = (day: string, locale: Locale) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' })

const SPARK = { haul: 'bg-haul-400', good: 'bg-good-400', warn: 'bg-warn-400' } as const
const HATCH = {
  backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, var(--color-haul-400) 4px 5px)',
}

/** Мини-график под цифрой плитки: форма недели или парка, без осей. Нулевой день —
 * тонкая черта, чтобы пустые дни было видно. */
function Spark({ values, tone }: { values: (number | null)[]; tone: keyof typeof SPARK }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0))
  return (
    <div className="mt-3 flex h-7 items-end gap-0.5" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] opacity-50 ${SPARK[tone]}`}
          style={{ height: v == null ? 0 : `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

export function LoadsKpis({
  loads,
  trucks,
  weekFrom,
  locale,
  onSelect,
}: {
  loads: LoadRecord[]
  trucks: TruckRecord[]
  /** Первый день текущей расчётной недели, yyyy-mm-dd. */
  weekFrom: string
  locale: Locale
  onSelect: (value: Selection) => void
}) {
  const week = weekStats(loads, trucks, weekFrom)
  const next = weekStats(loads, trucks, shiftDay(weekFrom, 7))
  // Тренд ставки — четыре ЗАВЕРШЁННЫЕ недели: текущая ещё не докатана и занижала бы линию.
  const trend = [-28, -21, -14, -7].map((n) => weekStats(loads, trucks, shiftDay(weekFrom, n)).rpm)
  const nextTrucks = next.coverage.filter((c) => c.days > 0).length
  const nextTone = nextTrucks === 0 ? 'warn' : 'haul'
  const pick = (key: MsgKey, rows: LoadRecord[]) => () => onSelect({ ids: rows.map((l) => l.id), label: t(locale, key) })
  const icon = { size: 15, strokeWidth: 2.5 }
  return (
    <div className="panel mb-4 grid grid-cols-2 gap-2.5 p-2.5 lg:grid-cols-4">
      <Stat
        hero
        accent="haul"
        icon={<DollarSign {...icon} />}
        label={t(locale, 'loads.dash.booked')}
        value={usd.format(week.gross)}
        sub={`${dateLabel(weekFrom, locale)} – ${dateLabel(shiftDay(weekFrom, 6), locale)}`}
        info={t(locale, 'loads.dash.bookedInfo')}
        onClick={pick('loads.dash.booked', week.rows)}
      >
        <Spark values={week.buckets.map((b) => b.gross)} tone="haul" />
      </Stat>
      <Stat
        accent="good"
        icon={<TrendingUp {...icon} />}
        label={t(locale, 'loads.dash.rpm')}
        value={week.rpm == null ? '—' : `${usd2.format(week.rpm)}/mi`}
        sub={t(locale, 'loads.dash.historyTrend')}
        info={t(locale, 'loads.dash.rpmInfo')}
        onClick={pick('loads.dash.rpm', week.rows)}
      >
        <Spark values={trend} tone="good" />
      </Stat>
      <Stat
        accent="haul"
        icon={<Truck {...icon} />}
        label={t(locale, 'loads.dash.utilization')}
        value={week.utilization == null ? '—' : `${Math.round(week.utilization)}%`}
        sub={`${week.occupied} / ${week.capacity} ${t(locale, 'loads.dash.truckDays')}`}
        info={t(locale, 'loads.dash.utilizationInfo')}
        onClick={pick('loads.dash.utilization', week.busy)}
      >
        <Spark values={week.coverage.map((c) => c.days)} tone="haul" />
      </Stat>
      <Stat
        accent={nextTone}
        icon={<CalendarDays {...icon} />}
        label={t(locale, 'loads.dash.nextWeek')}
        value={usd.format(next.gross)}
        sub={`${nextTrucks} / ${next.coverage.length} ${t(locale, 'loads.dash.planned')}`}
        info={t(locale, 'loads.dash.nextWeekInfo')}
        onClick={pick('loads.dash.nextWeek', next.rows)}
      >
        <Spark values={next.buckets.map((b) => b.gross)} tone={nextTone} />
      </Stat>
    </div>
  )
}

/** Неделя по дням: суммы ставок по дате пикапа, заявки штриховкой сверху. День
 * нажимается и раскрывает свои грузы. */
export function LoadsWeekChart({ loads, trucks, weekFrom, locale }: { loads: LoadRecord[]; trucks: TruckRecord[]; weekFrom: string; locale: Locale }) {
  const [week, setWeek] = useState(weekFrom)
  const [selected, setSelected] = useState<string | null>(null)
  const stats = weekStats(loads, trucks, week)
  const max = Math.max(1, ...stats.buckets.map((b) => b.gross + b.quoted))
  const rows = stats.buckets.find((b) => b.day === selected)?.rows ?? []
  const go = (day: string) => {
    setWeek(day)
    setSelected(null)
  }
  const arrow =
    'inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 text-white/75 transition-colors hover:border-white/25 hover:bg-white/5 max-md:min-h-11 max-md:min-w-11'
  return (
    <section className="panel mt-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
            {t(locale, 'loads.dash.chart')}
            <Info text={t(locale, 'loads.dash.chartHint')} />
          </h2>
          <p className="nums mt-0.5 text-[12px] text-white/55">
            {dateLabel(week, locale)} – {dateLabel(shiftDay(week, 6), locale)} ·{' '}
            <span className="font-semibold text-white/85">{usd.format(stats.gross)}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {week !== weekFrom && (
            <button
              type="button"
              onClick={() => go(weekFrom)}
              className="rounded-full bg-haul-500/15 px-2 py-0.5 text-[11px] font-semibold text-haul-400 transition-colors hover:bg-haul-500/25"
            >
              {t(locale, 'loads.page.today')}
            </button>
          )}
          <button type="button" className={arrow} aria-label={t(locale, 'loads.page.prevWeek')} onClick={() => go(shiftDay(week, -7))}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className={arrow} aria-label={t(locale, 'loads.page.nextWeek')} onClick={() => go(shiftDay(week, 7))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="panel-inset mt-3 grid grid-cols-7 gap-1 px-1.5 pt-2 sm:gap-2 sm:px-2.5">
        {stats.buckets.map((b) => {
          const title = `${usd.format(b.gross)} + ${usd.format(b.quoted)} (${t(locale, 'loads.dash.quoted')})`
          return (
            <button
              key={b.day}
              type="button"
              aria-pressed={selected === b.day}
              aria-label={`${dateLabel(b.day, locale)}: ${title}`}
              title={title}
              onClick={() => setSelected(selected === b.day ? null : b.day)}
              className={`flex min-w-0 flex-col rounded-md px-0.5 pt-1 transition-colors hover:bg-white/[0.05] ${
                selected === b.day ? 'bg-haul-500/10 ring-1 ring-haul-400/40' : ''
              }`}
            >
              <span className="nums hidden truncate text-center text-[11px] text-white/55 sm:block">{b.gross ? usd.format(b.gross) : '—'}</span>
              <span className="mt-1 flex h-28 flex-col justify-end">
                <span className="block rounded-t-[3px] bg-haul-400/10" style={{ ...HATCH, height: `${(b.quoted / max) * 100}%` }} />
                <span
                  className={`block bg-haul-500 ${b.quoted ? '' : 'rounded-t-[3px]'}`}
                  style={{ height: `${(b.gross / max) * 100}%`, minHeight: b.gross ? 3 : 0 }}
                />
              </span>
              <span className="py-2 text-center text-[11px] capitalize leading-4 text-white/55">
                {weekdayLabel(b.day, locale)}
                <br />
                <span className="nums text-white/80">{Number(b.day.slice(-2))}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-haul-500" />
          {t(locale, 'loads.dash.booked')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-haul-400/10" style={HATCH} />
          {t(locale, 'loads.dash.quoted')}
        </span>
        {stats.missingDates > 0 && (
          <span className="ml-auto">
            {t(locale, 'loads.dash.missingDates')}: <span className="nums">{stats.missingDates}</span>
          </span>
        )}
      </div>

      {!stats.buckets.some((b) => b.rows.length > 0) && <p className="mt-2 text-[12px] text-white/55">{t(locale, 'loads.dash.noLoads')}</p>}
      {selected && (
        <div className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          <p className="py-2 text-[12px] font-semibold text-white/70">{dateLabel(selected, locale)}</p>
          {rows.length ? (
            rows.map((l) => (
              <Link
                key={l.id}
                href={`/loads/${l.id}`}
                className="flex items-baseline justify-between gap-3 py-1.5 text-[13px] text-white/80 transition-colors hover:text-white max-md:min-h-11 max-md:items-center"
              >
                <span className="min-w-0 break-words">
                  {l.origin ?? '—'} → {l.destination ?? '—'}
                </span>
                <span className="nums shrink-0 font-semibold">{usd.format(l.rate)}</span>
              </Link>
            ))
          ) : (
            <p className="py-2 text-[12px] text-white/55">{t(locale, 'loads.dash.noLoads')}</p>
          )}
        </div>
      )}
    </section>
  )
}

export type AttentionCategory = 'documents' | 'ready' | 'overdue' | 'checks'
export type AttentionEntry = { id: number; route: string; category: AttentionCategory; detail: string }
const CATEGORY_KEY: Record<AttentionCategory, MsgKey> = {
  documents: 'loads.dash.documents',
  ready: 'loads.filter.ready',
  overdue: 'loads.dash.overdue',
  checks: 'loads.dash.checks',
}
const CATEGORIES = Object.keys(CATEGORY_KEY) as AttentionCategory[]

/** Очередь внимания — тот же тонированный баннер, что «Document deadlines» на обзоре:
 * категории чипами, три первые записи, «Показать все» уводит в список ниже. */
export function LoadsAttention({ entries, locale, onSelect }: { entries: AttentionEntry[]; locale: Locale; onSelect: (value: Selection) => void }) {
  const [category, setCategory] = useState<AttentionCategory | null>(null)
  if (!entries.length) return null
  const rows = category ? entries.filter((e) => e.category === category) : entries
  const ids = [...new Set(rows.map((e) => e.id))]
  const total = new Set(entries.map((e) => e.id)).size
  return (
    <section className="mb-4 flex gap-2.5 rounded-xl border border-warn-400/25 bg-warn-400/[0.07] px-3.5 py-2.5">
      <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-warn-400/15 text-warn-400 ring-1 ring-warn-400/25">
        <AlertTriangle size={15} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-warn-400">
            {t(locale, 'loads.dash.attention')} · <span className="nums">{total}</span>
            <Info text={t(locale, 'loads.dash.attentionInfo')} />
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((key) => {
              const n = entries.filter((e) => e.category === key).length
              return (
                n > 0 && (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={category === key}
                    onClick={() => setCategory(category === key ? null : key)}
                    className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors max-md:min-h-9 ${
                      category === key ? 'bg-warn-400/20 text-warn-400 ring-1 ring-warn-400/30' : 'bg-white/[0.06] text-white/70 hover:text-white'
                    }`}
                  >
                    {t(locale, CATEGORY_KEY[key])} · <span className="nums">{n}</span>
                  </button>
                )
              )
            })}
          </div>
        </div>
        <div className="mt-1.5 divide-y divide-white/[0.06]">
          {rows.slice(0, 3).map((e) => (
            <Link
              key={`${e.id}-${e.category}`}
              href={`/loads/${e.id}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-[13px] text-white/80 transition-colors hover:text-white max-md:min-h-11 max-md:items-center"
            >
              <span className="min-w-0 break-words">{e.route}</span>
              <span className="nums shrink-0 text-[12px] text-white/55">
                {category ? e.detail : `${t(locale, CATEGORY_KEY[e.category])} · ${e.detail}`}
              </span>
            </Link>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onSelect({ ids, label: t(locale, category ? CATEGORY_KEY[category] : 'loads.dash.attention') })}
          className="mt-1 text-[12px] font-medium text-warn-400 hover:underline max-md:min-h-9"
        >
          {t(locale, 'loads.dash.more')} · <span className="nums">{ids.length}</span> →
        </button>
      </div>
    </section>
  )
}
