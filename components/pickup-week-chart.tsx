'use client'

// «Грузы по дате пикапа»: неделя по дням — суммы ставок, заявки штриховкой сверху.
// Стоит в «Деньги → Недели» (план «Порядок в TMS», 10/09/26); до этого — внизу «Грузов»,
// под списком, где её почти никто не долистывал. Считается из уже пришедших грузов,
// стрелки листают недели без запроса к серверу.

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LoadRecord, TruckRecord } from '@/lib/map'
import { t, type Locale } from '@/lib/i18n'
import { weekStats, shiftDay } from '@/lib/loads-dashboard'
import { usd } from '@/lib/fmt'
import { Info } from '@/components/info'

const dateLabel = (day: string, locale: Locale) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
const weekdayLabel = (day: string, locale: Locale) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' })

const HATCH = {
  backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, var(--color-haul-400) 4px 5px)',
}

/** Неделя по дням: суммы ставок по дате пикапа, заявки штриховкой сверху. День
 * нажимается и раскрывает свои грузы. */
export function PickupWeekChart({ loads, trucks, weekFrom, locale }: { loads: LoadRecord[]; trucks: TruckRecord[]; weekFrom: string; locale: Locale }) {
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
    'inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-white/10 text-t2 transition-colors hover:border-white/25 hover:bg-white/5 max-md:min-h-11 max-md:min-w-11'
  return (
    <section className="panel p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
            {t(locale, 'loads.dash.chart')}
            <Info text={t(locale, 'loads.dash.chartHint')} />
          </h2>
          <p className="nums mt-0.5 text-sm text-t3">
            {dateLabel(week, locale)} – {dateLabel(shiftDay(week, 6), locale)} ·{' '}
            <span className="font-semibold text-t1">{usd.format(stats.gross)}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {week !== weekFrom && (
            <button
              type="button"
              onClick={() => go(weekFrom)}
              className="rounded-full bg-haul-500/15 px-2 py-0.5 text-xs font-semibold text-haul-400 transition-colors hover:bg-haul-500/25"
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
              <span className="nums hidden truncate text-center text-xs text-t3 sm:block">{b.gross ? usd.format(b.gross) : '—'}</span>
              <span className="mt-1 flex h-28 flex-col justify-end">
                <span className="block rounded-t-[3px] bg-haul-400/10" style={{ ...HATCH, height: `${(b.quoted / max) * 100}%` }} />
                <span
                  className={`block bg-haul-500 ${b.quoted ? '' : 'rounded-t-[3px]'}`}
                  style={{ height: `${(b.gross / max) * 100}%`, minHeight: b.gross ? 3 : 0 }}
                />
              </span>
              <span className="py-2 text-center text-xs capitalize leading-4 text-t3">
                {weekdayLabel(b.day, locale)}
                <br />
                <span className="nums text-t1">{Number(b.day.slice(-2))}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-t3">
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

      {!stats.buckets.some((b) => b.rows.length > 0) && <p className="mt-2 text-sm text-t3">{t(locale, 'loads.dash.noLoads')}</p>}
      {selected && (
        <div className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.06]">
          <p className="py-2 text-sm font-semibold text-t2">{dateLabel(selected, locale)}</p>
          {rows.length ? (
            rows.map((l) => (
              <Link
                key={l.id}
                href={`/loads/${l.id}`}
                className="flex items-baseline justify-between gap-3 py-1.5 text-base text-t1 transition-colors hover:text-white max-md:min-h-11 max-md:items-center"
              >
                <span className="min-w-0 break-words">
                  {l.origin ?? '—'} → {l.destination ?? '—'}
                </span>
                <span className="nums shrink-0 font-semibold">{usd.format(l.rate)}</span>
              </Link>
            ))
          ) : (
            <p className="py-2 text-sm text-t3">{t(locale, 'loads.dash.noLoads')}</p>
          )}
        </div>
      )}
    </section>
  )
}
