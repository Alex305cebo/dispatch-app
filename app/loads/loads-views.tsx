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

import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, PackageOpen, Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { ShowMore } from '@/components/collapse'
import { Empty } from '@/components/empty'
import { NoBreakWords } from '@/components/ui'
import {
  STATUSES,
  truckLabel,
  currentLoadsByTruck,
  nextLoadsByTruck,
  activeLoadsByTruck,
  type TruckRecord,
  type LoadRecord,
} from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { marketVerdict, pctText } from '@/lib/dat-market-core'
import { driveTime, usd, usd2, usDate, weekLabel } from '@/lib/fmt'
import { scheduleConnection, shiftDay, stopOrder, weekStartIso, whenText, type Connection } from '@/lib/loads-dashboard'
import { todayEt } from '@/lib/payments'
import { StatusBadge, statusLabel } from '@/components/status'
import { DeadheadFlag } from '@/components/deadhead-flag'
import { PriorityChip } from '@/components/priority-picker'
import { LoadsToolbar, useLoadsFilter, type LoadMetrics, activeRank } from '@/components/loads-toolbar'
import { RateConButton } from '@/components/ratecon-button'
import { DeleteButton } from '@/components/delete-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { deleteLoad } from '@/app/actions'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { CountTile, loadsKpiTiles, LoadsWeekChart, LoadsAttention, weekdayLabel, type AttentionEntry, type Selection } from './loads-insights'
import { WidgetGrid, type TileGridProps, type Widget } from '@/components/widget-grid'

// Метрики груза (чистая, ставка-миля, RC/POD, ближайшая остановка) считает страница;
// строкам они нужны глубоко в дереве, поэтому идут контекстом, а не через пять пропсов.
const MetricsContext = createContext<Record<number, LoadMetrics>>({})

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

type Scope = 'working' | 'completed' | 'all'
const SCOPE_KEY: Record<Scope, MsgKey> = { working: 'loads.dash.working', completed: 'loads.dash.completed', all: 'loads.filter.all' }
const WORKING: LoadRecord['status'][] = ['booked', 'in_transit', 'quoted']

/** Сравнение, где Infinity значит «в конец»: Infinity - Infinity даёт NaN, а не 0. */
const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1)

