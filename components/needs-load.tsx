import Link from 'next/link'
import { Info } from '@/components/info'
import { truckLabel, type TruckRecord } from '@/lib/map'
import { usd } from '@/lib/fmt'
import { idleSummary, type IdleTruck } from '@/lib/idle-fleet'
import { t, type Locale } from '@/lib/i18n'

/**
 * «Кому искать груз» — карта на месте календаря загрузки.
 *
 * Календарь показывал, как парк отработал прошлые две недели. Для семи траков с
 * одним активным грузом сетка 14×7 почти пуста, и главное — на неё нельзя
 * отреагировать: это отчёт, а не задача. Здесь список того, что делать сегодня:
 * кто без груза, где он стоит, сколько уже стоит и во что это обошлось. Наверху
 * тот, кто стоит дольше всех, — с него и начинают обзвон.
 *
 * Цифра простоя — не упрёк, а порядок величины: платёж за трак, страховка, ELD и
 * пермиты капают каждый день независимо от того, едет он или нет.
 */
export function NeedsLoad({
  rows,
  trucks,
  trailers,
  locale,
}: {
  rows: IdleTruck[]
  trucks: Map<number, TruckRecord>
  trailers: Map<number, string>
  locale: Locale
}) {
  if (rows.length === 0) return null
  const { freeCount, burnPerDay } = idleSummary(rows)

  return (
    <section className="panel mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'needsLoad.title')}
          <Info text={t(locale, 'needsLoad.info')} />
        </h2>
        {/* Итог словами, а не процентом: «шесть без груза, простой $648 в день» —
            это и есть то, ради чего на карту смотрят. */}
        <p className="text-[12px] text-white/55">
          {freeCount > 0 ? (
            <>
              <span className="font-semibold text-warn-400">{freeCount}</span>{' '}
              {t(locale, 'needsLoad.freeOf').replace('{n}', String(rows.length))} ·{' '}
              <span className="nums font-semibold text-warn-400">{usd.format(burnPerDay)}</span>
              {t(locale, 'needsLoad.perDay')}
            </>
          ) : (
            <span className="text-good-400">{t(locale, 'needsLoad.allBusy')}</span>
          )}
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const truck = trucks.get(r.truckId)
          if (!truck) return null
          return (
            <li key={r.truckId}>
              <Link
                href={`/trucks/${r.truckId}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 transition-colors ${
                  r.unavailable
                    ? 'border-white/6 bg-white/[0.02] opacity-60 hover:opacity-100'
                    : r.free
                      ? 'border-warn-400/25 bg-warn-500/[0.06] hover:border-warn-400/50'
                      : 'border-white/8 hover:border-white/20'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {truckLabel(truck, trailers.get(r.truckId))}
                </span>

                <span className="min-w-0 truncate text-[12px] text-white/55">
                  {r.unavailable
                    ? t(locale, r.unavailable === 'repair' ? 'needsLoad.repair' : 'needsLoad.vacation')
                    : r.free
                      ? (r.place ?? t(locale, 'needsLoad.noPlace'))
                      : `→ ${r.place ?? '—'}`}
                </span>

                {/* Правая часть — ответ на «когда». У стоящего это «сколько уже»,
                    у едущего «до какого числа занят». */}
                <span className="nums shrink-0 text-right text-[12px]">
                  {r.free ? (
                    r.days === null ? (
                      <span className="text-white/40">{t(locale, 'needsLoad.never')}</span>
                    ) : (
                      <>
                        <span className={r.days >= 5 ? 'font-semibold text-bad-400' : 'text-warn-400'}>
                          {t(locale, 'needsLoad.idleDays').replace('{n}', String(r.days))}
                        </span>
                        {!r.unavailable && r.idleCost > 0 && (
                          <span className="ml-2 text-white/45">−{usd.format(r.idleCost)}</span>
                        )}
                      </>
                    )
                  ) : (
                    <span className="text-good-400">
                      {r.since
                        ? t(locale, 'needsLoad.freeOn').replace('{d}', fmtDay(r.since, locale))
                        : t(locale, 'needsLoad.onLoad')}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** «2026-08-17» → «17 авг». Год не пишем: карта смотрит на ближайшие дни. */
function fmtDay(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
  })
}
