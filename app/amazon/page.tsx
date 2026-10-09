import { Package } from 'lucide-react'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { CountTile } from '@/components/count-tile'
import { Empty } from '@/components/empty'
import { PageHeader } from '@/components/page-header'
import { tileGrid } from '@/lib/tiles'
import { AMAZON_TILES } from '@/lib/tiles-core'
import { listTrucks } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { listAmazonTrips, type AmazonTrip } from '@/lib/amazon'
import { todayEt } from '@/lib/payments'
import { usDate, weekStartIso } from '@/lib/fmt'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale } from '@/lib/i18n'
import { AmazonAdd } from './trip-form'
import { TripRow } from './trip-row'
import { AmazonLessons } from './lessons'

export const dynamic = 'force-dynamic'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** yyyy-mm-dd ± дни, арифметикой над датой — без часовых поясов. */
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function dayTitle(day: string | null, today: string, locale: Locale): string {
  if (!day) return t(locale, 'amazon.noDate')
  if (day === today) return t(locale, 'amazon.today')
  if (day === addDays(today, 1)) return t(locale, 'amazon.tomorrow')
  if (day === addDays(today, -1)) return t(locale, 'amazon.yesterday')
  const wd = new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' })
  return `${wd} ${usDate(day)}`
}

/**
 * «Amazon» — рейсы Amazon Relay (10/03/26). Свой раздел, а не фильтр грузов: у рейса
 * Amazon нет брокера и Rate Con, зато есть VRID, тур, коды складов и трейлер Amazon.
 * Рейс попадает сюда вставкой текста из Relay (lib/amazon-relay.ts разбирает).
 */
