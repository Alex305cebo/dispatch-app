'use client'

// Три вида «Грузов» — По водителю / По статусу / Календарь — и всё, что они рисуют.
//
// Живут на клиенте не ради моды. Раньше вкладки были ссылками с ?view=, а стрелки
// календаря — ссылками с ?week=/?day=, то есть каждый клик был переходом по маршруту:
// страница пересобиралась на сервере целиком и мигала скелетом. При этом ни один из
// трёх видов и ни одна неделя не требуют новых данных — все они рисуются из ОДНОЙ
// выборки грузов, которая уже пришла. Перенос выбора вида в состояние убирает переход
// совсем, а не делает его аккуратнее.
//
// ?view=/?week=/?day= по-прежнему задают начальное состояние, поэтому старые ссылки
// и закладки продолжают открываться там, где ожидалось.

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, PackageOpen, Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { ShowMore } from '@/components/collapse'
import { Empty } from '@/components/empty'
import { truckLabel, STATUSES, type TruckRecord, type LoadRecord } from '@/lib/map'
import { calcLoad, type Breakdown } from '@/lib/profit'
import { usd, usd2, weekAnchorOf, weekLabel, weekStart } from '@/lib/fmt'
import { StatusBadge, statusLabel } from '@/components/status'
import { LoadsToolbar, useLoadsFilter, type LoadMetrics, activeRank } from '@/components/loads-toolbar'
import { RateConButton } from '@/components/ratecon-button'
import { DeleteButton } from '@/components/delete-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { deleteLoad } from '@/app/actions'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'

// Тот же ряд оттенков, что у STATUS_STYLE (components/status.tsx) — акцент колонки,
// а не вторая цветовая схема, чтобы доска и бейджи не разъезжались.
const COLUMN_ACCENT: Record<LoadRecord['status'], string> = {
  quoted: 'border-t-white/20',
  booked: 'border-t-cyan-400/60',
  in_transit: 'border-t-amber-400/60',
  delivered: 'border-t-fuchsia-400/60',
  paid: 'border-t-good-500/60',
  cancelled: 'border-t-bad-500/50',
}

