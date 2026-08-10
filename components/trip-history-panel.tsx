'use client'

// The trip-history section of /trucks/[id], with its own 24h / 3d / 7d switch.
//
// The switch used to be three <Link>s carrying ?history=. Changing the window was a
// route navigation: the whole truck page re-rendered on the server — map, loads,
// documents, maintenance — to replace one list. Once app/loading.tsx introduced a
// route-level Suspense boundary, that swap also flashed a full-page skeleton, which is
// how it got noticed. Now only this panel refetches, through a server action.

import { useEffect, useState, useTransition } from 'react'
import { TripHistory } from '@/components/trip-history'
import { Info } from '@/components/info'
import { SmallRefreshButton } from '@/components/small-refresh-button'
import { truckTripHistory } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import type { HistoryLeg } from '@/lib/trip-history'

export type HistoryWindow = { hours: number; key: MsgKey }

export function TripHistoryPanel({
  truckId,
  windows,
  initialHours,
  initialLegs,
}: {
  truckId: number
  windows: readonly HistoryWindow[]
  initialHours: number
  /** Rendered on the server for the first paint, so the panel is never empty on load. */
  initialLegs: HistoryLeg[]
}) {
  const locale = useLocale()
  const [hours, setHours] = useState(initialHours)
  const [legs, setLegs] = useState(initialLegs)
  const [pending, start] = useTransition()

  // useState seeds ONCE, and that broke the refresh button sitting in this very panel:
  // SmallRefreshButton polls GPS and calls router.refresh(), the server re-runs
  // tripHistory() and sends new initialLegs — which the component then ignored. The
  // dispatcher got an "updated N trucks" toast and watched the history not change.
  // Any fresh server render wins over what we last fetched ourselves.
  useEffect(() => {
    setLegs(initialLegs)
    setHours(initialHours)
  }, [initialLegs, initialHours])

  function pick(next: number) {
    if (next === hours || pending) return
    start(async () => {
      const res = await truckTripHistory(truckId, next)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      // Only committed once the data is in hand: flipping the highlighted button first
      // would claim the window changed while the old list was still on screen.
      setHours(next)
      setLegs(res.legs)
    })
  }

  const current = windows.find((w) => w.hours === hours) ?? windows[0]!

  return (
    <details className="panel mt-4 p-4" open={initialLegs.length > 0}>
      <summary className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
        {t(locale, 'trucks.detail.tripHistory')} · {t(locale, current.key)}
        <Info text={t(locale, 'trucks.detail.tripHistoryInfo')} />
        <SmallRefreshButton />
        <span className="ml-auto flex gap-1 normal-case">
          {windows.map((w) => (
            <button
              key={w.hours}
              type="button"
              // The switch lives inside <summary>, which toggles the panel on click —
              // without this a tap on "7 дней" would also collapse the section it just
              // filled.
              onClick={(e) => {
                e.preventDefault()
                pick(w.hours)
              }}
              disabled={pending}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                w.hours === hours ? 'bg-haul-500/15 text-haul-400' : 'text-white/45 hover:text-white/75'
              }`}
            >
              {t(locale, w.key)}
            </button>
          ))}
        </span>
      </summary>
      <div className={`mt-3 transition-opacity ${pending ? 'opacity-50' : ''}`}>
        <TripHistory legs={legs} locale={locale} />
      </div>
    </details>
  )
}
