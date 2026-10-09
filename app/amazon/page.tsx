import { CalendarDays, DollarSign, Package, TrendingUp, Truck } from 'lucide-react'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { Stat } from '@/components/stat'
import { Cells, Spark } from '@/components/mini-charts'
import { Empty } from '@/components/empty'
import { PageHeader } from '@/components/page-header'
import { tileGrid } from '@/lib/tiles'
import { AMAZON_TILES } from '@/lib/tiles-core'
import { listTrucks } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { listAmazonTrips, type AmazonTrip } from '@/lib/amazon'
import { todayEt } from '@/lib/payments'
import { usd2, usDate, weekStartIso } from '@/lib/fmt'
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
  // Неделя — семь дней с пятницы. Рейсы следующей недели (Relay бронирует вперёд) в её
  // оплату не идут: до 10/09/26 верхней границы не было, и они прибавлялись к этой.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week, i))
  const weekTrips = live.filter((tr) => tr.startDate && tr.startDate >= week && tr.startDate <= weekDays[6])
  const weekPay = weekTrips.reduce((s, tr) => s + (tr.rate ?? 0), 0)
  const withMiles = weekTrips.filter((tr) => tr.rate != null && tr.miles)
  const weekMiles = withMiles.reduce((s, tr) => s + (tr.miles ?? 0), 0)
  const weekRpm = weekMiles ? withMiles.reduce((s, tr) => s + (tr.rate ?? 0), 0) / weekMiles : null
  // Те же деньги и RPM по дням — столбиками под цифрами; сегодняшний горит ярче.
  const dayPay = weekDays.map((d) => weekTrips.filter((tr) => tr.startDate === d).reduce((s, tr) => s + (tr.rate ?? 0), 0))
  const dayRpm = weekDays.map((d) => {
    const xs = withMiles.filter((tr) => tr.startDate === d)
    const mi = xs.reduce((s, tr) => s + (tr.miles ?? 0), 0)
    return mi ? xs.reduce((s, tr) => s + (tr.rate ?? 0), 0) / mi : null
  })
  const todayIdx = weekDays.indexOf(today)
  const todays = live.filter((x) => x.startDate === today)
  const inTransit = live.filter((x) => x.status === 'in_transit')

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
  // Клетки под «В пути»: траки с рейсами Amazon на доске, горят те, что едут сейчас.
  const amazonTrucks = new Set(board.filter((x) => x.status !== 'cancelled' && x.truckId != null).map((x) => x.truckId))
  const rollingTrucks = new Set(inTransit.filter((x) => x.truckId != null).map((x) => x.truckId))

  const tripLine = (x: AmazonTrip) =>
    [x.vrid, x.stops.map((s) => s.code ?? s.city).join(' → '), x.startDate ? usDate(x.startDate) : null]
      .filter(Boolean)
      .join(' · ')

  const icon = { size: 15, strokeWidth: 2.5 }
  const widgets: Widget[] = [
    // Под цифрой — картинка, как на «Грузах» и «Траках» (владелец, 10/09/26: «меньше
    // цифр и текста, больше визуала»). Что значат клетки и столбики — в ⓘ.
    {
      id: 'am-today',
      node: (
        <Stat
          compact
          surface="panel"
          accent="haul"
          icon={<CalendarDays {...icon} />}
          label={t(locale, 'amazon.tileToday')}
          value={String(todays.length)}
          info={t(locale, 'amazon.tileTodayInfo')}
        >
          {/* Клетка на рейс дня: доставленные, за ними едущие, пустые — ещё не выехали. */}
          <Cells
            total={todays.length}
            parts={[
              { n: todays.filter((x) => x.status === 'delivered').length, tone: 'good' },
              { n: todays.filter((x) => x.status === 'in_transit').length, tone: 'warn' },
            ]}
          />
        </Stat>
      ),
    },
    {
      id: 'am-transit',
      node: (
        <Stat
          compact
          surface="panel"
          accent={inTransit.length ? 'warn' : 'haul'}
          icon={<Truck {...icon} />}
          label={t(locale, 'amazon.tileTransit')}
          value={String(inTransit.length)}
          info={t(locale, 'amazon.tileTransitInfo')}
        >
          <Cells total={amazonTrucks.size} lit={rollingTrucks.size} tone="warn" />
        </Stat>
      ),
    },
    {
      id: 'am-week',
      node: (
        <Stat
          hero
          compact
          surface="panel"
          accent="good"
          icon={<DollarSign {...icon} />}
          label={t(locale, 'amazon.tileWeek')}
          value={usd.format(weekPay)}
          info={t(locale, 'amazon.tileWeekInfo')}
        >
          <Spark values={dayPay} tone="good" mark={todayIdx} />
        </Stat>
      ),
    },
    {
      id: 'am-rpm',
      node: (
        <Stat
          compact
          surface="panel"
          accent="haul"
          icon={<TrendingUp {...icon} />}
          label={t(locale, 'amazon.tileRpm')}
          value={weekRpm != null ? `${usd2.format(weekRpm)}/mi` : '—'}
          info={t(locale, 'amazon.tileRpmInfo')}
        >
          <Spark values={dayRpm} tone="haul" mark={todayIdx} />
        </Stat>
      ),
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
  ]
  const grid = await tileGrid('amazon', AMAZON_TILES, locale)

  return (
    <main className="page">
      <PageHeader
        title={t(locale, 'amazon.title')}
        info={t(locale, 'amazon.info')}
        subtitle={t(locale, 'amazon.subtitle')}
        // Уроки — для учеников: всегда под рукой в разделе, а не где-то на сайте курсов.
        // С 10/09/26 — окошком этой кнопки, а не плиткой внизу (план «Порядок в TMS»).
        actions={<AmazonLessons />}
      />
      <WidgetGrid {...grid} widgets={widgets} />
    </main>
  )
}
