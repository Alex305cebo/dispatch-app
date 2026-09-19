import Link from 'next/link'
import { stopNames } from '@/lib/driver-info-zip'
import { listLoads } from '@/lib/loads'
import { allStopEvents } from '@/lib/load-events'
import { detentionTerms, getSettings } from '@/lib/settings'
import { avgDwell, facilitiesForLoad, facilityIndex, facilityNoteKey } from '@/lib/facilities'
import { stopTitle, stopsFrom } from '@/lib/stops'
import { driveTime, usDate } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'
import type { LoadRecord } from '@/lib/map'
import { FacilityNote } from '@/components/facility-note'
import { Info } from '@/components/info'

/**
 * «Мы здесь уже были»: под каждой остановкой груза — сколько раз возили на этот склад,
 * сколько там стояли, был ли детеншн, «как заехать» с прошлого раза и заметка. Считается
 * по всем грузам компании (lib/facilities.ts), поэтому живёт в своей Suspense-границе.
 */
export async function FacilityHints({ companyId, load, locale }: { companyId: 'default' | 'demo'; load: LoadRecord; locale: Locale }) {
  const [loads, events, terms] = await Promise.all([listLoads(companyId), allStopEvents(companyId), detentionTerms()])
  const hints = facilitiesForLoad(facilityIndex(loads, events, terms.free), load)
  if (!hints.length) return null
  const notes = await getSettings(hints.map((h) => facilityNoteKey(h.facility.key)))
  const stops = stopsFrom(load, stopNames(load.driverInfo))
  return (
    <section className="panel mt-4 p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
        {t(locale, 'facilities.hintsHeading')}
        <Info text={t(locale, 'facilities.hintsInfo')} />
      </h2>
      <ul className="divide-y divide-white/[0.06]">
        {hints.map(({ stop, facility: f }) => {
          const dwell = avgDwell(f)
          return (
            <li key={`${stop.seq}-${f.key}`} className="py-2 text-base">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-t3">{stopTitle(stop, stops, locale)}</span>
                <Link href={`/facilities/${encodeURIComponent(f.key)}`} className="font-medium text-t1 hover:text-haul-300 hover:underline">
                  {f.name ?? f.address ?? f.city}
                </Link>
                <span className="nums text-t2">
                  {t(locale, 'facilities.visits').replace('{n}', String(f.visits))}
                  {f.lastDate && ` · ${usDate(f.lastDate)}`}
                  {dwell != null && ` · ${t(locale, 'facilities.dwell').replace('{t}', driveTime(dwell, locale))}`}
                </span>
                {f.detentions > 0 && (
                  <span className="rounded-full bg-bad-500/15 px-2 py-0.5 text-xs font-semibold text-bad-400">
                    {t(locale, 'facilities.detentions').replace('{n}', String(f.detentions))}
                  </span>
                )}
              </p>
              {f.directions && !stop.directions && (
                <p className="mt-1 text-sm text-t2">
                  <span className="font-semibold text-warn-400">⚠ {t(locale, 'facilities.lastDirections')}:</span> {f.directions}
                </p>
              )}
              <div className="mt-1">
                <FacilityNote facilityKey={f.key} note={notes.get(facilityNoteKey(f.key)) ?? null} />
              </div>
            </li>
          )
        })}
      </ul>
      <Link href="/brokers?view=facilities" className="mt-2 inline-block text-sm font-medium text-haul-400 hover:underline">
        {t(locale, 'facilities.all')} →
      </Link>
    </section>
  )
}
