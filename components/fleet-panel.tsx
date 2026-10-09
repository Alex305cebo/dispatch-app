'use client'

// «Траки»: всё, что держится на одном выборе — какие траки сейчас смотрят.
//
// Четыре цифры парка, карта, под ней один список траков и вкладкой рядом «Загрузка
// парка» (план «Порядок в TMS», 10/09/26). Цифры — это и есть фильтры списка, как на
// «Грузах»: нажал «Свободны 4» — список показывает эти четыре трака; нажал трак на
// карте — список показывает его одного. Отдельного ряда кнопок-траков под картой и
// счётчиков «до выгрузки / в пути / топливо / простой» больше нет: всё это — строка
// трака в списке, и она стоит прямо под картой.
//
// Отрисовано на сервере заранее, здесь ничего не перезапрашивается: строки уже на руках.

import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CalendarRange, CloudLightning, Fuel, Hourglass, List, MapPinOff, Package, TreePalm, Truck, Wrench } from 'lucide-react'
import { FleetMap, type MapMarker, type MapMarket, type MapRoute } from '@/components/fleet-map'
import { useRoutePlan, type PlanSnaps, type PlanTruck } from '@/components/route-planner'
import { ltStates, type DatEquipment, type DatSnapshot } from '@/lib/dat-market-core'
import { FleetList, type TrackingRow, type TruckMoney } from '@/components/fleet-list'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { FuelPriceButton } from '@/components/fuel-price-button'
import { Segmented } from '@/components/segmented'
import { Stat } from '@/components/stat'
import { Cells } from '@/components/mini-charts'
import type { DirectoryCompany } from '@/components/driver-directory'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import { WidgetGrid, type TileGridProps, type Widget } from '@/components/widget-grid'

/** Суточные снимки DAT по сериям со ставками по маршрутам: слой «Рынок» на карте и
 * слой «Из штата» — те же данные, что у «Куда отправить трак» на «Рынке». */
export type FleetSnaps = PlanSnaps

type View = 'list' | 'schedule'

/** Какие траки показывает список: группа с цифры наверху или один трак с карты
 *  (truckId — тогда на карте ещё и слой «Из штата» для него). */
type Selection = { ids: number[]; label: string; truckId?: number } | null

const isFree = (r: TrackingRow) => !r.hasLoad && !r.unavailable
const lowFuel = (r: TrackingRow) => r.fuel !== null && r.fuel <= 15
/** Кем заняться первым: трак без GPS (его нет даже на карте), стоящий под грузом
 *  (детеншен или поломка), под непогодой или почти без топлива. */
const needsAttention = (r: TrackingRow) => r.city === null || r.idleHours !== null || !!r.weather || lowFuel(r)

