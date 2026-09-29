// «Деньги → Водители»: неделя работы каждого водителя одной строкой — сколько грузов,
// гросс, мили и Rate per mile.
//
// Раньше вкладка была ведомостью «к выплате» по неделям, а неделя груза считалась
// по дню, когда груз завели в систему: у демо все грузы попадали в одну неделю, у
// живых — в неделю ввода Rate Con, а не работы. И RPM водителя за неделю не было
// вовсе, хотя по нему владелец и смотрит неделю (29.09.2026: «не понимаю разделение
// по гроссу водителя и нет Rate per mile за неделю — это важно»).
//
// Все цифры — из грузов как есть: гросс — ставка Rate Con, мили — груженые +
// порожние из груза, RPM = гросс ÷ все мили. Неделя груза — по дню погрузки,
// пятница-пятница. Сумму к выплате водителю (с вычетами) владелец здесь видеть не
// хочет — она только в недельном файле для бухгалтера (/api/export/week), ссылка на
// него — в итоге недели.

import Link from 'next/link'
import { ChevronDown, Download } from 'lucide-react'
import { listLoads, listTrucks } from '@/lib/loads'
import { usd, usd2, loadWeekAnchorMs, weekAnchorOf, weekLabel, weekStart, usDate } from '@/lib/fmt'
import { truckLabel, type LoadRecord, type TruckRecord } from '@/lib/map'
import { t, type Locale } from '@/lib/i18n'
import { Info } from '@/components/info'
import { todayEt } from '@/lib/payments'

type LoadLine = { load: LoadRecord; miles: number }
type DriverRow = {
  truckId: number
  label: string
  loads: LoadLine[]
  gross: number
  miles: number
  loaded: number
}

/** Недель в полосе выбора и в мини-графике RPM. */
const WEEKS_SHOWN = 8
const TREND_WEEKS = 6

const rpm = (gross: number, miles: number) => (miles > 0 ? gross / miles : null)

