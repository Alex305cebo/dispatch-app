// Fleet utilisation as a calendar grid: one row per truck, one cell per day, tinted by
// what that truck booked that day.
//
// The /trucks page already showed each truck's week total, but a single number can't
// tell "$9k spread evenly" from "$9k on one day and idle the rest" — and idle days are
// the thing an owner is actually hunting for. A grid shows gaps as gaps.

import { usd } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'

const DAY_MS = 24 * 60 * 60 * 1000

export type HeatRow = { id: number; label: string; byDay: Map<string, number> }

/** Local YYYY-MM-DD. Local, not UTC — a load booked at 9pm in California must land on
 * that day's column, not tomorrow's. */
export function dayKey(d: Date | number): string {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/**
 * Five opacity steps rather than a continuous ramp. A smooth gradient looks precise but
 * nobody can read a value off it; five buckets stay tellable apart at 14px, which is
 * the actual job — spotting which cells are empty and which are hot.
 */
function level(v: number, max: number): string {
  if (v <= 0) return 'bg-white/[0.05]'
  const q = max > 0 ? v / max : 0
  if (q > 0.75) return 'bg-good-400'
  if (q > 0.5) return 'bg-good-400/70'
  if (q > 0.25) return 'bg-good-400/45'
  return 'bg-good-400/25'
}

export function FleetHeatmap({
  rows,
  days = 14,
  locale,
}: {
  rows: HeatRow[]
  days?: number
  locale: Locale
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cols = Array.from({ length: days }, (_, i) => new Date(today.getTime() - (days - 1 - i) * DAY_MS))
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => r.byDay.get(dayKey(c)) ?? 0)))

  return (
    <div className="panel overflow-x-auto p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-white/55">
          {t(locale, 'trucks.heatmap.title')}
        </h2>
        {/* Legend doubles as the scale key; kept to the same five swatches the grid uses. */}
        <span className="flex items-center gap-1 text-2xs text-white/35">
          {t(locale, 'trucks.heatmap.less')}
          {['bg-white/[0.05]', 'bg-good-400/25', 'bg-good-400/45', 'bg-good-400/70', 'bg-good-400'].map((c) => (
            <span key={c} className={`size-2.5 rounded-[3px] ${c}`} />
          ))}
          {t(locale, 'trucks.heatmap.more')}
        </span>
      </div>

      <div className="min-w-max">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5 py-px">
            <span className="w-20 shrink-0 truncate text-2xs text-white/50">{r.label}</span>
            <div className="flex gap-1">
              {cols.map((c) => {
                const key = dayKey(c)
                const v = r.byDay.get(key) ?? 0
                return (
                  <span
                    key={key}
                    // title, not a tooltip component: this is 8x14 = 112 cells and any
                    // JS-backed tooltip here would cost more than the grid itself.
                    title={`${r.label} · ${key} · ${v > 0 ? usd.format(v) : t(locale, 'trucks.heatmap.idle')}`}
                    className={`size-3.5 rounded-[3px] ${level(v, max)}`}
                  />
                )
              })}
            </div>
          </div>
        ))}
        {/* Only the ends are labelled — a date under all fourteen columns at this cell
            size is unreadable, and the span is what matters. */}
        <div className="mt-1 flex items-center gap-1.5">
          <span className="w-20 shrink-0" />
          <div className="flex w-full justify-between text-[9px] text-white/25">
            <span>{dayKey(cols[0]!).slice(5)}</span>
            <span>{dayKey(cols[cols.length - 1]!).slice(5)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
