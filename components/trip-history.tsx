// The truck's day as a timeline — drive legs and stops, long rests called out.
// Pure presentation: lib/trip-history.ts does the actual clustering.

import { Fragment } from 'react'
import { DAY_MS, daySpans, startOfDay, type HistoryLeg } from '@/lib/trip-history'
import { driveTime } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'

const timeOf = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleTimeString(locale === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })
// Full day/month/year for the date dividers between rows.
const dateOf = (iso: string, locale: Locale) => new Date(iso).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')
// Short day.month for a leg that crosses midnight — the divider above only shows
// the day the leg STARTED, so the end time alone ("15:34–15:00") read like nonsense.
const dateShort = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit' })

function rangeLabel(from: string, to: string, locale: Locale): string {
  const tf = timeOf(from, locale)
  const tt = timeOf(to, locale)
  return dateOf(from, locale) === dateOf(to, locale) ? `${tf}–${tt}` : `${tf}–${tt} (${dateShort(to, locale)})`
}

/**
 * One day as a 24-hour ribbon: green where the truck rolled, grey where it sat, amber
 * for a long rest. The list below already had every one of these facts in words, but
 * a column of "09:14–11:02 · 2 ч" never shows the SHAPE of a day — and the shape is
 * the useful part. A six-hour grey block wedged between two drives is detention, and
 * detention is billable; in the text list it looks identical to an overnight.
 *
 * Legs are clipped to the day they're drawn on, so one that runs past midnight shows
 * on both days rather than overflowing the bar.
 */
function DayRibbon({ dayMs, legs, locale }: { dayMs: number; legs: HistoryLeg[]; locale: Locale }) {
  // Geometry lives in lib/trip-history.ts and is unit-tested there (midnight-crossing
  // legs are the case that silently breaks) — this component only paints it.
  const spans = daySpans(legs, dayMs)
  const driveMin = spans
    .filter((s) => s.leg.kind === 'drive')
    .reduce((sum, s) => sum + (s.toMs - s.fromMs) / 60000, 0)

  return (
    <li className="px-1 pb-1">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white/6">
        {spans.map((s, i) => (
          <span
            key={i}
            title={`${timeOf(new Date(s.fromMs).toISOString(), locale)}–${timeOf(new Date(s.toMs).toISOString(), locale)}`}
            className={`absolute inset-y-0 ${
              s.leg.kind === 'drive'
                ? 'bg-good-400'
                : s.leg.long
                  ? 'bg-warn-400/80'
                  : 'bg-white/25'
            }`}
            style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] tabular-nums text-white/25">
        {['00', '06', '12', '18', '24'].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {driveMin > 0 && (
        <div className="mt-0.5 text-[10px] text-white/40">
          {t(locale, 'trucks.trip.wheelsTurning')} {driveTime(Math.round(driveMin), locale)}
        </div>
      )}
    </li>
  )
}

export function TripHistory({ legs, locale }: { legs: HistoryLeg[]; locale: Locale }) {
  if (legs.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-white/55">
        {t(locale, 'trucks.trip.empty')}
      </p>
    )
  }

  let lastDate = ''

  return (
    <ol className="flex flex-col gap-1.5">
      {legs.map((leg, i) => {
        const day = dateOf(leg.from, locale)
        const isNewDay = day !== lastDate
        lastDate = day

        return (
          <Fragment key={i}>
            {/* One date per day the truck was out, not per row — otherwise a 3/7-day
                window is just a wall of times with no way to tell where one day ends
                and the next begins. */}
            {isNewDay && (
              <>
                <li className="mt-2.5 px-1 text-2xs font-semibold uppercase tracking-wider text-white/40 first:mt-0">
                  {day}
                </li>
                {/* Every leg belonging to this calendar day, not just the ones after
                    this divider — a leg that began yesterday evening still occupies
                    this morning's hours and has to be drawn. */}
                <DayRibbon
                  dayMs={startOfDay(Date.parse(leg.from))}
                  legs={legs.filter((l) => {
                    const d0 = startOfDay(Date.parse(leg.from))
                    return Date.parse(l.to) > d0 && Date.parse(l.from) < d0 + DAY_MS
                  })}
                  locale={locale}
                />
              </>
            )}
            <li
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-[12.5px] ${
                leg.kind === 'stop' && leg.long
                  ? 'border-warn-400/25 bg-warn-400/[0.06]'
                  : 'border-white/6 bg-white/[0.015]'
              }`}
            >
              {leg.kind === 'drive' ? (
                <>
                  <span className="shrink-0 text-white/40" aria-hidden>
                    🚚
                  </span>
                  <span className="min-w-0 flex-1">
                    {leg.fromLocation || leg.toLocation ? (
                      <span className="block truncate text-white/75">
                        {leg.fromLocation ?? '—'} → {leg.toLocation ?? '—'}
                      </span>
                    ) : null}
                    <span className="block text-[11px] text-white/45">{rangeLabel(leg.from, leg.to, locale)}</span>
                  </span>
                  <span className="nums ml-auto shrink-0 font-medium text-white/85">
                    {leg.miles} mi · {driveTime(leg.minutes, locale)}
                  </span>
                </>
              ) : (
                <>
                  <span className="shrink-0" aria-hidden>
                    {leg.long ? '🛏' : '⏸'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white/75">
                    {leg.long ? t(locale, 'trucks.trip.longRest') : t(locale, 'trucks.trip.stop')}
                    {leg.location ? ` · ${leg.location}` : ''}
                  </span>
                  <span
                    className={`nums ml-auto shrink-0 font-medium ${leg.long ? 'text-warn-400' : 'text-white/70'}`}
                  >
                    {rangeLabel(leg.from, leg.to, locale)} · {driveTime(leg.minutes, locale)}
                  </span>
                </>
              )}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