export async function ByDriver({
  companyId,
  locale,
  week: weekParam,
}: {
  companyId: 'default' | 'demo'
  locale: Locale
  /** ?week=yyyy-mm-dd — пятница выбранной недели; нет — текущая. */
  week?: string
}) {
  const [loads, trucks] = await Promise.all([listLoads(companyId), listTrucks(companyId)])
  const byTruckId = new Map<number, TruckRecord>(trucks.map((tr) => [tr.id, tr]))
  // Только работа: котировка и отменённый груз ни гросса, ни миль водителю не дают.
  const committed = loads.filter((l) => l.status !== 'quoted' && l.status !== 'cancelled' && l.truckId !== null)

  // неделя → трак → строка
  const weeks = new Map<number, Map<number, DriverRow>>()
  for (const load of committed) {
    const truck = byTruckId.get(load.truckId!)
    if (!truck) continue
    const weekMs = weekAnchorOf(loadWeekAnchorMs(load.pickupDate, load.createdAt))
    let rows = weeks.get(weekMs)
    if (!rows) weeks.set(weekMs, (rows = new Map()))
    let row = rows.get(truck.id)
    if (!row) {
      row = { truckId: truck.id, label: truckLabel(truck), loads: [], gross: 0, miles: 0, loaded: 0 }
      rows.set(truck.id, row)
    }
    const miles = load.loadedMiles + load.deadheadMiles
    row.loads.push({ load, miles })
    row.gross += load.rate
    row.miles += miles
    row.loaded += load.loadedMiles
  }

  const current = weekStart()
  const dayOf = (ms: number) => todayEt(new Date(ms))
  // Полоса недель: текущая всегда (даже пустая), дальше — недели с работой, свежие первыми.
  const weekList = [...new Set([current, ...weeks.keys()])]
    .filter((ms) => ms <= current + 7 * 86_400_000)
    .sort((a, b) => b - a)
    .slice(0, WEEKS_SHOWN)
  const chosen = weekList.find((ms) => dayOf(ms) === weekParam) ?? current

  const rows = [...(weeks.get(chosen)?.values() ?? [])].sort((a, b) => b.gross - a.gross)
  const total = rows.reduce(
    (s, r) => ({ gross: s.gross + r.gross, miles: s.miles + r.miles, loads: s.loads + r.loads.length }),
    { gross: 0, miles: 0, loads: 0 },
  )
  const fleetRpm = rpm(total.gross, total.miles)

  // RPM водителя за прошлые недели — полосками под строкой: видно, растёт или падает.
  const trendWeeks = [...weeks.keys()].filter((ms) => ms <= chosen).sort((a, b) => a - b).slice(-TREND_WEEKS)
  const trendOf = (truckId: number) =>
    trendWeeks.map((ms) => {
      const r = weeks.get(ms)?.get(truckId)
      return { ms, rpm: r ? rpm(r.gross, r.miles) : null }
    })
  const trendAll = trendWeeks.flatMap((ms) =>
    [...(weeks.get(ms)?.values() ?? [])].map((r) => rpm(r.gross, r.miles)).filter((v): v is number => v != null),
  )
  const trendMax = Math.max(0.01, ...trendAll)
  const trendMin = Math.min(trendMax, ...trendAll)

  return (
    <div className="@container flex flex-col gap-3">
      {/* Недели — полосой: выбрал неделю, ниже цифры водителей именно за неё. */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {weekList.map((ms) => (
          <Link
            key={ms}
            href={`/docs?tab=drivers&week=${dayOf(ms)}`}
            aria-current={ms === chosen ? 'page' : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              ms === chosen
                ? 'border-haul-400/50 bg-haul-500/20 text-t1'
                : 'border-white/8 bg-white/[0.03] text-t2 hover:border-white/16 hover:text-t1'
            }`}
          >
            {ms === current ? t(locale, 'drivers.week.current') : weekLabel(ms, locale).replace(/ \d{4}$/, '')}
          </Link>
        ))}
      </div>

      {/* Итог недели по всему парку: с ним сравнивается каждый водитель ниже. */}
      <section className="panel p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold capitalize">{weekLabel(chosen, locale)}</h2>
          <span className="flex items-center gap-1 text-xs text-t3">
            {t(locale, 'finances.payWeekNote')}
            <Info text={t(locale, 'drivers.rpmInfo')} />
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          <Figure label={t(locale, 'drivers.col.gross')} value={usd.format(total.gross)} />
          <Figure label={t(locale, 'drivers.col.miles')} value={Math.round(total.miles).toLocaleString('en-US')} />
          <Figure label={t(locale, 'drivers.fleetRpm')} value={fleetRpm != null ? usd2.format(fleetRpm) : '—'} accent />
          <Figure label={t(locale, 'drivers.col.loads')} value={String(total.loads)} />
        </div>
        {total.loads > 0 && (
          <a
            href={`/api/export/week?start=${chosen}`}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm font-medium text-t2 transition-colors hover:border-white/30 hover:text-t1 max-md:min-h-10"
          >
            <Download size={14} strokeWidth={2.5} />
            {t(locale, 'drivers.csv')}
          </a>
        )}
      </section>

      {rows.length === 0 ? (
        <p className="panel p-6 text-center text-base text-t3">{t(locale, 'drivers.empty')}</p>
      ) : (
        <section className="panel overflow-hidden">
          {/* Шапка колонок — только на широкой плитке; на узкой у каждой цифры своя подпись. */}
          <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] gap-3 border-b border-white/8 px-4 py-2.5 text-2xs font-semibold tracking-wide text-t3 uppercase @3xl:grid">
            <span>{t(locale, 'drivers.col.driver')}</span>
            <span className="text-right">{t(locale, 'drivers.col.loads')}</span>
            <span className="text-right">{t(locale, 'drivers.col.gross')}</span>
            <span className="text-right">{t(locale, 'drivers.col.miles')}</span>
            <span className="text-right">Rate per mile</span>
          </div>
          <ul className="divide-y divide-white/6">
            {rows.map((r) => {
              const rate = rpm(r.gross, r.miles)
              const loadedRate = rpm(r.gross, r.loaded)
              const tone =
                rate == null || fleetRpm == null
                  ? 'text-t1'
                  : rate >= fleetRpm * 1.05
                    ? 'text-good-400'
                    : rate <= fleetRpm * 0.95
                      ? 'text-bad-400'
                      : 'text-t1'
              return (
                <li key={r.truckId}>
                  <details className="group/drv">
                    <summary className="grid cursor-pointer list-none grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.03] @3xl:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] @3xl:items-center [&::-webkit-details-marker]:hidden">
                      <div className="col-span-2 flex min-w-0 items-center gap-2 @3xl:col-span-1">
                        <ChevronDown size={15} className="shrink-0 text-t3 transition-transform group-open/drv:rotate-180" />
                        <div className="min-w-0">
                          <div className="truncate text-md font-semibold text-t1">{r.label}</div>
                          <Trend points={trendOf(r.truckId)} min={trendMin} max={trendMax} chosen={chosen} locale={locale} />
                        </div>
                      </div>
                      {/* На узкой плитке сверху гросс и RPM — главное, мили и грузы под ними. */}
                      <Cell label={t(locale, 'drivers.col.loads')} value={String(r.loads.length)} className="@max-3xl:order-4" />
                      <Cell label={t(locale, 'drivers.col.gross')} value={usd.format(r.gross)} strong className="@max-3xl:order-1" />
                      <Cell
                        className="@max-3xl:order-3"
                        label={t(locale, 'drivers.col.miles')}
                        value={Math.round(r.miles).toLocaleString('en-US')}
                        sub={`${t(locale, 'drivers.loadedShort')} ${Math.round(r.loaded).toLocaleString('en-US')}`}
                      />
                      <Cell
                        className="@max-3xl:order-2"
                        label="Rate per mile"
                        value={rate != null ? usd2.format(rate) : '—'}
                        sub={loadedRate != null ? `${t(locale, 'drivers.loadedShort')} ${usd2.format(loadedRate)}` : undefined}
                        big
                        tone={tone}
                      />
                    </summary>
                    <ul className="flex flex-col gap-0.5 border-t border-white/6 bg-white/[0.015] px-2 py-2 @3xl:pl-10">
                      {r.loads
                        .sort((a, b) => (a.load.pickupDate ?? '').localeCompare(b.load.pickupDate ?? ''))
                        .map(({ load, miles }) => {
                          const lr = rpm(load.rate, miles)
                          return (
                            <li key={load.id}>
                              <Link
                                href={`/loads/${load.id}`}
                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 text-sm text-t2 transition-colors hover:bg-white/5 hover:text-t1"
                              >
                                <span className="min-w-0">
                                  <span className="text-t1">
                                    {load.origin ?? '—'} → {load.destination ?? '—'}
                                  </span>
                                  <span className="nums text-t3">
                                    {load.referenceId ? ` · #${load.referenceId}` : ''}
                                    {load.pickupDate ? ` · ${usDate(load.pickupDate)}` : ''}
                                  </span>
                                </span>
                                <span className="nums shrink-0 text-t2">
                                  {Math.round(miles)} mi · <b className="font-semibold text-t1">{usd.format(load.rate)}</b>
                                  {lr != null ? ` · ${usd2.format(lr)}/mi` : ''}
                                </span>
                              </Link>
                            </li>
                          )
                        })}
                    </ul>
                  </details>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`panel-inset px-3 py-2.5 ${accent ? 'ring-1 ring-haul-400/30 ring-inset' : ''}`}>
      <div className="text-2xs font-semibold tracking-wide text-t3 uppercase">{label}</div>
      <div className={`nums mt-1 text-xl font-bold ${accent ? 'text-haul-300' : 'text-t1'}`}>{value}</div>
    </div>
  )
}

