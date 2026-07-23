// The truck's day as a timeline — drive legs and stops, long rests called out.
// Pure presentation: lib/trip-history.ts does the actual clustering.

import { Fragment } from 'react'
import type { HistoryLeg } from '@/lib/trip-history'
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
              <li className="mt-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/40 first:mt-0">
                {day}
              </li>
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
