'use client'

// Fleet utilisation as a calendar grid: one row per truck, one cell per day. A cell is
// lit for every day the truck was ON A LOAD — the whole pickup→delivery span, not just
// the booking day — and dark for a day it genuinely sat idle. The row ends with a small
// summary: the share of the window worked, and what it earned.
//
// An earlier version lit only the pickup day and shaded it by rate. For trucking that
// misled twice: a 3-day haul showed one green cell and two "idle" ones, and a small
// fleet doing a load or two a week left the grid near-empty — read as broken, not
// "utilised 40%". Spanning the load across its days is what makes utilisation mean it.
//
// Client component for ONE reason: the hover card. A pure-CSS popover would be clipped
// by this panel's own overflow-x-auto (needed so the grid can scroll on a phone). A
// single card positioned from the hovered cell's rect escapes that, and — being real
// React — its route can be a Link straight to the load.

import { useRef, useState } from 'react'
import Link from 'next/link'
import { usd } from '@/lib/fmt'
import { statusLabel } from '@/components/status'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { dayKey, type HeatDayLoad, type HeatRow } from '@/lib/heatmap'

const DAY_MS = 24 * 60 * 60 * 1000

type Hover = { x: number; y: number; label: string; day: string; loads: HeatDayLoad[] }

export function FleetHeatmap({ rows, days = 14 }: { rows: HeatRow[]; days?: number }) {
  const locale = useLocale()
  const [hover, setHover] = useState<Hover | null>(null)
  // Closing is DELAYED so the mouse can travel from the cube up into the card to click
  // a load link; entering the card cancels the pending close. Without this the card
  // vanishes the instant you leave the 14px cube and the links are unreachable.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setHover(null), 140)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cols = Array.from({ length: days }, (_, i) => new Date(today.getTime() - (days - 1 - i) * DAY_MS))
  const colKeys = cols.map(dayKey)

  // Nice date for the hover heading, e.g. "Tue, Jul 15".
  const prettyDay = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })

  return (
    <div className="panel relative overflow-x-auto p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-white/55">
          {t(locale, 'trucks.heatmap.title')}
          <Info text={t(locale, 'trucks.heatmap.info')} />
        </h2>
        <span className="flex items-center gap-2 text-2xs text-white/40">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-[3px] bg-good-400" />
            {t(locale, 'trucks.heatmap.working')}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-[3px] bg-white/[0.06]" />
            {t(locale, 'trucks.heatmap.idle')}
          </span>
        </span>
      </div>

      <div className="min-w-max">
        {rows.map((r) => {
          const workedDays = colKeys.filter((k) => r.working.has(k)).length
          const pct = Math.round((workedDays / days) * 100)
          // Window revenue: each load counted once even though it spans several cells.
          const seen = new Set<number>()
          let earned = 0
          for (const k of colKeys)
            for (const l of r.working.get(k) ?? [])
              if (!seen.has(l.id)) {
                seen.add(l.id)
                earned += l.rate
              }
          return (
            <div key={r.id} className="flex items-center gap-1.5 py-px">
              <span className="w-20 shrink-0 truncate text-2xs text-white/50">{r.label}</span>
              <div className="flex gap-1">
                {cols.map((c, i) => {
                  const key = colKeys[i]!
                  const loads = r.working.get(key)
                  return (
                    <span
                      key={key}
                      onMouseEnter={(e) => {
                        cancelClose()
                        const box = e.currentTarget.getBoundingClientRect()
                        setHover({
                          x: box.left + box.width / 2,
                          y: box.top,
                          label: r.label,
                          day: key,
                          loads: loads ?? [],
                        })
                      }}
                      onMouseLeave={scheduleClose}
                      className={`size-3.5 rounded-[3px] transition-transform hover:scale-125 ${
                        loads ? 'bg-good-400' : 'bg-white/[0.06]'
                      }`}
                    />
                  )
                })}
              </div>
              {/* The right side that used to be blank: utilisation AND what the truck
                  earned across the window — the two numbers that make a row worth a
                  glance. */}
              <span
                className={`nums ml-2 w-10 shrink-0 text-right text-2xs font-semibold ${
                  pct >= 70 ? 'text-good-400' : pct >= 35 ? 'text-white/60' : 'text-warn-400'
                }`}
              >
                {pct}%
              </span>
              <span className="nums w-16 shrink-0 text-right text-2xs text-white/45">
                {earned > 0 ? usd.format(earned) : '—'}
              </span>
            </div>
          )
        })}
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="w-20 shrink-0" />
          <div className="flex w-full justify-between text-[9px] text-white/25">
            <span>{colKeys[0]!.slice(5)}</span>
            <span>{colKeys[colKeys.length - 1]!.slice(5)}</span>
          </div>
          <span className="ml-2 w-10 shrink-0" />
          <span className="w-16 shrink-0" />
        </div>
      </div>

      {/* One shared hover card, fixed to the viewport so the panel's overflow can't clip
          it. Positioned above the cell; the pointer-events let a load link be clicked. */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full pb-1.5"
          style={{ left: hover.x, top: hover.y }}
        >
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="pointer-events-auto min-w-[180px] max-w-[240px] rounded-lg border border-white/12 bg-ink-900 p-2.5 shadow-2xl"
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-white/50">{hover.label}</span>
              <span className="nums text-2xs text-white/45">{prettyDay(hover.day)}</span>
            </div>
            {hover.loads.length === 0 ? (
              <p className="text-xs text-white/45">{t(locale, 'trucks.heatmap.idleDay')}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {hover.loads.map((l) => (
                  <Link
                    key={l.id}
                    href={`/loads/${l.id}`}
                    className="group flex items-center justify-between gap-2 rounded-md bg-white/[0.04] px-2 py-1.5 transition-colors hover:bg-haul-500/15"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-white/85 group-hover:text-white">
                        {l.route}
                      </span>
                      <span className="text-2xs text-white/45">{statusLabel(locale, l.status)}</span>
                    </span>
                    <span className="nums shrink-0 text-xs font-semibold text-white/80">{usd.format(l.rate)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