/** Цифра строки водителя. На узкой плитке — с подписью над собой, на широкой подпись
 *  в шапке колонок, и здесь её нет. */
function Cell({
  label,
  value,
  sub,
  strong,
  big,
  tone = 'text-t1',
  className = '',
}: {
  className?: string
  label: string
  value: string
  sub?: string
  strong?: boolean
  big?: boolean
  tone?: string
}) {
  return (
    <div className={`min-w-0 @3xl:text-right ${className}`}>
      <div className="text-2xs font-semibold tracking-wide text-t3 uppercase @3xl:hidden">{label}</div>
      <div className={`nums ${big ? 'text-lg font-bold' : strong ? 'text-md font-semibold' : 'text-md'} ${tone}`}>{value}</div>
      {sub && <div className="nums text-xs text-t3">{sub}</div>}
    </div>
  )
}

/** RPM водителя за последние недели — столбиками; выбранная неделя подсвечена.
 *  Высота — от самого низкого RPM парка за эти недели до самого высокого, иначе
 *  $2.80 и $3.40 выглядели одинаковыми столбиками. Цифры — во всплывающей подсказке. */
function Trend({
  points,
  min,
  max,
  chosen,
  locale,
}: {
  points: { ms: number; rpm: number | null }[]
  min: number
  max: number
  chosen: number
  locale: Locale
}) {
  if (points.filter((p) => p.rpm != null).length < 2) return null
  const span = max - min || 1
  return (
    <div className="mt-1.5 flex h-5 items-end gap-[3px]">
      {points.map((p) => (
        <span
          key={p.ms}
          title={`${weekLabel(p.ms, locale)}: ${p.rpm != null ? `${usd2.format(p.rpm)}/mi` : '—'}`}
          className={`block w-2 rounded-[2px] ${p.ms === chosen ? 'bg-haul-400' : 'bg-white/25'}`}
          style={{ height: p.rpm != null ? `${5 + ((p.rpm - min) / span) * 15}px` : '2px' }}
        />
      ))}
    </div>
  )
}