export function LoadsViews({
  loads: allLoads,
  trucks,
  rateConPairs,
  photoTruckIds,
  initialView,
  initialWeek,
  initialDay,
  initialQuery,
  metrics,
}: {
  loads: LoadRecord[]
  trucks: TruckRecord[]
  /** id груза → чистая, ставка-миля, есть ли POD. Считает страница. */
  metrics: Record<number, LoadMetrics>
  /** Map не переживает границу сервер-клиент как есть — передаём парами. */
  rateConPairs: [number, number][]
  photoTruckIds: number[]
  initialView: 'driver' | 'board' | 'calendar'
  initialWeek: number
  initialDay: string | null
  /** Поиск, пришедший в адресе (?q=) — по нему открываются ссылки из свода
   * направлений. Без этого клик по строке приводил бы к полному списку. */
  initialQuery: string
}) {
  const locale = useLocale()
  // Поиск и фильтры стоят НАД видами и общие для всех трёх: искать груз, а потом
  // гадать, в какой из вкладок он теперь виден, — это не поиск.
  const { query, setQuery, filter, setFilter, sort, setSort, result: loads } = useLoadsFilter(
    allLoads,
    trucks,
    metrics,
    initialQuery,
  )
  const [view, setView] = useState(initialView)
  const [weekMonday, setWeekMonday] = useState(initialWeek)
  const [selectedDay, setSelectedDay] = useState(initialDay)

  const rateCons = new Map(rateConPairs)
  const photoIds = new Set(photoTruckIds)
  const byId = new Map<number, TruckRecord>(trucks.map((tr) => [tr.id, tr]))
  const fallback = trucks[0]

  const byTruck = new Map<number, LoadRecord[]>()
  for (const l of loads) {
    const truck = (l.truckId !== null ? byId.get(l.truckId) : undefined) ?? fallback
    if (!truck) continue
    if (!byTruck.has(truck.id)) byTruck.set(truck.id, [])
    byTruck.get(truck.id)!.push(l)
  }
  // Траки с активным грузом — первыми: в пути, потом забукированные, потом те, у
  // кого сейчас ничего нет.
  const groups = trucks
    .map((truck) => ({ truck, loads: byTruck.get(truck.id) ?? [] }))
    .filter((g) => g.loads.length > 0)
    .sort((a, b) => Math.min(...a.loads.map((l) => activeRank(l.status))) - Math.min(...b.loads.map((l) => activeRank(l.status))))

  if (allLoads.length === 0) {
    return (
      <Empty
        icon={PackageOpen}
        title={t(locale, 'loads.page.emptyTitle')}
        text={t(locale, 'loads.page.emptyText')}
        action={{
          href: '/loads/new',
          label: t(locale, 'loads.page.new'),
          icon: <Plus size={14} strokeWidth={2.5} />,
        }}
      />
    )
  }

  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
      active ? 'border-haul-500 text-white' : 'border-transparent text-white/55 hover:text-white/85'
    }`

  return (
    <>
      <div className="mb-5 flex gap-1.5 border-b border-white/8">
        <button type="button" onClick={() => setView('driver')} className={tabClass(view === 'driver')}>
          {t(locale, 'loads.page.tabByDriver')}
        </button>
        <button type="button" onClick={() => setView('board')} className={tabClass(view === 'board')}>
          {t(locale, 'loads.page.tabByStatus')}
        </button>
        <button type="button" onClick={() => setView('calendar')} className={tabClass(view === 'calendar')}>
          {t(locale, 'loads.page.tabCalendar')}
        </button>
      </div>

      {/* Панель поиска и фильтров — под вкладками, над содержимым: она общая для всех
          трёх видов, и её место там, где начинается содержимое. */}
      <LoadsToolbar
        query={query}
        setQuery={setQuery}
        filter={filter}
        setFilter={setFilter}
        sort={sort}
        setSort={setSort}
        shown={loads.length}
        total={allLoads.length}
        rows={loads}
        trucks={trucks}
        metrics={metrics}
      />

      {loads.length === 0 && (
        <p className="panel p-4 text-center text-[13px] text-white/55">
          {t(locale, 'loads.filter.nothingFound')}
        </p>
      )}

      {view === 'board' ? (
        <StatusBoard loads={loads} byId={byId} fallback={fallback} rateCons={rateCons} locale={locale} />
      ) : view === 'calendar' ? (
        <Calendar
          loads={loads}
          weekMonday={weekMonday}
          selectedDay={selectedDay}
          byId={byId}
          fallback={fallback}
          rateCons={rateCons}
          locale={locale}
          onWeek={setWeekMonday}
          onDay={setSelectedDay}
        />
      ) : (
        <div className="stagger flex flex-col gap-3">
          {groups.map(({ truck, loads: ls }) => (
            <DriverGroup
              key={truck.id}
              truck={truck}
              loads={ls}
              rateCons={rateCons}
              hasPhoto={photoIds.has(truck.id)}
              locale={locale}
            />
          ))}
        </div>
      )}
    </>
  )
}

function StatusBoard({
  loads,
  byId,
  fallback,
  rateCons,
  locale,
}: {
  loads: LoadRecord[]
  byId: Map<number, TruckRecord>
  fallback: TruckRecord | undefined
  rateCons: Map<number, number>
  locale: Locale
}) {
  const columns = STATUSES.map((status) => ({
    status,
    loads: loads.filter((l) => l.status === status),
  })).filter((c) => c.loads.length > 0)

  return (
    /* Third column only at 2xl (1536px). At `lg` a 1280px laptop was splitting the
       board into three ~230px columns, which is narrower than a US city pair needs
       ("Phoenix, AZ → Los Angeles, CA") — so every card truncated to earn a column
       nobody could read. Two roomy columns beat three cramped ones. */
    <div className="stagger grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {columns.map(({ status, loads }) => (
        <section
          key={status}
          className={`panel border-t-2 p-3 ${COLUMN_ACCENT[status]}`}
        >
          {/* Count AND money in the header. A column that says only "37" tells the
              dispatcher how much work is in it but nothing about what it's worth,
              which is the number they actually compare columns on. */}
          <h2 className="mb-2 flex items-center justify-between gap-2 text-base leading-6 font-semibold text-white/90">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{statusLabel(locale, status)}</span>
              <span className="nums shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 font-bold text-white/70">
                {loads.length}
              </span>
            </span>
            <span className="nums shrink-0 text-base font-bold text-white/85">
              {usd.format(loads.reduce((s, l) => s + l.rate, 0))}
            </span>
          </h2>
          <div className="flex flex-col gap-1.5">
            {/* Long columns were the complaint: a single status could run to dozens of
                rows and push everything below it off the screen. Six is roughly what
                fits beside its neighbours before the grid stops reading as columns. */}
            <ShowMore limit={6} label={t(locale, 'loads.page.showMore')} items={loads.map((load) => {
              const truck = (load.truckId !== null ? byId.get(load.truckId) : undefined) ?? fallback
              const r = truck ? calcLoad(load, truck) : null
              return (
                /* Stacked, not side-by-side. Three columns on a laptop leave each card
                   ~230px, and the old row put the route, the driver, the rate and the
                   RC button in ONE horizontal line — measured: "Phoenix, AZ → Los
                   Angeles, CA" losing 103px and every driver line losing 120-130px to
                   the ellipsis. Giving the route the full width and dropping the meta
                   underneath costs one extra line and truncates nothing. */
                <div key={load.id} className="rounded-lg border border-white/6 p-2.5">
                  <div className="flex items-start gap-2">
                    <Link href={`/loads/${load.id}`} className="min-w-0 flex-1">
                      <div className="truncate text-base font-medium">
                        {load.origin ?? '—'} → {load.destination ?? '—'}
                      </div>
                    </Link>
                    {rateCons.get(load.id) && (
                      <span className="-mt-0.5 shrink-0">
                        <RateConButton docId={rateCons.get(load.id)!} compact />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    {/* Truck NUMBER only, not truckLabel's "number · driver". In a
                        230px column the driver's name pushed this line 110px past its
                        box on every card; the number is what identifies a truck on a
                        board about loads, and the driver is one click away. */}
                    <span className="min-w-0 truncate text-xs text-white/55">
                      {truck ? (truck.number?.trim() || truck.name) : '—'}
                    </span>
                    <span className="shrink-0 whitespace-nowrap">
                      <span className="nums text-base font-bold">{usd.format(load.rate)}</span>
                      {load.loadedMiles > 0 && (
                        <span className="nums ml-1.5 text-2xs font-medium text-haul-300">
                          {Math.round(load.loadedMiles).toLocaleString('en-US')} mi
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )
            })} />
          </div>
        </section>
      ))}
    </div>
  )
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_KEYS = [
  'loads.page.weekdayMon',
  'loads.page.weekdayTue',
  'loads.page.weekdayWed',
  'loads.page.weekdayThu',
  'loads.page.weekdayFri',
  'loads.page.weekdaySat',
  'loads.page.weekdaySun',
] as const

/** ISO date (YYYY-MM-DD, local) — the calendar buckets by calendar day, not by
 * timestamp, so this must never go through toISOString() (UTC) or a load booked
 * late at night can land on the wrong day's column. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** History of every load (any status, including cancelled — this is a record, not
 * a work queue), one week at a time. Pickup date is the natural anchor — "what's
 * moving this day" — falling back to when the load was entered for anything the
 * rate con never printed a pickup date for, so nothing silently vanishes from the
 * calendar entirely.
 *
 * Layout is a day STRIP + a detail pane, not seven cramped columns: a week of
 * full load cards never fit 7-abreast (routes truncated to "Atl…"), so the days
 * themselves are big tappable tiles (with a load-count badge) and the selected
 * day's loads render below at full size — same card language as the Обзор list. */
/** Доска недели: строка — трак, столбцы — дни, груз — полоса от погрузки до
 * выгрузки. Отвечает на «кто где когда» одним взглядом: свободные дни видны как
 * пустые клетки, конфликты — как две полосы в одной строке. Полоса ведёт на груз.
 * На телефоне доска едет вбок, колонка с траками прибита слева. */
function Calendar({
  loads,
  weekMonday,
  byId,
  rateCons,
  locale,
  onWeek,
}: {
  loads: LoadRecord[]
  weekMonday: number
  selectedDay: string | null
  byId: Map<number, TruckRecord>
  fallback: TruckRecord | undefined
  rateCons: Map<number, number>
  locale: Locale
  onWeek: (mondayMs: number) => void
  onDay: (iso: string | null) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekMonday + i * DAY_MS))
  const weekIsos = days.map(isoDate)
  const todayIso = isoDate(new Date())
  const weekEnd = weekIsos[6]!
  const weekBegin = weekIsos[0]!
  const isCurrentWeek = weekMonday === weekStart()

  // Полоса груза: от погрузки до выгрузки (без выгрузки — один день), обрезанная
  // границами недели. Грузы целиком вне недели не рисуются.
  type Bar = { load: LoadRecord; from: number; to: number; lane: number }
  const barsByTruck = new Map<number | null, Bar[]>()
  for (const l of loads) {
    if (l.status === 'cancelled') continue
    const a = l.pickupDate ?? l.createdAt.slice(0, 10)
    const b = l.deliveryDate && l.deliveryDate >= a ? l.deliveryDate : a
    if (b < weekBegin || a > weekEnd) continue
    const from = Math.max(0, weekIsos.indexOf(a < weekBegin ? weekBegin : a))
    const to = Math.min(6, weekIsos.indexOf(b > weekEnd ? weekEnd : b))
    const key = l.truckId !== null && byId.has(l.truckId) ? l.truckId : null
    if (!barsByTruck.has(key)) barsByTruck.set(key, [])
    barsByTruck.get(key)!.push({ load: l, from, to, lane: 0 })
  }
  // Пересекающиеся полосы одного трака — на разные дорожки, а не друг на друга.
  for (const bars of barsByTruck.values()) {
    bars.sort((x, y) => x.from - y.from || x.to - y.to)
    const laneEnd: number[] = []
    for (const bar of bars) {
      let lane = laneEnd.findIndex((e) => e < bar.from)
      if (lane < 0) lane = laneEnd.length
      laneEnd[lane] = bar.to
      bar.lane = lane
    }
  }

  const trucks = [...byId.values()].sort((a, b) => (a.number ?? a.name).localeCompare(b.number ?? b.name))
  const rows: { key: string; label: string; sub: string | null; href: string | null; bars: Bar[] }[] = trucks.map((tr) => ({
    key: String(tr.id),
    label: tr.number?.trim() || tr.name,
    sub: tr.driverName,
    href: `/trucks/${tr.id}`,
    bars: barsByTruck.get(tr.id) ?? [],
  }))
  const orphan = barsByTruck.get(null) ?? []
  if (orphan.length) rows.push({ key: 'none', label: t(locale, 'loads.board.noTruck'), sub: null, href: null, bars: orphan })

  const weekGross = [...barsByTruck.values()].flat().reduce((s, b) => s + b.load.rate, 0)
  const weekCount = [...barsByTruck.values()].flat().length

  const TONE: Record<string, string> = {
    quoted: 'border-white/15 bg-white/[0.06] text-white/70',
    booked: 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200',
    in_transit: 'border-amber-400/40 bg-amber-400/15 text-amber-200',
    delivered: 'border-fuchsia-400/40 bg-fuchsia-400/15 text-fuchsia-200',
    paid: 'border-good-400/40 bg-good-400/15 text-good-400',
    cancelled: 'border-bad-400/30 bg-bad-400/10 text-bad-400',
  }
  const city = (x: string | null) => (x ?? '—').replace(/,.*$/, '')

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onWeek(weekMonday - 7 * DAY_MS)}
          className="inline-flex min-h-9 items-center rounded-xl border border-white/10 px-3.5 text-[12px] font-semibold text-white/75 transition-colors hover:border-white/25 hover:bg-white/5 max-md:min-h-11"
        >
          {t(locale, 'loads.page.prevWeek')}
        </button>
        <span className="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <span className="flex items-center gap-2 text-[13.5px] font-semibold capitalize text-white/90">
            {weekLabel(weekMonday, locale)}
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => onWeek(weekStart())}
                className="rounded-full bg-haul-500/15 px-2 py-0.5 text-[11px] font-semibold normal-case text-haul-400 transition-colors hover:bg-haul-500/25"
              >
                {t(locale, 'loads.page.today')}
              </button>
            )}
          </span>
          {weekCount > 0 && (
            <span className="nums text-[12px] text-white/55">
              {t(locale, 'loads.page.countLoads').replace('{n}', String(weekCount))} ·{' '}
              <span className="font-semibold text-white/85">{usd.format(weekGross)}</span>
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onWeek(weekMonday + 7 * DAY_MS)}
          className="inline-flex min-h-9 items-center rounded-xl border border-white/10 px-3.5 text-[12px] font-semibold text-white/75 transition-colors hover:border-white/25 hover:bg-white/5 max-md:min-h-11"
        >
          {t(locale, 'loads.page.nextWeek')}
        </button>
      </div>

      {weekCount === 0 ? (
        <Empty icon={CalendarDays} title={t(locale, 'loads.page.emptyDayTitle')} text={t(locale, 'loads.board.emptyWeek')} />
      ) : (
        <div className="panel overflow-x-auto p-0">
          <div className="min-w-[640px]">
            {/* Шапка дней */}
            <div className="grid grid-cols-[132px_repeat(7,minmax(0,1fr))] border-b border-white/8">
              <div className="sticky left-0 z-10 bg-ink-900 px-3 py-2 text-[11px] font-medium text-white/45">
                {t(locale, 'loads.board.truck')}
              </div>
              {days.map((d, i) => {
                const isToday = weekIsos[i] === todayIso
                return (
                  <div
                    key={weekIsos[i]}
                    className={`flex items-baseline justify-center gap-1 px-1 py-2 text-center ${isToday ? 'bg-haul-500/10' : ''}`}
                  >
                    <span className={`text-[11px] font-medium ${isToday ? 'text-haul-300' : 'text-white/45'}`}>
                      {t(locale, WEEKDAY_KEYS[i]!)}
                    </span>
                    <span className={`nums text-[13px] font-semibold ${isToday ? 'text-haul-300' : 'text-white/80'}`}>
                      {d.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>

            {rows.map((row) => {
              const lanes = Math.max(1, ...row.bars.map((b) => b.lane + 1))
              return (
                <div
                  key={row.key}
                  className="grid grid-cols-[132px_repeat(7,minmax(0,1fr))] border-b border-white/[0.06] last:border-b-0"
                >
                  <div className="sticky left-0 z-10 flex min-w-0 flex-col justify-center bg-ink-900 px-3 py-2">
                    {row.href ? (
                      <Link href={row.href} className="nums truncate text-[13px] font-semibold hover:text-haul-400">
                        {row.label}
                      </Link>
                    ) : (
                      <span className="truncate text-[13px] font-semibold text-white/70">{row.label}</span>
                    )}
                    {row.sub && <span className="truncate text-[11px] text-white/50">{row.sub}</span>}
                  </div>
                  <div
                    className="relative col-span-7 grid grid-cols-7 gap-y-1 py-1.5"
                    style={{ gridTemplateRows: `repeat(${lanes}, minmax(1.75rem, auto))` }}
                  >
                    {/* Фон дней: сегодня подсвечен, остальные — тонкие разделители */}
                    {weekIsos.map((iso, i) => (
                      <div
                        key={iso}
                        aria-hidden
                        className={`pointer-events-none border-l border-white/[0.05] first:border-l-0 ${iso === todayIso ? 'bg-haul-500/[0.06]' : ''}`}
                        style={{ gridColumn: i + 1, gridRow: `1 / span ${lanes}` }}
                      />
                    ))}
                    {row.bars.length === 0 && (
                      <span
                        className="self-center px-2 text-[11px] text-white/30"
                        style={{ gridColumn: '1 / span 7', gridRow: 1 }}
                      >
                        {t(locale, 'loads.board.free')}
                      </span>
                    )}
                    {row.bars.map((b) => {
                      const rcId = rateCons.get(b.load.id)
                      return (
                        <Link
                          key={b.load.id}
                          href={`/loads/${b.load.id}`}
                          title={`${b.load.origin ?? '—'} → ${b.load.destination ?? '—'} · ${usd.format(b.load.rate)} · ${statusLabel(locale, b.load.status)}${rcId ? ' · RC' : ''}`}
                          className={`z-[1] mx-0.5 flex min-w-0 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium transition-colors hover:brightness-125 ${TONE[b.load.status] ?? TONE.quoted}`}
                          style={{ gridColumn: `${b.from + 1} / span ${b.to - b.from + 1}`, gridRow: b.lane + 1 }}
                        >
                          <span className="truncate">
                            {city(b.load.origin)} → {city(b.load.destination)}
                          </span>
                          <span className="nums ml-auto shrink-0 opacity-80">{usd.format(b.load.rate)}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-white/45">{t(locale, 'loads.board.hint')}</p>
    </div>
  )
}

function DriverGroup({
  truck,
  loads,
  rateCons,
  hasPhoto,
  locale,
}: {
  truck: TruckRecord
  loads: LoadRecord[]
  rateCons: Map<number, number>
  hasPhoto: boolean
  locale: Locale
}) {
  // The load that matters right now: in transit beats booked beats everything else;
  // with none active, the newest load (loads is already newest-first) stands in for
  // "last load" — either way, one load is always featured, the rest fold away.
  const active = loads.find((l) => l.status === 'in_transit') ?? loads.find((l) => l.status === 'booked')
  const featured = active ?? loads[0]!
  const rest = loads.filter((l) => l.id !== featured.id)

  // The header used to carry a name and a count and nothing else, across the full
  // width of the card — a lot of empty space for two short facts. What the money adds
  // is the answer to "is this driver worth what he's running", which is the question
  // the count alone raises and never answers.
  const total = loads.reduce((s, l) => (l.status === 'cancelled' ? s : s + l.rate), 0)

  return (
    <section className="panel p-3">
      <Link
        href={`/trucks/${truck.id}`}
        className="mb-2 flex items-center gap-2.5 transition-colors hover:text-haul-400"
      >
        <DriverAvatar truckId={truck.id} name={truck.driverName} hasPhoto={hasPhoto} size={30} />
        <span className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-snug sm:text-[14px]">
          {truckLabel(truck)}
        </span>
        <span className="nums shrink-0 text-[12px] font-semibold text-white/75">{usd.format(total)}</span>
        {/* The count is the first thing to go on a narrow phone: it's the least of the
            three facts here, and keeping it would cost the driver's own name letters. */}
        <span className="hidden shrink-0 text-[11px] font-normal text-white/40 min-[380px]:inline">
          {t(locale, 'loads.page.countLoads').replace('{n}', String(loads.length))}
        </span>
      </Link>

      <LoadRow load={featured} truck={truck} rcId={rateCons.get(featured.id)} locale={locale} />

      {rest.length > 0 && (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-[12px] font-medium text-white/55 transition-colors hover:text-white">
            <span className="text-white/40 transition-transform group-open:rotate-90">▸</span>
            {t(locale, 'loads.page.moreLoads').replace('{n}', String(rest.length))}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {rest.map((l) => (
              <LoadRow key={l.id} load={l} truck={truck} rcId={rateCons.get(l.id)} locale={locale} />
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function LoadRow({
  load,
  truck,
  rcId,
  locale,
}: {
  load: LoadRecord
  truck: TruckRecord
  rcId: number | undefined
  locale: Locale
}) {
  // Each load costs against its OWN truck. Money lives in calcLoad, not SQL.
  const r: Breakdown = calcLoad(load, truck)
  return (
    // Row is a flex container, not one big <Link>: the rate con button must
    // be a sibling of the link, never nested inside it.
    // Padding and type both a step down from before: one row of text was sitting in a
    // card tall enough for three, which is what made the list read as mostly air.
    // Nothing was dropped to get there — every figure that was here still is.
    <div className="flex items-center gap-2 rounded-xl border border-white/6 px-3 py-2 transition-colors hover:border-white/15">
      {/* Stacked on a phone, one row from `sm` up. Side by side at 375px the route had
          to share ~270px with the status badge AND the rate, so "Kansas City, MO →
          Chicago, IL" clipped to a few letters — and the city pair is the one thing on
          this row that must never be cut. Stacked, it gets the full width and the money
          moves onto the line below, beside the figures it belongs with. */}
      <Link
        href={`/loads/${load.id}`}
        className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3"
      >
        <div className="min-w-0 flex-1">
          {/* На телефоне статус переносится ПОД маршрут, к милям: рядом с ним города
              резались до «Atlanta, GA → Pho…», а именно они тут главное. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 basis-full truncate text-[13.5px] font-medium sm:basis-auto">
              {load.origin ?? '—'} → {load.destination ?? '—'}
            </span>
            <StatusBadge status={load.status} locale={locale} />
            <span className="nums text-[11.5px] text-white/60">
              {Math.round(r.totalMiles)} mi · {usd2.format(r.allInRpm)}/mi
            </span>
          </div>
        </div>
        {/* Inline pair on the phone (rate then loaded miles, reading left to right),
            stacked block on the right from `sm` up. */}
        <div className="flex shrink-0 items-baseline gap-2 sm:block sm:text-right">
          <div className="nums text-[15px] font-bold leading-tight">{usd.format(load.rate)}</div>
          {load.loadedMiles > 0 && (
            <div className="nums text-[11px] font-medium text-haul-300">
              {Math.round(load.loadedMiles).toLocaleString('en-US')} mi
            </div>
          )}
        </div>
      </Link>
      {rcId && <RateConButton docId={rcId} compact />}
      <DeleteButton
        action={deleteLoad}
        id={load.id}
        title={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
        note={t(locale, 'loads.page.deleteNote')}
      />
    </div>
  )
}

