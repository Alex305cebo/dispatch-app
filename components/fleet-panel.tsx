'use client'

// Everything on /tracking that has to share one piece of state: which truck is picked.
// The map reports a pin click, the strip under it switches from fleet totals to that
// truck's own numbers, and its card in the list gets a ring. Server-rendered before
// this, so nothing here refetches — the rows are already in hand.

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Truck, X } from 'lucide-react'
import { FleetMap, type MapMarker, type MapMarket, type MapRoute } from '@/components/fleet-map'
import { useRoutePlan, type PlanSnaps, type PlanTruck } from '@/components/route-planner'
import { ltStates, type DatEquipment, type DatSnapshot } from '@/lib/dat-market-core'
import { FleetList, type TrackingRow, type TruckMoney } from '@/components/fleet-list'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { Button } from '@/components/button'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { LocalTime } from '@/components/local-time'
import { WidgetGrid, type TileGridProps, type Widget } from '@/components/widget-grid'
import type { TilePlacement } from '@/lib/tiles-core'

/** Суточные снимки DAT по сериям со ставками по маршрутам: слой «Рынок» на карте и
 * слой «Из штата» — те же данные, что у «Куда отправить трак» на «Рынке». */
export type FleetSnaps = PlanSnaps

export type FleetTotals = {
  deliveryMiles: number
  underLoad: number
  trucks: number
  stuck: number
  noGps: number
}

type TileData = { value: string; label: string; tone?: 'warn' }

/** One tile in the strip under the map. Fixed shape and a single `nums` line so the
 * four sit on an even baseline whatever the values are — uneven tiles are exactly what
 * made the old row look untidy. */