export function FleetPanel({
  markers,
  routes,
  snaps = {},
  planTrucks = [],
  rows,
  updatedText,
  staleMinutes,
  schedule,
  after,
  money,
  company,
  dispatchers,
  grid,
}: {
  markers: MapMarker[]
  routes: MapRoute[]
  /** Суточные снимки DAT по сериям: слои «Рынок» и «Из штата» на карте. */
  snaps?: FleetSnaps
  /** Траки для слоя «Из штата»: откуда поедет, прицеп и расходы (lib/plan-data.ts). */
  planTrucks?: PlanTruck[]
  rows: TrackingRow[]
  /** Pre-formatted on the server — "обновлено 3 мин назад" or the no-snapshot line. */
  updatedText: string
  staleMinutes: number | null
  /** «Загрузка парка» — вторая вкладка списка: кто когда освободится. */
  schedule?: React.ReactNode
  /** Под списком траков: подключение ELD. */
  after?: React.ReactNode
  /** Деньги, бумаги и простой по траку — вторая половина строки списка. */
  money?: Record<number, TruckMoney>
  /** Компания и тот, кто открыл страницу, — для блока брокеру в строке трака. */
  company?: DirectoryCompany
  /** Диспетчер, закреплённый за траком, — в блок брокеру вместо своего. */
  dispatchers?: Record<number, { name: string; phone: string }>
  /** Раскладка плиток раздела, прочитанная страницей из настроек компании. */
  grid: TileGridProps
}) {
  const locale = useLocale()
  // «Показать на карте» с «Рынка» приводит сюда с траком и штатом в адресе
  // (?plan=<id>&from=<ST>): тот трак выбран, карта сразу красит направления из штата.
  const params = useSearchParams()
  const initialTruck = (() => {
    const id = Number(params.get('plan'))
    return id > 0 && planTrucks.some((x) => x.id === id) ? id : null
  })()
  const initialState = /^[A-Z]{2}$/.test(params.get('from') ?? '') ? params.get('from') : null
  const [view, setViewState] = useState<View>(params.get('view') === 'schedule' ? 'schedule' : 'list')
  const [selection, setSelection] = useState<Selection>(() => {
    const r = initialTruck == null ? undefined : rows.find((x) => x.id === initialTruck)
    return r ? { ids: [r.id], label: r.number, truckId: r.id } : null
  })
  const selected = selection?.truckId ?? null
  const listRef = useRef<HTMLDivElement>(null)

  // Слой «Рынок»: грузов на трак по штатам каждой серии — из тех же снимков, что у планировщика.
  const market = useMemo<MapMarket | null>(() => {
    const list = Object.entries(snaps) as [DatEquipment, DatSnapshot & { date: string }][]
    if (!list.length) return null
    // Дата в легенде — самого старого снимка из показанных: не обещать свежесть, которой нет.
    const oldest = list.reduce((a, b) => (b[1].at < a[1].at ? b : a))
    return { date: oldest[1].date, series: Object.fromEntries(list.map(([eq, s]) => [eq, ltStates(s)])) }
  }, [snaps])
  // Слой «Из штата»: выбранный на карте трак — трак планировщика, его ставки по
  // направлениям красят штаты; нажатие по штату меняет «откуда» (вернулось 19.09.2026).
  const plan = useRoutePlan(planTrucks, snaps, selected, { truckId: initialTruck, state: initialState })

  // Вид — в адрес, без перехода: обновил страницу или поделился ссылкой — открылось то
  // же. Список — вид по умолчанию, его в адресе нет.
  const setView = (v: View) => {
    setViewState(v)
    const url = new URL(window.location.href)
    if (v === 'list') url.searchParams.delete('view')
    else url.searchParams.set('view', v)
    window.history.replaceState(window.history.state, '', url)
  }

  // Трак на карте: список показывает его одного. Щелчок мимо траков снимает только
  // такой выбор — группу, выбранную цифрой, карта не трогает.
  const onMapSelect = (id: number | null) => {
    if (id == null) {
      if (selection?.truckId != null) setSelection(null)
      return
    }
    const r = rows.find((x) => x.id === id)
    if (!r) return
    setSelection({ ids: [r.id], label: r.number, truckId: r.id })
    if (view !== 'list') setView('list')
  }

  // Цифра наверху: список показывает свою группу и прокручивается к ней. Повторное
  // нажатие — снова весь парк.
  const pick = (key: MsgKey, group: TrackingRow[]) =>
    group.length
      ? () => {
          const label = t(locale, key)
          if (selection && selection.truckId == null && selection.label === label) {
            setSelection(null)
            return
          }
          setSelection({ ids: group.map((r) => r.id), label })
          if (view !== 'list') setView('list')
          setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
        }
      : undefined

  const onLoad = rows.filter((r) => r.hasLoad)
  const free = rows.filter(isFree)
  const off = rows.filter((r) => r.unavailable)
  const attention = rows.filter(needsAttention)
  const shown = selection ? rows.filter((r) => selection.ids.includes(r.id)) : rows

  // Под цифрой — картинка, а не ещё одна строка цифр (владелец, 10/09/26: «меньше
  // цифр и текста, больше визуала»). Подробности — в ⓘ и во всплывающих подсказках.
  const icon = { size: 15, strokeWidth: 2.5 }
  const chip = { size: 12, strokeWidth: 2.5 }
  const idle = free
    .map((r) => ({ id: r.id, label: r.number, days: money?.[r.id]?.idle ?? 0 }))
    .sort((a, b) => b.days - a.days)
  const repairs = off.filter((r) => r.unavailable === 'repair').length

  // Плитки раздела. Каждая — самостоятельный блок, который человек может подвинуть
  // или сделать меньше; порядок общий для всей компании (lib/tiles.ts).
  const widgets: Widget[] = []
  const add = (id: string, node: React.ReactNode) => widgets.push({ id, node })

  add(
    'on-load',
    <Stat
      compact
      surface="panel"
      accent="good"
      icon={<Package {...icon} />}
      label={t(locale, 'trucks.heatmap.sumOnLoad')}
      value={`${onLoad.length} / ${rows.length}`}
      info={t(locale, 'trucks.tile.onLoadInfo')}
      onClick={pick('trucks.heatmap.sumOnLoad', onLoad)}
    >
      <Cells total={rows.length} lit={onLoad.length} />
    </Stat>,
  )
  add(
    'free',
    <Stat
      compact
      surface="panel"
      accent={free.length ? 'warn' : 'haul'}
      icon={<Truck {...icon} />}
      label={t(locale, 'trucks.heatmap.sumFree')}
      value={String(free.length)}
      info={t(locale, 'trucks.tile.freeInfo')}
      onClick={pick('trucks.heatmap.sumFree', free)}
    >
      <IdleBars items={idle} title={(x) => `${x.label} · ${t(locale, 'trucks.heatmap.freeDays').replace('{n}', String(x.days))}`} />
    </Stat>,
  )
  add(
    'off',
    <Stat
      compact
      surface="panel"
      accent="haul"
      icon={<Wrench {...icon} />}
      label={t(locale, 'trucks.heatmap.sumOff')}
      value={String(off.length)}
      info={t(locale, 'trucks.tile.offInfo')}
      onClick={pick('trucks.heatmap.sumOff', off)}
    >
      <Reasons>
        <Reason icon={<Wrench {...chip} />} n={repairs} label={t(locale, 'trucks.tile.repair')} tone="warn" />
        <Reason icon={<TreePalm {...chip} />} n={off.length - repairs} label={t(locale, 'trucks.tile.vacation')} tone="haul" />
      </Reasons>
    </Stat>,
  )
  add(
    'attention',
    <Stat
      compact
      surface="panel"
      accent={attention.length ? 'bad' : 'good'}
      icon={<AlertTriangle {...icon} />}
      label={t(locale, 'tracking.needAttention')}
      value={String(attention.length)}
      tone={attention.length ? undefined : 'good'}
      info={t(locale, 'trucks.tile.attentionInfo')}
      onClick={pick('tracking.needAttention', attention)}
    >
      {/* Четыре причины всегда на месте: горит та, что есть, — глаз находит её сразу,
          а не читает список через точку. */}
      <Reasons>
        <Reason icon={<MapPinOff {...chip} />} n={rows.filter((r) => r.city === null).length} label={t(locale, 'tracking.noGpsBadge')} tone="bad" />
        <Reason icon={<Hourglass {...chip} />} n={rows.filter((r) => r.idleHours !== null).length} label={t(locale, 'tracking.tileStuck')} tone="bad" />
        <Reason icon={<CloudLightning {...chip} />} n={rows.filter((r) => !!r.weather).length} label={t(locale, 'trucks.tile.weather')} tone="warn" />
        <Reason icon={<Fuel {...chip} />} n={rows.filter(lowFuel).length} label={t(locale, 'trucks.tile.lowFuel')} tone="bad" />
      </Reasons>
    </Stat>,
  )

  add(
    'map',
    // Якорь для «Показать на карте» с «Рынка»: планировщик живёт там,
    // а карта осталась здесь. scroll-mt — чтобы верхнее меню её не накрывало.
    <div id="fleet-map" className="scroll-mt-16">
      <FleetMap
        markers={markers}
        routes={routes}
        onSelect={onMapSelect}
        market={market}
        plan={plan.mapPlan}
        onPickState={plan.setOrigin}
      />
    </div>,
  )

  const viewIcon = { size: 17, strokeWidth: 2.25 }
  add(
    'list',
    // Переключатель вида, выбор и сам список — одна плитка: выбор управляет именно
    // списком, и по разным плиткам их растащить нельзя.
    <div>
      <div ref={listRef} className="scroll-mt-4" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Segmented
          label={t(locale, 'trucks.view.label')}
          value={view}
          onChange={setView}
          className="max-sm:w-full"
          items={[
            { key: 'list', label: t(locale, 'loads.view.list'), icon: <List {...viewIcon} /> },
            { key: 'schedule', label: t(locale, 'trucks.heatmap.name'), icon: <CalendarRange {...viewIcon} /> },
          ]}
        />
        {/* Когда пришёл GPS и «Обновить». Здесь, а не в своей плитке: это про карту и
            список сразу. Кнопка же держит и минутный опрос, поэтому стоит при любом виде. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-t3">
          <span className="truncate">{updatedText}</span>
          <RefreshFleetButton staleMinutes={staleMinutes} />
          {/* Цена дизеля всему парку — тоже «обновить данные парка», как GPS рядом. До
              10/09/26 стояла в шапке «Траков» второй кнопкой; по плану «Порядок в TMS»
              в шапке одна главная — «＋ Трак». */}
          {rows.length > 0 && <FuelPriceButton truckId={null} locale={locale} />}
        </div>
      </div>

      {view === 'schedule' ? (
        schedule
      ) : (
        <>
          {selection && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-haul-500/15 px-2.5 py-1 font-medium text-haul-300">
                {selection.label}
                {selection.truckId == null && (
                  <>
                    {' · '}
                    <span className="nums">{selection.ids.length}</span>
                  </>
                )}
              </span>
              <button type="button" onClick={() => setSelection(null)} className="text-t3 transition-colors hover:text-t1 max-md:min-h-9">
                {t(locale, 'tracking.wholeFleet')} ×
              </button>
            </div>
          )}
          <FleetList rows={shown} money={money} company={company} dispatchers={dispatchers} />
        </>
      )}
    </div>,
  )
  if (after) add('eld', <div>{after}</div>)

  return <WidgetGrid {...grid} widgets={widgets} />
}