export function LoadsViews({
  loads: allLoads,
  trucks,
  metrics,
  rateConPairs,
  photoTruckIds,
  attention,
  mapPanel,
  weekFrom,
  initialView,
  initialWeek,
  initialDay,
  initialQuery,
  grid,
  extra = [],
}: {
  loads: LoadRecord[]
  trucks: TruckRecord[]
  /** id груза → чистая, ставка-миля, RC/POD, ближайшая остановка. Считает страница. */
  metrics: Record<number, LoadMetrics>
  /** Map не переживает границу сервер-клиент как есть — передаём парами. */
  rateConPairs: [number, number][]
  photoTruckIds: number[]
  /** Очередь внимания — собрана на сервере вместе с экономикой. */
  attention: AttentionEntry[]
  /** Карта — серверный компонент, приходит готовым узлом. */
  mapPanel: ReactNode
  /** Первый день текущей расчётной недели (yyyy-mm-dd) — с сервера, чтобы SSR и клиент сошлись. */
  weekFrom: string
  initialView: 'driver' | 'board' | 'calendar'
  /** Пятница недели календаря (yyyy-mm-dd) — тоже днём, а не ms. */
  initialWeek: string
  initialDay: string | null
  /** Поиск из адреса (?q=) — по нему открываются ссылки из свода направлений. */
  initialQuery: string
  /** Раскладка плиток раздела: её читает страница-сервер (tileGrid), а рисует сетка
   *  здесь — всё, что в плитках, завязано на состояние этого компонента. */
  grid: TileGridProps
  /** Плитки, которые собирает сама страница-сервер, — свод направлений. */
  extra?: Widget[]
}) {
  const locale = useLocale()
  // Поиск и фильтры стоят НАД видами и общие для всех трёх: искать груз, а потом
  // гадать, в какой из вкладок он теперь виден, — это не поиск.
  const { query, setQuery, filter, setFilter, sort, setSort, result: filtered } = useLoadsFilter(allLoads, trucks, metrics, initialQuery)
  // Календарь больше не вкладка — он всегда под картой; старая ссылка ?view=calendar
  // открывает обычный вид по водителю.
  const [view, setView] = useState<'driver' | 'board'>(initialView === 'board' ? 'board' : 'driver')
  const [week, setWeek] = useState(initialWeek)
  const [selectedDay, setSelectedDay] = useState(initialDay)
  // «В работе» по умолчанию; поиск из адреса смотрит на всё.
  const [scope, setScope] = useState<Scope>(initialQuery ? 'all' : 'working')
  // Выборка от плитки KPI или очереди внимания: список показывает только эти грузы.
  const [selection, setSelection] = useState<Selection>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const select = (value: Selection) => {
    setSelection(value)
    setScope('all')
    setView('driver')
    setFilter('all')
    setQuery('')
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  // Фильтр и поиск смотрят по всем грузам: «неоплаченные» в режиме «В работе» иначе дали бы пустоту.
  const inScope = (l: LoadRecord) =>
    scope === 'all' || filter !== 'all' || !!query.trim() || WORKING.includes(l.status) === (scope === 'working')
  const loads = filtered.filter((l) => (!selection || selection.ids.includes(l.id)) && inScope(l))

  const rateCons = new Map(rateConPairs)
  const photoIds = new Set(photoTruckIds)
  const byId = new Map<number, TruckRecord>(trucks.map((tr) => [tr.id, tr]))
  // Груз без трака (или с трака, которого больше нет) — отдельной секцией, а не под
  // первым траком, как было раньше.
  const unassigned = loads.filter((l) => l.truckId == null || !byId.has(l.truckId))
  const byTruck = new Map<number, LoadRecord[]>()
  for (const l of loads) {
    if (l.truckId == null || !byId.has(l.truckId)) continue
    if (!byTruck.has(l.truckId)) byTruck.set(l.truckId, [])
    byTruck.get(l.truckId)!.push(l)
  }
  // Порядок траков: по ближайшей остановке, если выбрана эта сортировка; иначе те, у
  // кого груз в пути, потом забукированные, потом остальные.
  const groupKey = (ls: LoadRecord[]) =>
    Math.min(...ls.map((l) => (sort === 'nearest' ? stopOrder(metrics[l.id]?.nextStop) : activeRank(l.status))))
  const groups = trucks
    .map((truck) => ({ truck, loads: byTruck.get(truck.id) ?? [] }))
    .filter((g) => g.loads.length > 0)
    .sort((a, b) => cmp(groupKey(a.loads), groupKey(b.loads)))

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
    `-mb-px min-h-9 border-b-2 px-3 py-2 text-base font-medium transition-colors max-md:min-h-11 ${
      active ? 'border-haul-500 text-white' : 'border-transparent text-t3 hover:text-t1'
    }`
  const scopeClass = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm font-medium transition-colors max-md:min-h-9 ${
      active ? 'bg-ink-900 text-white ring-1 ring-white/10' : 'text-t3 hover:text-t1'
    }`

  // Плитки раздела. Собираются здесь, а не на странице-сервере: карта, календарь,
  // очередь внимания и список связаны общим состоянием этого компонента — выбор на
  // плитке недели сужает список ниже, и разорвать их по разным компонентам нельзя.
  const widgets: Widget[] = []
  const add = (id: string, node: ReactNode) => widgets.push({ id, node })
  for (const tile of loadsKpiTiles({ loads: allLoads, trucks, metrics, weekFrom, locale, onSelect: select })) add(tile.id, tile.node)

  // Счётчики по состояниям — своя маленькая плитка на каждое. Это НЕ повторение
  // очереди внимания: та говорит, что горит, а эти — сколько груза в каком состоянии
  // вообще. Нажатие сужает список до них же.
  const withStatus = (status: LoadRecord['status']) => allLoads.filter((l) => l.status === status)
  const noTruck = allLoads.filter((l) => l.truckId == null || !byId.has(l.truckId))
  const countTile = (id: string, label: string, rows: LoadRecord[], tone?: 'good' | 'bad' | 'warn') =>
    add(id, <CountTile label={label} count={rows.length} tone={tone} onClick={() => select({ ids: rows.map((l) => l.id), label })} />)
  countTile('total', t(locale, 'loads.page.title'), allLoads)
  countTile('unassigned', t(locale, 'loads.dash.unassigned'), noTruck, noTruck.length ? 'warn' : undefined)
  countTile('quoted', statusLabel(locale, 'quoted'), withStatus('quoted'))
  countTile('booked', statusLabel(locale, 'booked'), withStatus('booked'))
  countTile('in-transit', statusLabel(locale, 'in_transit'), withStatus('in_transit'))
  countTile('delivered', statusLabel(locale, 'delivered'), withStatus('delivered'))

  add('map', <div>{mapPanel}</div>)
  // Календарь недели: где каждый трак и что он везёт. Поиск и фильтры его не сужают —
  // это обзор парка, а не список; отменённые грузы календарь не рисует сам.
  add(
    'calendar',
    <div>
      <Calendar
        loads={allLoads}
        week={week}
        selectedDay={selectedDay}
        byId={byId}
        rateCons={rateCons}
        locale={locale}
        onWeek={setWeek}
        onDay={setSelectedDay}
      />
    </div>,
  )
  // Очередь внимания есть не всегда: когда ничего не горит, плитки просто нет, а своё
  // место в сохранённом порядке она не теряет (applyLayout сверяется с раскладкой).
  if (attention.length)
    add('attention', <div><LoadsAttention entries={attention} locale={locale} onSelect={select} /></div>)

  add(
    'list',
    // Список и всё, чем его сужают, — одна плитка: вкладки, «В работе / Завершённые /
    // Все», поиск и фильтры управляют именно им, и по разным плиткам их растащить
    // нельзя — человек бы двигал фильтр отдельно от того, что он фильтрует.
    <div>
      <div ref={listRef} className="scroll-mt-4" />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-white/8">
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setView('driver')} className={tabClass(view === 'driver')}>
            {t(locale, 'loads.page.tabByDriver')}
          </button>
          <button type="button" onClick={() => setView('board')} className={tabClass(view === 'board')}>
            {t(locale, 'loads.page.tabByStatus')}
          </button>
        </div>
        <div className="mb-1.5 flex rounded-lg bg-white/[0.05] p-0.5">
          {(['working', 'completed', 'all'] as const).map((sc) => (
            <button
              key={sc}
              type="button"
              aria-pressed={scope === sc}
              onClick={() => {
                setScope(sc)
                setSelection(null)
                setFilter('all')
              }}
              className={scopeClass(scope === sc)}
            >
              {t(locale, SCOPE_KEY[sc])}
            </button>
          ))}
        </div>
      </div>
      {selection && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-haul-500/15 px-2.5 py-1 font-medium text-haul-300">
            {selection.label} · <span className="nums">{selection.ids.length}</span>
          </span>
          <button type="button" onClick={() => setSelection(null)} className="text-t3 transition-colors hover:text-white max-md:min-h-9">
            {t(locale, 'loads.dash.clear')} ×
          </button>
        </div>
      )}

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
        <p className="panel p-4 text-center text-base text-t3">{t(locale, 'loads.filter.nothingFound')}</p>
      )}

      {view === 'board' ? (
        <StatusBoard loads={loads} byId={byId} rateCons={rateCons} locale={locale} />
      ) : (
        <div className="stagger flex flex-col gap-3">
          {unassigned.length > 0 && (
            <section className="panel p-3">
              <h2 className="mb-2 px-0.5 text-base leading-6 font-semibold text-t1">{t(locale, 'loads.dash.unassigned')}</h2>
              <div className="space-y-2">
                {unassigned.map((l) => (
                  <LoadRow key={l.id} load={l} truck={undefined} rcId={rateCons.get(l.id)} locale={locale} />
                ))}
              </div>
            </section>
          )}
          {groups.map(({ truck, loads: ls }) => (
            <DriverGroup
              key={truck.id}
              truck={truck}
              loads={ls}
              scheduleLoads={allLoads.filter((l) => l.truckId === truck.id)}
              rateCons={rateCons}
              hasPhoto={photoIds.has(truck.id)}
              locale={locale}
            />
          ))}
        </div>
      )}
    </div>,
  )

  add('chart', <div><LoadsWeekChart loads={allLoads} trucks={trucks} weekFrom={weekFrom} locale={locale} /></div>)
  for (const w of extra) add(w.id, w.node)

  return (
    <MetricsContext.Provider value={metrics}>
      <WidgetGrid {...grid} widgets={widgets} />
    </MetricsContext.Provider>
  )
}

/** «+8% к рынку» у груза: гружёная ставка против рынка — вписанного в груз или DAT по
 * региону погрузки (правило карточки груза). Нет рынка, миль или ставки — метки нет. */
function MarketBadge({ load, locale }: { load: LoadRecord; locale: Locale }) {
  const m = useContext(MetricsContext)[load.id]
  if (!m?.market || !(load.loadedMiles > 0) || !(load.rate > 0)) return null
  const rpm = load.rate / load.loadedMiles
  const v = marketVerdict(rpm, m.market)
  const source = m.marketAt ? t(locale, 'loads.dash.marketDat').replace('{date}', m.marketAt) : t(locale, 'loads.dash.marketSpot')
  return (
    <span
      title={`${usd2.format(rpm)} vs ${usd2.format(m.market)}/mi · ${source}`}
      className={`nums shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-semibold ${
        v.tone === 'good' ? 'bg-good-500/15 text-good-400' : v.tone === 'bad' ? 'bg-bad-500/15 text-bad-400' : 'bg-white/8 text-t2'
      }`}
    >
      {t(locale, 'loads.dash.vsMarket').replace('{pct}', pctText(v.diff))}
    </span>
  )
}

function StatusBoard({
  loads,
  byId,
  rateCons,
  locale,
}: {
  loads: LoadRecord[]
  byId: Map<number, TruckRecord>
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
          <h2 className="mb-2 flex items-center justify-between gap-2 text-base leading-6 font-semibold text-t1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{statusLabel(locale, status)}</span>
              <span className="nums shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 font-bold text-t2">
                {loads.length}
              </span>
            </span>
            <span className="nums shrink-0 text-base font-bold text-t1">
              {usd.format(loads.reduce((s, l) => s + l.rate, 0))}
            </span>
          </h2>
          <div className="flex flex-col gap-1.5">
            {/* Long columns were the complaint: a single status could run to dozens of
                rows and push everything below it off the screen. Six is roughly what
                fits beside its neighbours before the grid stops reading as columns. */}
            <ShowMore limit={6} label={t(locale, 'loads.page.showMore')} items={loads.map((load) => {
              const truck = (load.truckId !== null ? byId.get(load.truckId) : undefined)
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
                      <div className="text-base font-medium leading-5">
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
                    <span className="min-w-0 truncate text-xs text-t3">
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
                  <div className="mt-1 flex empty:hidden">
                    <MarketBadge load={load} locale={locale} />
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
  week,
  byId,
  rateCons,
  locale,
  onWeek,
}: {
  loads: LoadRecord[]
  week: string
  selectedDay: string | null
  byId: Map<number, TruckRecord>
  rateCons: Map<number, number>
  locale: Locale
  onWeek: (week: string) => void
  onDay: (iso: string | null) => void
}) {
  // Дни — строками, «сегодня» — по восточному времени: так сервер и браузер в любых
  // поясах рисуют одну неделю, и через перевод часов день не повторяется.
  const weekIsos = Array.from({ length: 7 }, (_, i) => shiftDay(week, i))
  const todayIso = todayEt()
  const weekEnd = weekIsos[6]!
  const weekBegin = weekIsos[0]!
  const currentWeek = weekStartIso(todayIso)
  const isCurrentWeek = week === currentWeek

  // Полоса груза: от погрузки до выгрузки (без выгрузки — один день), обрезанная
  // границами недели. Грузы целиком вне недели не рисуются.
  type Bar = { load: LoadRecord; from: number; to: number; lane: number; start: string; end: string }
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
    barsByTruck.get(key)!.push({ load: l, from, to, lane: 0, start: a, end: b })
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
    quoted: 'border-white/15 bg-white/[0.06] text-t2',
    booked: 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200',
    in_transit: 'border-amber-400/40 bg-amber-400/15 text-amber-200',
    delivered: 'border-fuchsia-400/40 bg-fuchsia-400/15 text-fuchsia-200',
    paid: 'border-good-400/40 bg-good-400/15 text-good-400',
    cancelled: 'border-bad-400/30 bg-bad-400/10 text-bad-400',
  }
  // Телефон: цвет клетки дня и точки у груза — по статусу.
  const STRIP: Record<string, [string, string]> = {
    quoted: ['bg-white/30', 'text-t2'],
    booked: ['bg-cyan-400', 'text-cyan-300'],
    in_transit: ['bg-amber-400', 'text-amber-300'],
    delivered: ['bg-fuchsia-400', 'text-fuchsia-300'],
    paid: ['bg-good-400', 'text-good-400'],
    cancelled: ['bg-bad-400', 'text-bad-400'],
  }
  const city = (x: string | null) => (x ?? '—').replace(/,.*$/, '')
  // «Вт 15» или «Вт 15–Ср 16» — дни груза словами, шкала читается без клеток.
  const dayLabel = (iso: string) => `${weekdayLabel(iso, locale)} ${Number(iso.slice(8, 10))}`
  const dayRange = (a: string, b: string) => (a === b ? dayLabel(a) : `${dayLabel(a)}–${dayLabel(b)}`)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onWeek(shiftDay(week, -7))}
          className="inline-flex min-h-9 items-center rounded-xl border border-white/10 px-3.5 text-sm font-semibold text-t2 transition-colors hover:border-white/25 hover:bg-white/5 max-md:min-h-11"
        >
          {t(locale, 'loads.page.prevWeek')}
        </button>
        <span className="flex min-w-0 flex-col items-center gap-0.5 text-center">
          <span className="flex items-center gap-2 text-base font-semibold capitalize text-t1">
            {weekLabel(Date.parse(`${week}T12:00:00`), locale)}
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => onWeek(currentWeek)}
                className="rounded-full bg-haul-500/15 px-2 py-0.5 text-xs font-semibold normal-case text-haul-400 transition-colors hover:bg-haul-500/25"
              >
                {t(locale, 'loads.page.today')}
              </button>
            )}
          </span>
          {weekCount > 0 && (
            <span className="nums text-sm text-t3">
              {t(locale, 'loads.page.countLoads').replace('{n}', String(weekCount))} ·{' '}
              <span className="font-semibold text-t1">{usd.format(weekGross)}</span>
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => onWeek(shiftDay(week, 7))}
          className="inline-flex min-h-9 items-center rounded-xl border border-white/10 px-3.5 text-sm font-semibold text-t2 transition-colors hover:border-white/25 hover:bg-white/5 max-md:min-h-11"
        >
          {t(locale, 'loads.page.nextWeek')}
        </button>
      </div>

      {weekCount === 0 ? (
        <Empty icon={CalendarDays} title={t(locale, 'loads.page.emptyDayTitle')} text={t(locale, 'loads.board.emptyWeek')} />
      ) : (
        <>
        {/* Телефон — без горизонтальной прокрутки: семь дней на всю ширину, у трака
            строка из семи клеток (закрашено — занят, пусто — свободен) и грузы списком
            с днями словами. */}
        <div className="panel p-0 md:hidden">
          <div className="grid grid-cols-7 border-b border-white/8 px-2.5">
            {weekIsos.map((iso) => {
              const isToday = iso === todayIso
              return (
                <div key={iso} className={`flex flex-col items-center py-1.5 ${isToday ? 'rounded-md bg-haul-500/10' : ''}`}>
                  <span className={`text-2xs font-medium capitalize ${isToday ? 'text-haul-300' : 'text-t3'}`}>
                    {weekdayLabel(iso, locale)}
                  </span>
                  <span className={`nums text-sm font-semibold ${isToday ? 'text-haul-300' : 'text-t1'}`}>{Number(iso.slice(8, 10))}</span>
                </div>
              )
            })}
          </div>
          {/* Какой цвет что значит — только статусы, что есть на этой неделе. */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-white/[0.06] px-2.5 py-1.5 text-xs text-t3">
            {[...new Set(rows.flatMap((r) => r.bars.map((b) => b.load.status)))].map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`size-2 rounded-full ${(STRIP[s] ?? STRIP.quoted!)[0]}`} />
                {statusLabel(locale, s)}
              </span>
            ))}
          </div>
          {rows.map((row) => {
            // Клетка дня закрашена цветом груза, что в этот день у трака; пустая — свободен.
            const cells = weekIsos.map((_, i) => row.bars.find((b) => b.from <= i && i <= b.to) ?? null)
            return (
              <div key={row.key} className="border-b border-white/[0.06] px-2.5 py-2 last:border-b-0">
                <div className="flex min-w-0 items-baseline gap-2">
                  {row.href ? (
                    <Link href={row.href} className="nums shrink-0 text-base font-semibold hover:text-haul-400">
                      {row.label}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-base font-semibold text-t2">{row.label}</span>
                  )}
                  {row.sub && <span className="min-w-0 truncate text-xs text-t3">{row.sub}</span>}
                  {row.bars.length === 0 && <span className="ml-auto shrink-0 text-xs text-t3">{t(locale, 'loads.board.free')}</span>}
                </div>
                <div className="mt-1.5 grid grid-cols-7 gap-0.5">
                  {cells.map((b, i) => (
                    <span
                      key={weekIsos[i]}
                      className={`h-4 rounded-[3px] ${b ? (STRIP[b.load.status] ?? STRIP.quoted!)[0] : 'border border-white/10 bg-white/[0.04]'}`}
                    />
                  ))}
                </div>
                {row.bars.length > 0 && (
                  <div className="mt-1 flex flex-col">
                    {row.bars.map((b) => (
                      <Link key={b.load.id} href={`/loads/${b.load.id}`} className="flex items-baseline gap-1.5 rounded py-0.5 text-sm hover:bg-white/5">
                        <span className={`size-2 shrink-0 self-center rounded-full ${(STRIP[b.load.status] ?? STRIP.quoted!)[0]}`} />
                        <span className="nums shrink-0 text-xs text-t3">{dayRange(b.start, b.end)}</span>
                        <span className="min-w-0 font-medium text-t1">
                          {city(b.load.origin)} → {city(b.load.destination)}
                        </span>
                        <span className="nums ml-auto shrink-0 font-semibold text-t1">{usd.format(b.load.rate)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="panel overflow-x-auto p-0 max-md:hidden">
          <div className="min-w-[640px]">
            {/* Шапка дней */}
            <div className="grid grid-cols-[132px_repeat(7,minmax(0,1fr))] border-b border-white/8">
              <div className="sticky left-0 z-10 bg-ink-900 px-3 py-2 text-xs font-medium text-t3">
                {t(locale, 'loads.board.truck')}
              </div>
              {weekIsos.map((iso) => {
                const isToday = iso === todayIso
                return (
                  <div
                    key={iso}
                    className={`flex items-baseline justify-center gap-1 px-1 py-2 text-center ${isToday ? 'bg-haul-500/10' : ''}`}
                  >
                    <span className={`text-xs font-medium capitalize ${isToday ? 'text-haul-300' : 'text-t3'}`}>
                      {weekdayLabel(iso, locale)}
                    </span>
                    <span className={`nums text-base font-semibold ${isToday ? 'text-haul-300' : 'text-t1'}`}>
                      {Number(iso.slice(8, 10))}
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
                      <Link href={row.href} className="nums truncate text-base font-semibold hover:text-haul-400">
                        {row.label}
                      </Link>
                    ) : (
                      <span className="truncate text-base font-semibold text-t2">{row.label}</span>
                    )}
                    {row.sub && <span className="truncate text-xs text-t3">{row.sub}</span>}
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
                        className="self-center px-2 text-xs text-t3"
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
                          className={`z-[1] mx-0.5 flex min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors hover:brightness-125 ${TONE[b.load.status] ?? TONE.quoted}`}
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
        </>
      )}
      <p className="mt-2 text-xs text-t3">{t(locale, 'loads.board.hint')}</p>
    </div>
  )
}

const VERDICT_KEY: Record<Connection, MsgKey> = {
  overlap: 'loads.dash.overlap',
  unknown: 'loads.dash.unknown',
  review: 'loads.dash.review',
}

/** Стыковка текущего и следующего рейса: только даты. Подача, часовые пояса и часы
 * водителя не считаются — поэтому тут нет слова «успевает». */
function Connection({ current, next, locale }: { current: LoadRecord; next: LoadRecord; locale: Locale }) {
  const verdict = scheduleConnection(current, next)
  const when = (date: string | null, time: string | null) =>
    whenText(date, time, t(locale, 'loads.dash.noDate'), t(locale, 'loads.dash.noTime'))
  return (
    <div className="panel-inset px-3 py-2 text-sm">
      <p className="text-2xs font-semibold uppercase tracking-wide text-t3">{t(locale, 'loads.dash.connection')}</p>
      <p className="mt-1 break-words text-t2">
        {current.destination ?? '—'} · {when(current.deliveryDate, current.deliveryTime)} → {next.origin ?? '—'} ·{' '}
        {when(next.pickupDate, next.pickupTime)}
      </p>
      <p className={`mt-1 ${verdict === 'overlap' ? 'text-bad-400' : 'text-warn-400'}`}>{t(locale, VERDICT_KEY[verdict])}</p>
    </div>
  )
}

/** Карточка трака: что везёт сейчас (текущий и партиалы), стыковка со следующим,
 * следующие забукированные, черновики — и история, свёрнутая, пока есть активные. */
function DriverGroup({
  scheduleLoads,
  truck,
  loads,
  rateCons,
  hasPhoto,
  locale,
}: {
  /** ВСЕ грузы трака, без фильтров, — по ним решается, есть ли следующий рейс. */
  scheduleLoads: LoadRecord[]
  truck: TruckRecord
  loads: LoadRecord[]
  rateCons: Map<number, number>
  hasPhoto: boolean
  locale: Locale
}) {
  const current = currentLoadsByTruck(loads).get(truck.id)
  const next = nextLoadsByTruck(loads).get(truck.id)
  const active = activeLoadsByTruck(loads).get(truck.id) ?? []
  const isActive = (l: LoadRecord) => active.some((a) => a.id === l.id)
  const future = loads
    .filter((l) => l.status === 'booked' && !isActive(l))
    .sort((a, b) => (a.pickupDate ?? '9999').localeCompare(b.pickupDate ?? '9999'))
  // Черновики — не история: заявка рядом с рейсом в пути ещё может стать следующим грузом.
  const drafts = loads.filter((l) => l.status === 'quoted')
  const rest = loads.filter((l) => !isActive(l) && l.status !== 'booked' && l.status !== 'quoted')

  const row = (l: LoadRecord) => <LoadRow key={l.id} load={l} truck={truck} rcId={rateCons.get(l.id)} locale={locale} />
  const labelled = (l: LoadRecord, key: MsgKey, tone: string) => (
    <div key={l.id}>
      <p className={`mb-1 px-0.5 text-2xs font-semibold uppercase tracking-wide ${tone}`}>{t(locale, key)}</p>
      {row(l)}
    </div>
  )
  // Сумма по траку в шапке: не только сколько грузов, но и на сколько денег он везёт.
  const total = loads.reduce((s, l) => (l.status === 'cancelled' ? s : s + l.rate), 0)
  return (
    <section className="panel p-3">
      <Link href={`/trucks/${truck.id}`} className="mb-2 flex items-center gap-2.5 transition-colors hover:text-haul-400">
        <DriverAvatar truckId={truck.id} name={truck.driverName} hasPhoto={hasPhoto} size={30} />
        <span className="min-w-0 flex-1 break-words text-base font-semibold leading-snug sm:text-md"><NoBreakWords text={truckLabel(truck)} /></span>
        <span className="nums shrink-0 text-sm font-semibold text-t2">{usd.format(total)}</span>
        {/* Счётчик уходит первым на узком телефоне: он наименее важен из трёх. */}
        <span className="hidden shrink-0 text-xs text-t3 min-[380px]:inline">
          {t(locale, 'loads.page.countLoads').replace('{n}', String(loads.length))}
        </span>
      </Link>
      <div className="space-y-2.5">
        {active.map((l) => labelled(l, l.partial ? 'loads.dash.partial' : 'loads.dash.now', 'text-haul-400'))}
        {current && next && <Connection current={current} next={next} locale={locale} />}
        {current && !nextLoadsByTruck(scheduleLoads).has(truck.id) && (
          <p className="rounded-lg border border-warn-400/25 bg-warn-400/[0.07] px-3 py-2 text-sm text-warn-400">
            {t(locale, 'loads.dash.noNext')} · {current.destination ?? '—'} · {usDate(current.deliveryDate) || t(locale, 'loads.dash.noDate')}
          </p>
        )}
        {future.map((l) => labelled(l, 'loads.dash.next', 'text-t3'))}
        {drafts.map((l) => labelled(l, 'loads.dash.quoted', 'text-t3'))}
        {rest.length > 0 &&
          (active.length || future.length ? (
            <details className="group">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-t3 transition-colors hover:text-white max-md:min-h-11">
                <span className="text-t3 transition-transform group-open:rotate-90">▸</span>
                {t(locale, 'loads.dash.history')} · {rest.length}
              </summary>
              <div className="mt-1 space-y-2">{rest.map(row)}</div>
            </details>
          ) : (
            <div className="space-y-2">{rest.map(row)}</div>
          ))}
      </div>
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
  /** Нет трака — груз не назначен; экономика по нему не считается. */
  truck: TruckRecord | undefined
  rcId: number | undefined
  locale: Locale
}) {
  const m = useContext(MetricsContext)[load.id]
  const stop = m?.nextStop
  const totalMiles = load.loadedMiles + load.deadheadMiles
  const meta = [load.referenceId, load.brokerName].filter(Boolean).join(' · ')
  const wantsPod = m?.hasPod || load.status === 'delivered' || load.status === 'paid'
  return (
    // Row is a flex container, not one big <Link>: the rate con button must
    // be a sibling of the link, never nested inside it.
    <div className="flex items-center gap-2 rounded-xl border border-white/6 px-3 py-2 transition-colors hover:border-white/15">
      {/* Stacked on a phone, one row from `sm` up: side by side at 375px the city pair
          shared ~270px with the badge and the rate and clipped to a few letters. */}
      <Link href={`/loads/${load.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 basis-full break-words text-base font-medium sm:basis-auto">
              {load.origin ?? '—'} → {load.destination ?? '—'}
            </span>
            <StatusBadge status={load.status} locale={locale} />
            <span className="nums text-xs text-t2">
              {Math.round(totalMiles)} mi · {usd2.format(totalMiles > 0 ? load.rate / totalMiles : 0)}/mi
            </span>
            <DeadheadFlag miles={load.deadheadMiles} okMiles={load.deadheadOkMiles} locale={locale} />
            <MarketBadge load={load} locale={locale} />
            <PriorityChip priority={load.priority} locale={locale} />
            {m?.lateMin != null && (
              <span className="inline-flex items-center rounded-full bg-bad-500/15 px-2 py-0.5 text-xs font-semibold text-bad-400 ring-1 ring-bad-400/30">
                {t(locale, 'loads.dash.late')} · {driveTime(m.lateMin, locale)}
              </span>
            )}
          </div>
          {/* Номер, брокер и бумаги одной строкой: RC и POD — то, без чего не выставить счёт. */}
          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-t2">
            {meta && <span className="break-words">{meta}</span>}
            {load.status !== 'quoted' && <span className={m?.hasRc ? 'text-good-400' : 'text-t3'}>RC {m?.hasRc ? '✓' : '—'}</span>}
            {wantsPod && <span className={m?.hasPod ? 'text-good-400' : 'text-t3'}>POD {m?.hasPod ? '✓' : '—'}</span>}
            {!truck && <span className="text-warn-400">{t(locale, 'loads.dash.unassigned')}</span>}
          </p>
          {stop && (
            <p className="mt-1 break-words text-sm text-t2" title={t(locale, 'loads.dash.localTime')}>
              {t(locale, stop.role === 'pickup' ? 'stops.pickup' : 'stops.delivery')} · {stop.city ?? stop.address ?? '—'} ·{' '}
              {whenText(stop.date, stop.time, t(locale, 'loads.dash.noDate'), t(locale, 'loads.dash.noTime'))}
            </p>
          )}
        </div>
        {/* Inline pair on the phone (rate then loaded miles), stacked block on the right from `sm` up. */}
        <div className="flex shrink-0 items-baseline gap-2 sm:block sm:text-right">
          <div className="nums text-lg font-bold leading-tight">{usd.format(load.rate)}</div>
          {load.loadedMiles > 0 && (
            <div className="nums text-xs font-medium text-haul-300">{Math.round(load.loadedMiles).toLocaleString('en-US')} mi</div>
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

