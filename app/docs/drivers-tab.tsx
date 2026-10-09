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

import { Download } from 'lucide-react'
import { listLoads, listTrucks, loadPapers } from '@/lib/loads'
import { usd, usd2, loadWeekAnchorMs, weekAnchorOf, weekLabel, weekStart, usDate } from '@/lib/fmt'
import { truckLabel, type LoadRecord, type TruckRecord } from '@/lib/map'
import { t, type Locale } from '@/lib/i18n'
import { Info } from '@/components/info'
import {
  Cell,
  Figure,
  LoadLine,
  NameCell,
  ROW5,
  RowDetails,
  Summary,
  TableHead,
  Trend,
  WeekChips,
  pickWeeks,
  rpmOf as rpm,
  rpmTone,
} from './money-ui'
import type { CompanyId } from '@/lib/company'

type LoadLineData = { load: LoadRecord; miles: number }
type DriverRow = {
  truckId: number
  label: string
  loads: LoadLineData[]
  gross: number
  miles: number
  loaded: number
}

/** Недель в мини-графике RPM. */
const TREND_WEEKS = 6

export async function ByDriver({
  companyId,
  locale,
  week: weekParam,
}: {
  companyId: CompanyId
  locale: Locale
  /** ?week=yyyy-mm-dd — пятница выбранной недели; нет — текущая. */
  week?: string
}) {
  const [loads, trucks, { rateCons }] = await Promise.all([listLoads(companyId), listTrucks(companyId), loadPapers(companyId)])
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
  const { list: weekList, chosen } = pickWeeks(weeks.keys(), current, weekParam)

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
      <WeekChips
        tab="drivers"
        weeks={weekList}
        chosen={chosen}
        current={current}
        currentLabel={t(locale, 'drivers.week.current')}
        locale={locale}
      />

      {/* Итог недели по всему парку: с ним сравнивается каждый водитель ниже. */}
      <Summary
        title={<span className="capitalize">{weekLabel(chosen, locale)}</span>}
        note={
          <>
            {t(locale, 'finances.payWeekNote')}
            <Info text={t(locale, 'drivers.rpmInfo')} />
          </>
        }
        footer={
          total.loads > 0 && (
            <a
              href={`/api/export/week?start=${chosen}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm font-medium text-t2 transition-colors hover:border-white/30 hover:text-t1 max-md:min-h-10"
            >
              <Download size={14} strokeWidth={2.5} />
              {t(locale, 'drivers.csv')}
            </a>
          )
        }
      >
        <Figure label={t(locale, 'drivers.col.gross')} value={usd.format(total.gross)} />
        <Figure label={t(locale, 'drivers.col.miles')} value={Math.round(total.miles).toLocaleString('en-US')} />
        <Figure label={t(locale, 'drivers.fleetRpm')} value={fleetRpm != null ? usd2.format(fleetRpm) : '—'} accent />
        <Figure label={t(locale, 'drivers.col.loads')} value={String(total.loads)} />
      </Summary>

      {rows.length === 0 ? (
        <p className="panel p-6 text-center text-base text-t3">{t(locale, 'drivers.empty')}</p>
      ) : (
        <section className="panel overflow-hidden">
          <TableHead
            grid={ROW5}
            cols={[
              t(locale, 'drivers.col.driver'),
              t(locale, 'drivers.col.loads'),
              t(locale, 'drivers.col.gross'),
              t(locale, 'drivers.col.miles'),
              'Rate per mile',
            ]}
          />
          <ul className="divide-y divide-white/6">
            {rows.map((r) => {
              const rate = rpm(r.gross, r.miles)
              const loadedRate = rpm(r.gross, r.loaded)
              return (
                <li key={r.truckId}>
                  <RowDetails
                    grid={ROW5}
                    head={
                      <>
                        <NameCell
                          title={r.label}
                          under={<Trend points={trendOf(r.truckId)} min={trendMin} max={trendMax} chosen={chosen} locale={locale} />}
                        />
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
                          tone={rpmTone(rate, fleetRpm)}
                        />
                      </>
                    }
                  >
                    <ul className="flex flex-col gap-0.5">
                      {r.loads
                        .sort((a, b) => (a.load.pickupDate ?? '').localeCompare(b.load.pickupDate ?? ''))
                        .map(({ load, miles }) => (
                          <li key={load.id}>
                            <LoadLine
                              href={`/loads/${load.id}`}
                              route={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
                              meta={`${load.referenceId ? ` · #${load.referenceId}` : ''}${load.pickupDate ? ` · ${usDate(load.pickupDate)}` : ''}`}
                              miles={miles}
                              amount={usd.format(load.rate)}
                              rpm={rpm(load.rate, miles)}
                              rcId={rateCons.get(load.id)}
                            />
                          </li>
                        ))}
                    </ul>
                  </RowDetails>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
