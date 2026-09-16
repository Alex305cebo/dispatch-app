import Link from 'next/link'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { listLoads } from '@/lib/loads'
import { allStopEvents } from '@/lib/load-events'
import { detentionTerms, getSettings } from '@/lib/settings'
import { avgDwell, facilityIndex, facilityNoteKey, filterFacilities } from '@/lib/facilities'
import { driveTime, usDate } from '@/lib/fmt'
import { FacilityNote } from '@/components/facility-note'
import { Info } from '@/components/info'
import { Empty } from '@/components/empty'
import { Warehouse } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Справочник складов: все пикапы и выгрузки, где мы были, — сколько раз, сколько стояли,
 * детеншн, «как заехать» с прошлого раза и заметка диспетчера. Идея AscendTMS
 * (профили локаций), но без ручного ведения: всё считается по прошлым грузам.
 */
export default async function FacilitiesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const companyId = await companyScope()
  const locale = await getLocale()
  const [loads, events, terms] = await Promise.all([listLoads(companyId), allStopEvents(companyId), detentionTerms()])
  const all = [...facilityIndex(loads, events, terms.free).values()].sort(
    (a, b) => b.visits - a.visits || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''),
  )
  const list = filterFacilities(all, q)
  const notes = await getSettings(list.map((f) => facilityNoteKey(f.key)))

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight">
        {t(locale, 'facilities.title')}
        <Info side="bottom" text={t(locale, 'facilities.info')} />
      </h1>
      <p className="mb-4 text-[13px] text-white/65">{t(locale, 'facilities.subtitle').replace('{n}', String(all.length))}</p>

      <form className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder={t(locale, 'facilities.search')}
          className="min-h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none focus:border-haul-500/60 max-md:min-h-11"
        />
      </form>

      {list.length === 0 ? (
        <Empty icon={Warehouse} title={t(locale, 'facilities.emptyTitle')} text={t(locale, 'facilities.emptyText')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((f) => {
            const dwell = avgDwell(f)
            return (
              <li key={f.key} className="panel p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-white/90">{f.name ?? f.city ?? '—'}</p>
                    <p className="text-[12.5px] text-white/60">{f.address ?? f.city}</p>
                  </div>
                  <p className="nums shrink-0 text-right text-[12px] text-white/70">
                    <span className="font-semibold text-white/90">{t(locale, 'facilities.visits').replace('{n}', String(f.visits))}</span>
                    {f.lastDate && <span className="text-white/50"> · {usDate(f.lastDate)}</span>}
                    {dwell != null && (
                      <>
                        <br />
                        {t(locale, 'facilities.dwell').replace('{t}', driveTime(dwell, locale))}
                      </>
                    )}
                    {f.detentions > 0 && (
                      <>
                        <br />
                        <span className="text-bad-400">{t(locale, 'facilities.detentions').replace('{n}', String(f.detentions))}</span>
                      </>
                    )}
                  </p>
                </div>
                {f.directions && (
                  <p className="mt-1.5 text-[12.5px] text-white/75">
                    <span className="font-semibold text-warn-400">⚠ {t(locale, 'facilities.lastDirections')}:</span> {f.directions}
                  </p>
                )}
                <div className="mt-1.5">
                  <FacilityNote facilityKey={f.key} note={notes.get(facilityNoteKey(f.key)) ?? null} />
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-2 text-[11.5px] text-white/45">
                  {f.loadIds.slice(0, 6).map((id) => (
                    <Link key={id} href={`/loads/${id}`} className="hover:text-haul-400 hover:underline">
                      #{id}
                    </Link>
                  ))}
                  {f.loadIds.length > 6 && <span>+{f.loadIds.length - 6}</span>}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
