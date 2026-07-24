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

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usd } from '@/lib/fmt'
import { statusLabel } from '@/components/status'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { dayKey, type HeatDayLoad, type HeatRow } from '@/lib/heatmap'

const DAY_MS = 24 * 60 * 60 * 1000

type Hover = { x: number; top: number; bottom: number; label: string; day: string; loads: HeatDayLoad[] }

type TripRole = 'idle' | 'pickup' | 'transit' | 'delivery'

// One cell's glyph. A load reads as a journey — a dot where it's picked up, arrows
// while it's driven, a diamond where it's delivered — so a multi-day haul is clearly
// ONE trip, not one priced load per square. Idle days get a faint dot.
function TripMark({ role }: { role: TripRole }) {
  if (role === 'pickup') return <span className="size-2 rounded-full bg-good-400" />
  if (role === 'delivery') return <span className="size-[7px] rotate-45 rounded-[1px] bg-good-500" />
  if (role === 'transit')
    return (
      <svg
        viewBox="0 0 24 24"
        className="size-2.5 text-good-400/70"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    )
  return <span className="size-1 rounded-full bg-white/12" />
}

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

  // offset = whole windows shifted into the past (0 = the window ending today). The
  // arrows step it by `days`, so each click pages a full 14 days back/forward; you can
  // never page past today (offset floored at 0).
  const [offset, setOffset] = useState(0)
  // Phones show a 7-day window instead of 14 — half the columns fit comfortably without
  // shrinking to specks or forcing a horizontal scroll. matchMedia (not a CSS breakpoint)
  // because the column COUNT changes, which is a data decision, not just styling.
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const sync = () => setMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  const winDays = mobile ? 7 : days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const anchor = today.getTime() - offset * winDays * DAY_MS
  const cols = Array.from({ length: winDays }, (_, i) => new Date(anchor - (winDays - 1 - i) * DAY_MS))
  const colKeys = cols.map(dayKey)
  // Sat/Sun get a faint different tint so the eye can find week boundaries in the grid.
  const weekend = cols.map((c) => c.getDay() === 0 || c.getDay() === 6)

  const loc = locale === 'ru' ? 'ru-RU' : 'en-US'
  const monthShort = (d: Date) => d.toLocaleDateString(loc, { month: 'short' }).replace('.', '')
  const first = cols[0]!
  const last = cols[cols.length - 1]!
  const m0 = monthShort(first)
  const mN = monthShort(last)
  // Left-gutter label: one month, or "jun–jul" when the window straddles a boundary.
  const monthLabel = m0 === mN ? m0 : `${m0}–${mN}`
  // Header range beside the arrows, e.g. "10–23 jul" or "28 jun–11 jul".
  const rangeLabel =
    m0 === mN
      ? `${first.getDate()}–${last.getDate()} ${mN}`
      : `${first.getDate()} ${m0}–${last.getDate()} ${mN}`

  // Nice date for the hover heading, e.g. "Tue, Jul 15".
  const prettyDay = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })

  return (
    <div className="panel relative p-3">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-white/55">
          {t(locale, 'trucks.heatmap.title').replace('{n}', String(winDays))}
          <Info text={t(locale, 'trucks.heatmap.info')} />
        </h2>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2.5 text-2xs text-white/45 sm:flex">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-good-400" />
              {t(locale, 'trucks.heatmap.pickup')}
            </span>
            <span className="flex items-center gap-1">
              <TripMark role="transit" />
              {t(locale, 'trucks.heatmap.transit')}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-[7px] rotate-45 rounded-[1px] bg-good-500" />
              {t(locale, 'trucks.heatmap.delivery')}
            </span>
          </span>
          {/* Page the 14-day window back/forward. Next is disabled at offset 0 — the
              window already ends today, there's nothing in the future to show. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label={t(locale, 'trucks.heatmap.earlier')}
              className="grid size-6 place-items-center rounded-md text-white/55 transition-colors hover:bg-white/8 hover:text-white/85"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="nums w-[92px] text-center text-2xs tabular-nums text-white/50">{rangeLabel}</span>
            <button
              type="button"
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              disabled={offset === 0}
              aria-label={t(locale, 'trucks.heatmap.later')}
              className="grid size-6 place-items-center rounded-md text-white/55 transition-colors hover:bg-white/8 hover:text-white/85 disabled:pointer-events-none disabled:opacity-25"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Plain-words caption for the two right-hand numbers — the Info tooltip repeats it,
          but this stays visible so "42% / $5,140" never reads as a mystery. */}
      <p className="mb-2.5 max-w-2xl text-2xs leading-relaxed text-white/40">
        {t(locale, 'trucks.heatmap.axisNote')}
      </p>

      {/* Always full width, never scrolls. On a phone the day cells flex to share the
          space (rubber columns), so all 14 fit without horizontal scroll; from sm up the
          cells snap to a fixed 14px and the utilisation bar fills the rest. */}
      <div className="w-full">
        {rows.map((r) => {
          const workedDays = colKeys.filter((k) => r.working.has(k)).length
          const pct = Math.round((workedDays / winDays) * 100)
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
              <span className="w-16 shrink-0 truncate text-2xs text-white/50 sm:w-20">{r.label}</span>
              <div className="flex flex-1 gap-1 sm:flex-none">
                {cols.map((c, i) => {
                  const key = colKeys[i]!
                  const loads = r.working.get(key)
                  const dl = loads?.[0]
                  // A day is the pickup, the delivery, a driving day in between, or idle.
                  const role: TripRole = !dl ? 'idle' : dl.isPickup ? 'pickup' : dl.isDelivery ? 'delivery' : 'transit'
                  return (
                    <span
                      key={key}
                      onMouseEnter={(e) => {
                        cancelClose()
                        const box = e.currentTarget.getBoundingClientRect()
                        setHover({
                          x: box.left + box.width / 2,
                          top: box.top,
                          bottom: box.bottom,
                          label: r.label,
                          day: key,
                          loads: loads ?? [],
                        })
                      }}
                      onMouseLeave={scheduleClose}
                      className={`flex h-3.5 min-w-0 flex-1 items-center justify-center rounded-[3px] transition-colors hover:bg-white/10 sm:size-3.5 sm:flex-none ${
                        weekend[i] ? 'bg-haul-500/[0.13]' : ''
                      }`}
                    >
                      <TripMark role={role} />
                    </span>
                  )
                })}
              </div>
              {/* Utilisation as a bar — fills the right-hand space that used to sit empty
                  and makes the % legible at a glance (long green = busy truck). Hidden on
                  a phone, where the row scrolls and there's no room to spare. */}
              <div className="ml-2 hidden h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05] sm:block">
                <div
                  className={`h-full rounded-full ${
                    pct >= 70 ? 'bg-good-400' : pct >= 35 ? 'bg-white/30' : 'bg-warn-400/80'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {/* The right side that used to be blank: utilisation AND what the truck
                  earned across the window — the two numbers that make a row worth a
                  glance. */}
              <span
                className={`nums ml-1.5 w-8 shrink-0 text-right text-2xs font-semibold sm:ml-2 sm:w-10 ${
                  pct >= 70 ? 'text-good-400' : pct >= 35 ? 'text-white/60' : 'text-warn-400'
                }`}
              >
                {pct}%
              </span>
              <span className="nums w-12 shrink-0 text-right text-[10px] text-white/45 sm:w-16 sm:text-2xs">
                {earned > 0 ? usd.format(earned) : '—'}
              </span>
            </div>
          )
        })}
        {/* Date axis: the month sits in the left gutter (under the truck names); each
            cube gets its own day-of-month number so a cell reads as a real date. */}
        <div className="mt-1 flex items-center gap-1.5">
          <span className="w-16 shrink-0 truncate text-2xs font-medium capitalize text-white/45 sm:w-20">
            {monthLabel}
          </span>
          <div className="flex flex-1 gap-1 sm:flex-none">
            {cols.map((c, i) => (
              <span
                key={i}
                className={`nums min-w-0 flex-1 text-center text-[8.5px] font-semibold leading-none sm:w-3.5 sm:flex-none ${
                  weekend[i] ? 'text-haul-300/80' : 'font-normal text-white/30'
                }`}
              >
                {c.getDate()}
              </span>
            ))}
          </div>
          <span className="ml-2 hidden h-1.5 flex-1 sm:block" />
          <span className="ml-1.5 w-8 shrink-0 sm:ml-2 sm:w-10" />
          <span className="w-12 shrink-0 sm:w-16" />
        </div>
      </div>

      {/* One shared hover card, fixed to the viewport so the panel's overflow can't clip
          it. Positioned above the cell; the pointer-events let a load link be clicked. */}
      {hover &&
        createPortal(
          // Portaled to <body>, NOT left in the panel. The panel has backdrop-blur, and
          // a backdrop-filter makes its element the containing block for position:fixed
          // descendants — so a fixed card "anchored to the viewport" was actually
          // anchored to the panel, and the cell's viewport coords flung it to the
          // bottom-right. In the body it has no transformed ancestor, so fixed means
          // fixed. x is clamped to the viewport and the card flips below the cell when
          // there isn't room above — it always lands next to the square, never off-edge.
          (() => {
            const CARD_W = 240
            const CARD_H = 120
            const left = Math.min(Math.max(hover.x, CARD_W / 2 + 8), window.innerWidth - CARD_W / 2 - 8)
            const above = hover.top > CARD_H
            return (
              <div
                className={`pointer-events-none fixed z-[60] -translate-x-1/2 ${
                  above ? '-translate-y-full pb-1.5' : 'pt-1.5'
                }`}
                style={{ left, top: above ? hover.top : hover.bottom }}
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
                {hover.loads.map((l) => {
                  // What this hovered day is for this load: its pickup, its delivery, or
                  // a day driven in between — the label the user asked for.
                  const role: TripRole = l.isPickup ? 'pickup' : l.isDelivery ? 'delivery' : 'transit'
                  const roleKey =
                    role === 'pickup'
                      ? 'trucks.heatmap.pickup'
                      : role === 'delivery'
                        ? 'trucks.heatmap.delivery'
                        : 'trucks.heatmap.transit'
                  return (
                    <Link
                      key={l.id}
                      href={`/loads/${l.id}`}
                      className="group flex items-center justify-between gap-2 rounded-md bg-white/[0.04] px-2 py-1.5 transition-colors hover:bg-haul-500/15"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-white/85 group-hover:text-white">
                          {l.route}
                        </span>
                        <span className="flex items-center gap-1 text-2xs text-white/45">
                          <TripMark role={role} />
                          <span className="font-semibold text-good-300">{t(locale, roleKey)}</span>
                          <span className="text-white/25">·</span>
                          {statusLabel(locale, l.status)}
                        </span>
                      </span>
                      <span className="nums shrink-0 text-xs font-semibold text-white/80">{usd.format(l.rate)}</span>
                    </Link>
                  )
                })}
              </div>
            )}
                </div>
              </div>
            )
          })(),
          document.body,
        )}
    </div>
  )
}