/** Столбик на свободный трак — сколько дней он стоит, самый долгий первым. Красный —
 *  пять дней и больше: тот же порог, что у строки трака в списке. */
function IdleBars<T extends { id: number; days: number }>({ items, title }: { items: T[]; title: (x: T) => string }) {
  if (!items.length) return null
  const max = Math.max(7, ...items.map((x) => x.days))
  return (
    <div className="mt-3 flex h-7 items-end gap-1">
      {items.map((x) => (
        <span
          key={x.id}
          title={title(x)}
          className={`max-w-5 flex-1 rounded-[2px] ${x.days >= 5 ? 'bg-bad-400' : 'bg-warn-400'}`}
          style={{ height: `${Math.max(12, (x.days / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function Reasons({ children }: { children: React.ReactNode }) {
  return <div className="mt-2.5 flex flex-wrap gap-1.5">{children}</div>
}

const REASON_TONE = {
  bad: 'bg-bad-500/15 text-bad-400',
  warn: 'bg-warn-400/15 text-warn-400',
  haul: 'bg-haul-500/15 text-haul-300',
} as const

/** Значок причины со счётом. Нуль — бледный, но на месте: ряд не прыгает, и видно,
 *  что эта причина проверена. */
function Reason({ icon, n, label, tone }: { icon: React.ReactNode; n: number; label: string; tone: keyof typeof REASON_TONE }) {
  return (
    <span
      title={`${label}: ${n}`}
      className={`nums inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${n ? REASON_TONE[tone] : 'bg-white/[0.05] text-t3 opacity-60'}`}
    >
      {icon}
      {n}
    </span>
  )
}
