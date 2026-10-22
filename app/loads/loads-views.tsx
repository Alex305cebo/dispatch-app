'use client'

// «Грузы»: четыре цифры недели, под ними карта активных грузов со списком водителей и
// кнопкой «Открыть груз», ниже один переключатель Список · Статусы · Неделя (план «Порядок
// в TMS», 10/09/26). До этого карта, неделя и список стояли тремя блоками подряд, и список
// оказывался на третьем экране. Карта сутки побыла четвёртым видом и вернулась наверх —
// владелец: «карта и список водителей со ссылкой должны быть всегда на первой странице».
//
// Виды живут на клиенте не ради моды. Раньше вкладки были ссылками с ?view=, а стрелки
// календаря — ссылками с ?week=/?day=, то есть каждый клик был переходом по маршруту:
// страница пересобиралась на сервере целиком и мигала скелетом. При этом ни один из
// видов и ни одна неделя не требуют новых данных — все они рисуются из ОДНОЙ выборки
// грузов, которая уже пришла. Перенос выбора вида в состояние убирает переход совсем.
//
// ?view=/?week= по-прежнему задают начальное состояние, поэтому старые ссылки и закладки
// открываются там, где ожидалось; выбранный вид записывается в адрес без перехода.

import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, Columns3, List, PackageOpen, Plus } from 'lucide-react'
import { ShowMore } from '@/components/collapse'
import { Empty } from '@/components/empty'
import { Rpm } from '@/components/rpm'
import { STATUSES, currentLoadsByTruck, type TruckRecord, type LoadRecord } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { marketVerdict, pctText } from '@/lib/dat-market-core'
import { shortName, usd, usd2 } from '@/lib/fmt'
import { todayEt } from '@/lib/payments'
import { statusLabel } from '@/components/status'
import { LoadsToolbar, useLoadsFilter, type LoadMetrics } from '@/components/loads-toolbar'
import { Segmented } from '@/components/segmented'
import { RateConButton } from '@/components/ratecon-button'
import { RateBadge } from '@/components/analysis'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'
import { loadsKpiTiles, type Selection } from './loads-insights'
import { LoadsTable } from './loads-table'
import { FleetHeatmap } from '@/components/fleet-heatmap'
import { buildWorkingDays } from '@/lib/heatmap'
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

/** Вид раздела: список таблицей, колонки по статусу, неделя по тракам. Карта — не
 *  вид, а своя плитка над ними: она видна всегда. */
export type LoadsView = 'list' | 'board' | 'week'