function Tile({ value, label, tone }: TileData) {
  return (
    <div className="panel-inset flex flex-col justify-center px-3 py-2.5">
      <div className={`nums truncate text-xl leading-tight ${tone === 'warn' ? 'text-warn-400' : 'text-t1'}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-xs text-t3">{label}</div>
    </div>
  )
}

export function FleetPanel({
  markers,
  routes,
  snaps = {},
  planTrucks = [],
  rows,
  totals,
  updatedText,
  staleMinutes,
  underMap,
  between,
  after,
  money,
  grid,
}: {
  markers: MapMarker[]
  routes: MapRoute[]
  /** Суточные снимки DAT по сериям: слои «Рынок» и «Из штата» на карте. */
  snaps?: FleetSnaps
  /** Траки для слоя «Из штата»: откуда поедет, прицеп и расходы (lib/plan-data.ts). */
  planTrucks?: PlanTruck[]
  rows: TrackingRow[]
  totals: FleetTotals
  /** Pre-formatted on the server — "обновлено 3 мин назад" or the no-snapshot line. */
  updatedText: string
  staleMinutes: number | null
  /** Сразу под картой и её цифрами, выше «Куда отправить трак»: «Загрузка парка» —
   * кто когда освободится, первое, что смотрят после карты. */
  underMap?: React.ReactNode
  /** Блоки, которые встают МЕЖДУ счётчиками и списком траков: справочник водителей и
   * календарь загрузки. Место выбрано не случайно — оба отвечают на вопросы, которые
   * задают до разбора отдельного трака: «что сказать брокеру» и «кто когда
   * освободится». За списком карточек их приходилось искать прокруткой. */
  between?: React.ReactNode
  /** Под списком траков: недельная аналитика и настройки. */
  after?: React.ReactNode
  /** Экономика по траку — вторая половина строки списка. */
  money?: Record<number, TruckMoney>
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
  const [selected, setSelected] = useState<number | null>(initialTruck)
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
  const row = selected == null ? null : (rows.find((r) => r.id === selected) ?? null)
  // Выбор чипом ведёт карту к траку; выбор пином на карте — нет (он уже там).
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const pick = (r: TrackingRow) => {
    if (selected === r.id) {
      setSelected(null)
      setFocus(null)
      return
    }
    setSelected(r.id)
    setFocus(r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null)
  }
  // «Edwin M. TRK-2237 TRL-1186» → «2237»: на чипе только номер, остальное — в title.
  const unitOf = (label: string) => /TRK-(\S+)/.exec(label)?.[1] ?? label
  const toneDot = { move: 'text-good-400', on: 'text-haul-300', rest: 'text-t3' } as const

  // Same four slots either way, so clicking a pin swaps the numbers without the strip
  // changing height or the tiles jumping to new widths.
  const tiles: TileData[] = row
    ? [
        {
          value: row.delivery ? `${row.delivery.miles.toLocaleString('en-US')} mi` : '—',
          label: t(locale, 'tracking.tileToDelivery'),
        },
        { value: row.driveTimeText ?? '—', label: t(locale, 'tracking.tileEnRoute') },
        {
          value: row.fuel != null ? `${Math.round(row.fuel)}%` : '—',
          label: t(locale, 'tracking.tileFuel'),
          tone: row.fuel != null && row.fuel <= 15 ? 'warn' : undefined,
        },
        {
          value: row.idleHours != null ? String(row.idleHours) : '0',
          label: t(locale, 'tracking.tileIdleH'),
          tone: row.idleHours != null ? 'warn' : undefined,
        },
      ]
    : [
        {
          value: totals.deliveryMiles > 0 ? `${totals.deliveryMiles.toLocaleString('en-US')} mi` : '—',
          label: t(locale, 'tracking.tileToDelivery'),
        },
        { value: `${totals.underLoad}/${totals.trucks}`, label: t(locale, 'tracking.tileUnderLoad') },
        {
          value: String(totals.stuck),
          label: t(locale, 'tracking.tileStuck'),
          tone: totals.stuck > 0 ? 'warn' : undefined,
        },
        {
          value: String(totals.noGps),
          label: t(locale, 'tracking.noGpsBadge'),
          tone: totals.noGps > 0 ? 'warn' : undefined,
        },
      ]

  // Плитки раздела. Каждая — самостоятельный блок, который человек может подвинуть
  // или сделать меньше; порядок общий для всей компании (lib/tiles.ts).
  const widgets: Widget[] = []
  const add = (id: string, node: React.ReactNode) => widgets.push({ id, node })

  add(
    'map',
    // Якорь для «Показать на карте» с «Рынка»: планировщик живёт там,
    // а карта осталась здесь. scroll-mt — чтобы верхнее меню её не накрывало.
    <div id="fleet-map" className="scroll-mt-16">
        <FleetMap
          markers={markers}
          routes={routes}
          onSelect={setSelected}
          focus={focus}
          market={market}
          plan={plan.mapPlan}
          onPickState={plan.setOrigin}
        />
    </div>,
  )

  if (rows.length > 1)
    add(
      'picker',
      // Быстрый выбор трака — чипы прямо под картой: номер и цвет статуса. Нажатие
      // ведёт карту к траку и показывает его цифры в счётчиках; повторное — снимает
      // выбор. Ряд переносится: весь парк виден без горизонтального жеста, а на
      // телефоне чип не ниже 44px.
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => {
          const active = selected === r.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => pick(r)}
              title={r.label}
              aria-pressed={active}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-base font-semibold transition-colors md:min-h-8 md:px-2.5 md:text-sm ${
                active
                  ? 'border-haul-400/70 bg-haul-500/25 text-white'
                  : 'border-white/12 bg-white/[0.04] text-t2 hover:border-white/30 hover:bg-white/[0.08]'
              }`}
            >
              <Truck
                size={13}
                strokeWidth={2.3}
                className={r.unavailable ? 'text-warn-400' : toneDot[r.statusTone]}
              />
              <span className="nums">{unitOf(r.label)}</span>
            </button>
          )
        })}
      </div>,
    )

  add(
    'counters',
    // Осознанно НЕ повторение легенды карты. «Едет / на смене / стоит» уже нарисовано
    // на ней цветом. Эти четыре отвечают на то, чего карта не говорит: у трака без GPS
    // нет пина, стоящий под грузом выглядит как стоящий без дела, а миль до выгрузки на
    // карте нет вовсе.
    <div className="panel h-full p-2.5">
      {/* Строка заголовка заодно говорит «вы смотрите один трак». Без выбора — как его
          сделать, чтобы действие не осталось спрятанным. «Обновлено · Обновить» справа
          в этой же строке: отдельный ряд занимал высоту ради одной кнопки. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1.5">
        {row ? (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-base font-semibold text-white">{row.label}</span>
            {/* Время водителя, а не пятая плитка: счётчиков ровно четыре в обоих
                состояниях, и пятый ломал бы ряд именно при выборе трака. */}
            {row.zone && (
              <span className="shrink-0 text-xs text-t3">
                {t(locale, 'trucks.head.driverTimeShort')}{' '}
                <LocalTime zone={row.zone} className="nums font-semibold text-t1" />
              </span>
            )}
          </span>
        ) : (
          <span className="truncate text-xs text-t3">{t(locale, 'tracking.pickOnMap')}</span>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-2 text-xs text-t3">
          <span className="truncate">{updatedText}</span>
          <RefreshFleetButton staleMinutes={staleMinutes} />
          {row && (
            <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => setSelected(null)}>
              {t(locale, 'tracking.wholeFleet')}
            </Button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </div>
    </div>,
  )

  if (underMap) add('heatmap', <div>{underMap}</div>)
  if (between) add('drivers', <div>{between}</div>)
  add('list', <div><FleetList rows={rows} selectedId={selected} money={money} /></div>)
  if (after) add('eld', <div>{after}</div>)

  return (
    <WidgetGrid
      {...grid}
      widgets={widgets}
    />
  )
}
