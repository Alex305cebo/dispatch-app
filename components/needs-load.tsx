import { CopyPlace } from '@/components/copy-place'
import type { FeedItem } from '@/components/today-feed'
import { truckLabel, type TruckRecord } from '@/lib/map'
import { usd, usd2, usDate } from '@/lib/fmt'
import { todayEt } from '@/lib/payments'
import type { IdleTruck } from '@/lib/idle-fleet'
import { t, type Locale } from '@/lib/i18n'
import { datCached, datEquipment, heatLevel, HEAT_LEVEL_KEY, ltHeat, ltMedian, ltOf, regionOf, stateFromPlace, type DatEquipment } from '@/lib/dat-market'

/**
 * «Кому искать груз» — раздел ленты «Ждёт тебя» на «Сегодня».
 *
 * Список того, что делать сегодня: кто без груза, где он стоит, сколько уже стоит и во
 * что это обошлось. Наверху тот, кто стоит дольше всех, — с него и начинают обзвон.
 * Следом те, кто освобождается сегодня-завтра: под них груз ищут, пока они ещё едут.
 * Ремонт, отпуск и «дома» сюда не попадают — это не работа диспетчера; вся картина
 * парка по дням — «Загрузка парка» на «Траках».
 *
 * Цифра простоя — не упрёк, а порядок величины: платёж за трак, страховка, ELD и
 * пермиты капают каждый день независимо от того, едет он или нет.
 */
export function needsLoadRows(rows: IdleTruck[]): IdleTruck[] {
  return rows.filter((r) => !r.unavailable && !r.homeUntil && (r.free || (r.days != null && r.days >= -1)))
}

const series = (trailers: Map<number, string>, truckId: number): DatEquipment => datEquipment(trailers.get(truckId)) ?? 'VAN'

/** Насколько горячий рынок там, где стоят траки без груза: снимки DAT по сериям их
 *  трейлеров (иначе Van). Только из кэша — главная DAT не ждёт. */
export async function idleMarkets(rows: IdleTruck[], trailers: Map<number, string>) {
  const kinds = [...new Set(rows.filter((r) => r.free).map((r) => series(trailers, r.truckId)))]
  return new Map(await Promise.all(kinds.map(async (eq) => [eq, await datCached(eq)] as const)))
}

export function needsLoadItems({
  rows,
  trucks,
  trailers,
  markets,
  locale,
}: {
  rows: IdleTruck[]
  trucks: Map<number, TruckRecord>
  trailers: Map<number, string>
  markets: Awaited<ReturnType<typeof idleMarkets>>
  locale: Locale
}): FeedItem[] {
  return rows.flatMap((r): FeedItem[] => {
    const truck = trucks.get(r.truckId)
    if (!truck) return []
    const snap = r.free ? (markets.get(series(trailers, r.truckId)) ?? null) : null
    const state = stateFromPlace(r.place)
    const lt = snap ? ltOf(snap, state) : null
    const heat = snap && lt ? ltHeat(snap, lt.ratio) : null
    return [
      {
        key: `idle-${r.truckId}`,
        href: `/trucks/${r.truckId}`,
        title: truckLabel(truck, trailers.get(r.truckId)),
        detail: (
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {/* У стоящего трака место — это ответ брокеру «где он сейчас», и его
                копируют. У едущего здесь город ВЫГРУЗКИ — копировать нечего. */}
            {r.free && r.place ? (
              <CopyPlace text={r.place} size="sm" className="min-w-0 text-sm text-t2" />
            ) : (
              <span className="text-t3">{r.free ? t(locale, 'needsLoad.noPlace') : `→ ${r.place ?? '—'}`}</span>
            )}
            {/* Рынок в штате стоянки: ставка за милю региона и насколько горячий штат —
                словами, без цифры «грузов на трак», которую никто не читал. */}
            {snap && lt && heat && (
              <span title={`${state} · ${t(locale, 'loadCard.marketAsOf').replace('{when}', usDate(todayEt(new Date(snap.at))))}`} className="text-t3">
                {(() => {
                  const [before, after] = t(locale, 'needsLoad.market').split('{heat}')
                  const rpm = regionOf(snap, state)?.rpm
                  return (
                    <>
                      {rpm ? <span className="nums text-t2">{usd2.format(rpm)}/mi · </span> : null}
                      {before}
                      <span className={heat === 'hot' ? 'font-semibold text-good-400' : heat === 'cold' ? 'font-semibold text-bad-400' : 'text-t2'}>
                        {t(locale, HEAT_LEVEL_KEY[heatLevel(ltMedian(snap), lt.ratio)])}
                      </span>
                      {after}
                    </>
                  )
                })()}
              </span>
            )}
            {/* Ответ на «когда»: у стоящего — сколько уже стоит, у едущего — когда освободится. */}
            {r.free ? (
              r.days === null ? (
                <span className="text-t3">{t(locale, 'needsLoad.never')}</span>
              ) : (
                <span>
                  <span className={r.days >= 5 ? 'font-semibold text-bad-400' : 'text-warn-400'}>
                    {t(locale, 'needsLoad.idleDays').replace('{n}', String(r.days))}
                  </span>
                  {r.idleCost > 0 && <span className="nums ml-2 text-t3">−{usd.format(r.idleCost)}</span>}
                </span>
              )
            ) : (
              <span className="text-good-400">
                {r.since ? t(locale, 'needsLoad.freeOn').replace('{d}', usDate(r.since) || r.since) : t(locale, 'needsLoad.onLoad')}
              </span>
            )}
          </span>
        ),
      },
    ]
  })
}