export default async function AmazonPage() {
  const locale = await getLocale()
  const companyId = await companyScope()
  const today = todayEt()
  const week = weekStartIso(today)
  // Неделя начинается с пятницы — берём от неё или неделю назад, что раньше: вчерашние
  // рейсы ещё нужны на доске, пока их не закрыли.
  const from = week < addDays(today, -7) ? week : addDays(today, -7)
  const [trips, trucks] = await Promise.all([listAmazonTrips(companyId, from), listTrucks(companyId)])

  const truckOpts = trucks.map((tr) => ({ id: tr.id, label: truckLabel(tr) }))
  const live = trips.filter((tr) => tr.status !== 'cancelled')
  const weekTrips = live.filter((tr) => tr.startDate && tr.startDate >= week)
  const weekPay = weekTrips.reduce((s, tr) => s + (tr.rate ?? 0), 0)
  const withMiles = weekTrips.filter((tr) => tr.rate != null && tr.miles)
  const weekMiles = withMiles.reduce((s, tr) => s + (tr.miles ?? 0), 0)
  const weekRpm = weekMiles ? withMiles.reduce((s, tr) => s + (tr.rate ?? 0), 0) / weekMiles : null

  // Доска: сначала сегодня и вперёд, потом прошедшие дни (свежие выше), без даты — в конце.
  // Доставленные и отменённые старше вчера с доски уходят: их место — в деньгах недели.
  const board = trips.filter(
    (tr) => tr.status === 'booked' || tr.status === 'in_transit' || !tr.startDate || tr.startDate >= addDays(today, -1),
  )
  const days = new Map<string | null, AmazonTrip[]>()
  for (const tr of board) {
    const k = tr.startDate
    days.set(k, [...(days.get(k) ?? []), tr])
  }
  const order = [...days.keys()].sort((a, b) => {
    if (a == null) return 1
    if (b == null) return -1
    const fa = a >= today
    const fb = b >= today
    if (fa !== fb) return fa ? -1 : 1
    return fa ? a.localeCompare(b) : b.localeCompare(a)
  })
  // Внутри дня — по туру, потом по времени первой остановки: этапы тура идут подряд.
  const sortDay = (list: AmazonTrip[]) =>
    [...list].sort(
      (a, b) =>
        (a.tourId ?? '~').localeCompare(b.tourId ?? '~') || (a.stops[0]?.time ?? '').localeCompare(b.stops[0]?.time ?? ''),
    )

  // Траки: что везёт сейчас и что дальше.
  const byTruck = trucks
    .map((tr) => {
      const mine = live.filter((x) => x.truckId === tr.id)
      const now = mine.find((x) => x.status === 'in_transit') ?? null
      const next =
        mine
          .filter((x) => x.status === 'booked' && x !== now)
          .sort((a, b) => (a.startDate ?? '9').localeCompare(b.startDate ?? '9'))[0] ?? null
      return { truck: tr, now, next }
    })
    .filter((r) => r.now || r.next)

  const tripLine = (x: AmazonTrip) =>
    [x.vrid, x.stops.map((s) => s.code ?? s.city).join(' → '), x.startDate ? usDate(x.startDate) : null]
      .filter(Boolean)
      .join(' · ')

  const widgets: Widget[] = [
    { id: 'am-today', node: <CountTile value={live.filter((x) => x.startDate === today).length} label={t(locale, 'amazon.tileToday')} /> },
    { id: 'am-transit', node: <CountTile value={live.filter((x) => x.status === 'in_transit').length} label={t(locale, 'amazon.tileTransit')} tone="warn" /> },
    { id: 'am-week', node: <CountTile value={weekPay ? usd.format(weekPay) : 0} label={t(locale, 'amazon.tileWeek')} info={t(locale, 'amazon.tileWeekInfo')} tone="good" /> },
    {
      id: 'am-rpm',
      node: <CountTile value={weekRpm != null ? `$${weekRpm.toFixed(2)}` : 0} label={t(locale, 'amazon.tileRpm')} info={t(locale, 'amazon.tileRpmInfo')} />,
    },
    { id: 'am-add', node: <div><AmazonAdd trucks={truckOpts} today={today} /></div> },
    {
      id: 'am-board',
      node: (
        <div className="panel p-4">
          <h2 className="mb-3 text-base font-bold text-t1">{t(locale, 'amazon.board')}</h2>
          {order.length === 0 ? (
            <Empty icon={Package} title={t(locale, 'amazon.empty')} text={t(locale, 'amazon.emptyText')} compact />
          ) : (
            <div className="flex flex-col gap-4">
              {order.map((day) => (
                <section key={day ?? 'none'}>
                  <h3 className="mb-1.5 text-sm font-semibold text-t2">
                    {dayTitle(day, today, locale)} <span className="font-normal text-t3">· {days.get(day)!.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {sortDay(days.get(day)!).map((x) => (
                      <TripRow key={x.id} trip={x} trucks={truckOpts} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'am-trucks',
      node: (
        <div className="panel p-4">
          <h2 className="mb-3 text-base font-bold text-t1">{t(locale, 'amazon.trucksTitle')}</h2>
          {byTruck.length === 0 ? (
            <p className="text-sm text-t3">{t(locale, 'amazon.trucksEmpty')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {byTruck.map(({ truck, now, next }) => {
                const trailer = (now ?? next)?.trailerNo
                return (
                  <li key={truck.id} className="panel-inset rounded-xl p-3 text-sm">
                    <div className="font-semibold text-t1">{truckLabel(truck, trailer)}</div>
                    {now && (
                      <div className="mt-1 text-t2">
                        <span className="text-warn-400">{t(locale, 'amazon.truckNow')}:</span> {tripLine(now)}
                      </div>
                    )}
                    {next && (
                      <div className="mt-0.5 text-t2">
                        <span className="text-t3">{t(locale, 'amazon.truckNext')}:</span> {tripLine(next)}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ),
    },
    // Уроки — для учеников: всегда в разделе, а не где-то на сайте курсов.
    { id: 'am-lessons', node: <div><AmazonLessons locale={locale} /></div> },
  ]
  const grid = await tileGrid('amazon', AMAZON_TILES, locale)

  return (
    <main className="page">
      <PageHeader
        title={t(locale, 'amazon.title')}
        info={t(locale, 'amazon.info')}
        subtitle={t(locale, 'amazon.subtitle')}
        actions={
          // Ссылка к урокам сверху: плитку уроков можно утащить вниз, а найти её надо сразу.
          <a
            href="#amazon-lessons"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/12 px-3 text-sm font-semibold text-haul-300 hover:border-haul-500/50"
          >
            📚 {t(locale, 'amazon.lessonsShort')}
          </a>
        }
      />
      <WidgetGrid {...grid} widgets={widgets} />
    </main>
  )
}