export function LoadsViews({
  loads: allLoads,
  trucks,
  metrics,
  rateConPairs,
  photoTruckIds,
  mapPanel,
  weekFrom,
  initialView,
  initialWeek,
  initialQuery,
  grid,
}: {
  loads: LoadRecord[]
  trucks: TruckRecord[]
  /** id груза → чистая, ставка-миля, RC/POD, ближайшая остановка. Считает страница. */
  metrics: Record<number, LoadMetrics>
  /** Map не переживает границу сервер-клиент как есть — передаём парами. */
  rateConPairs: [number, number][]
  photoTruckIds: number[]
  /** Карта активных грузов со списком водителей — серверный компонент, приходит готовым
   *  узлом и стоит своей плиткой над списком. */
  mapPanel: ReactNode
  /** Первый день текущей расчётной недели (yyyy-mm-dd) — с сервера, чтобы SSR и клиент сошлись. */
  weekFrom: string
  initialView: LoadsView
  /** Пятница недели календаря (yyyy-mm-dd) — тоже днём, а не ms. */
  initialWeek: string
  /** Поиск из адреса (?q=) — по нему открываются ссылки из «Направлений» в «Деньгах». */
  initialQuery: string
  /** Раскладка плиток раздела: её читает страница-сервер (tileGrid), а рисует сетка
   *  здесь — всё, что в плитках, завязано на состояние этого компонента. */
  grid: TileGridProps
}) {
  const locale = useLocale()
  const { query, setQuery, filter, setFilter, sort, setSort, result, counts } = useLoadsFilter(allLoads, trucks, metrics, initialQuery)
  const [view, setViewState] = useState<LoadsView>(initialView)
  const [week] = useState(initialWeek)
  // Выборка от плитки недели: список показывает только эти грузы.
  const [selection, setSelection] = useState<Selection>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Вид — в адрес, без перехода: обновил страницу или поделился ссылкой — открылось то
  // же. Список — вид по умолчанию, его в адресе нет. ?week= нужна только неделе: без
  // вида она сама открывает неделю (старые ссылки), поэтому с другими видами её нет.
  const setView = (v: LoadsView) => {
    setViewState(v)
    const url = new URL(window.location.href)
    if (v === 'list') url.searchParams.delete('view')
    else url.searchParams.set('view', v)
    if (v !== 'week') url.searchParams.delete('week')
    window.history.replaceState(window.history.state, '', url)
  }

  const select = (value: Selection) => {
    setSelection(value)
    if (view !== 'list' && view !== 'board') setView('list')
    setFilter('all')
    setQuery('')
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const loads = selection ? result.filter((l) => selection.ids.includes(l.id)) : result

  const rateCons = new Map(rateConPairs)
  const photoIds = new Set(photoTruckIds)
  const byId = new Map<number, TruckRecord>(trucks.map((tr) => [tr.id, tr]))
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

  // Плитки раздела. Собираются здесь, а не на странице-сервере: нажатие на цифру недели
  // сужает список ниже, и разорвать их по разным компонентам нельзя.
  const widgets: Widget[] = []
  const add = (id: string, node: ReactNode) => widgets.push({ id, node })
  for (const tile of loadsKpiTiles({ loads: allLoads, trucks, metrics, weekFrom, locale, onSelect: select })) add(tile.id, tile.node)
  // Шесть маленьких счётчиков по состояниям («Грузы 43», «В пути 1»…) отсюда ушли: те же
  // числа стоят на пилюлях поиска, а деньги по каждому состоянию — в виде «Статусы».
  // «Требуют действия» — в ленте «Ждёт тебя» на «Сегодня»; «Грузы по дате пикапа» и
  // «Направления» — в «Деньгах», вкладка «Недели».

  // Карта с водителями и «Открыть груз» — сразу под цифрами, при любом виде списка.
  add('map', mapPanel)

  const icon = { size: 17, strokeWidth: 2.25 }
  add(
    'list',
    // Переключатель вида, поиск и сам список — одна плитка: поиск и фильтры управляют
    // именно списком, и по разным плиткам их растащить нельзя — человек бы двигал фильтр
    // отдельно от того, что он фильтрует.
    <div>
      <div ref={listRef} className="scroll-mt-4" />
      <Segmented
        label={t(locale, 'loads.view.label')}
        value={view}
        onChange={setView}
        className="mb-3 max-sm:w-full"
        items={[
          { key: 'list', label: t(locale, 'loads.view.list'), icon: <List {...icon} /> },
          // Бывшая вкладка «По статусу»: те же грузы колонками, с суммой в каждой.
          { key: 'board', label: t(locale, 'loads.view.board'), icon: <Columns3 {...icon} /> },
          { key: 'week', label: t(locale, 'loads.view.week'), icon: <CalendarDays {...icon} /> },
        ]}
      />

      {view === 'week' && (
        // Неделя по тракам: где каждый трак и что он везёт. Поиск и фильтры её не
        // сужают — это обзор парка, а не список; отменённые грузы она не рисует сама.
        // Тот же календарь, что на «Сегодня» (образец SmartHop): водители по строкам, рейсы
        // полосами с маршрутом, сегодняшний день подсвечен, листается неделями.
        <WeekCalendar loads={allLoads} trucks={trucks} rateCons={rateCons} week={week} />
      )}

      {(view === 'list' || view === 'board') && (
        <>
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
            setQuery={(v) => {
              setSelection(null)
              setQuery(v)
            }}
            filter={filter}
            setFilter={(f) => {
              setSelection(null)
              setFilter(f)
            }}
            sort={sort}
            setSort={setSort}
            counts={counts}
            shown={loads.length}
            total={allLoads.length}
            rows={loads}
            trucks={trucks}
            metrics={metrics}
          />

          {loads.length === 0 && <p className="panel p-4 text-center text-base text-t3">{t(locale, 'loads.filter.nothingFound')}</p>}

          {view === 'board' ? (
            <StatusBoard loads={loads} byId={byId} rateCons={rateCons} locale={locale} />
          ) : (
            loads.length > 0 && (
              <LoadsTable
                loads={loads}
                allLoads={allLoads}
                trucks={trucks}
                metrics={metrics}
                rateCons={rateCons}
                photoIds={photoIds}
                locale={locale}
              />
            )
          )}
        </>
      )}
    </div>,
  )

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
  // Рядом — ставка против цели торга по маршруту («в цели» / «−$412 до цели»).
  const target = <RateBadge rc={m?.rc} />
  if (!m?.market || !(load.loadedMiles > 0) || !(load.rate > 0)) return target
  const rpm = load.rate / load.loadedMiles
  const v = marketVerdict(rpm, m.market)
  if (!v) return target
  const source = m.marketAt ? t(locale, 'loads.dash.marketDat').replace('{date}', m.marketAt) : t(locale, 'loads.dash.marketSpot')
  return (
    <>
    <span
      title={`${usd2.format(rpm)} vs ${usd2.format(m.market)}/mi · ${source}`}
      className={`nums shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-semibold ${
        v.tone === 'good' ? 'bg-good-500/15 text-good-400' : v.tone === 'bad' ? 'bg-bad-500/15 text-bad-400' : 'bg-white/8 text-t2'
      }`}
    >
      {t(locale, 'loads.dash.vsMarket').replace('{pct}', pctText(v.diff))}
    </span>
    {target}
    </>
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
                      <Rpm rate={load.rate} miles={load.loadedMiles + load.deadheadMiles} className="ml-1.5 text-2xs font-medium text-t2" />
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
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

/** Календарь недели — FleetHeatmap в варианте week, как на «Сегодня». Строки строятся
 *  здесь же из уже пришедших грузов: новых данных он не требует. */
function WeekCalendar({
  loads,
  trucks,
  rateCons,
  week,
}: {
  loads: LoadRecord[]
  trucks: TruckRecord[]
  rateCons: Map<number, number>
  week: string
}) {
  const live = loads.filter((l) => l.status !== 'cancelled')
  const current = currentLoadsByTruck(live)
  const rc: Record<number, number> = {}
  const rows = trucks.map((tr) => {
    const working = buildWorkingDays(live.filter((l) => l.truckId === tr.id))
    for (const day of working.values())
      for (const l of day) {
        const id = rateCons.get(l.id)
        if (id != null) rc[l.id] = id
      }
    return {
      id: tr.id,
      label: tr.number?.trim() || tr.name,
      sub: shortName(tr.driverName),
      working,
      when: { text: '', tone: tr.unavailable ? ('off' as const) : current.has(tr.id) ? ('busy' as const) : ('free' as const) },
    }
  })
  return <FleetHeatmap week={week} today={todayEt()} rows={rows} rateCons={rc} />
}
