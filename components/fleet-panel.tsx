'use client'

// Everything on /tracking that has to share one piece of state: which truck is picked.
// The map reports a pin click, the strip under it switches from fleet totals to that
// truck's own numbers, and its card in the list gets a ring. Server-rendered before
// this, so nothing here refetches — the rows are already in hand.

import { useState } from 'react'
import { Truck, X } from 'lucide-react'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { FleetList, type TrackingRow, type TruckMoney } from '@/components/fleet-list'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { Button } from '@/components/button'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { LocalTime } from '@/components/local-time'

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
      <div className={`nums truncate text-[18px] leading-tight ${tone === 'warn' ? 'text-warn-400' : 'text-white/90'}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-white/45">{label}</div>
    </div>
  )
}

export function FleetPanel({
  markers,
  routes,
  rows,
  totals,
  updatedText,
  staleMinutes,
  between,
  after,
  money,
}: {
  markers: MapMarker[]
  routes: MapRoute[]
  rows: TrackingRow[]
  totals: FleetTotals
  /** Pre-formatted on the server — "обновлено 3 мин назад" or the no-snapshot line. */
  updatedText: string
  staleMinutes: number | null
  /** Блоки, которые встают МЕЖДУ счётчиками и списком траков: справочник водителей и
   * календарь загрузки. Место выбрано не случайно — оба отвечают на вопросы, которые
   * задают до разбора отдельного трака: «что сказать брокеру» и «кто когда
   * освободится». За списком карточек их приходилось искать прокруткой. */
  between?: React.ReactNode
  /** Под списком траков: недельная аналитика и настройки. */
  after?: React.ReactNode
  /** Экономика по траку — вторая половина строки списка. */
  money?: Record<number, TruckMoney>
}) {
  const locale = useLocale()
  const [selected, setSelected] = useState<number | null>(null)
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
  const toneDot = { move: 'text-good-400', on: 'text-haul-300', rest: 'text-white/45' } as const

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

  return (
    <>
      <div className="mb-2">
        <FleetMap markers={markers} routes={routes} onSelect={setSelected} focus={focus} />
      </div>

      {/* Быстрый выбор трака — чипы прямо под картой: номер и цвет статуса. Нажатие
          ведёт карту к траку и показывает его цифры в плитках ниже; повторное —
          снимает выбор. Ряд переносится: весь парк виден без горизонтального
          жеста, а на телефоне чип не ниже 44px. */}
      {rows.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {rows.map((r) => {
            const active = selected === r.id
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => pick(r)}
                title={r.label}
                aria-pressed={active}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors md:min-h-8 md:px-2.5 md:text-[12px] ${
                  active
                    ? 'border-haul-400/70 bg-haul-500/25 text-white'
                    : 'border-white/12 bg-white/[0.04] text-white/75 hover:border-white/30 hover:bg-white/[0.08]'
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
        </div>
      )}

      {/* Deliberately NOT the map's legend again. Moving / on duty / stopped is already
          drawn over the map in colour, and repeating it in words underneath was the
          same fact stated twice. These four answer what the map cannot: a truck with no
          GPS has no pin to look at, a truck standing under a load looks exactly like one
          parked between jobs, and miles-to-delivery is nowhere on a map at all. */}
      <div className="panel mb-4 p-2.5">
        {/* Title line doubles as the "you are looking at one truck" indicator. Without
            a selection it says how to get one, so the interaction isn't hidden. */}
        <div className="mb-2 flex items-center justify-between gap-2 px-1.5">
          {row ? (
            <>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[13px] font-semibold text-white">{row.label}</span>
                {/* Время водителя, а не пятая плитка: плиток ровно четыре в обоих
                    состояниях, и пятая ломала бы ряд именно при выборе трака. */}
                {row.zone && <LocalTime zone={row.zone} className="nums shrink-0 text-[11.5px] text-white/45" />}
              </span>
              <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => setSelected(null)}>
                {t(locale, 'tracking.wholeFleet')}
              </Button>
            </>
          ) : (
            <span className="truncate text-[11.5px] text-white/35">{t(locale, 'tracking.pickOnMap')}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tiles.map((tile) => (
            <Tile key={tile.label} {...tile} />
          ))}
        </div>

        {/* Its own line, not crammed onto the end of the row: at narrow widths the old
            `ml-auto` pushed "updated · live · Refresh" into a ragged second line that
            never lined up with anything. */}
        <div className="mt-2.5 flex items-center justify-end gap-2 px-1.5 text-[11px] text-white/40">
          <span className="truncate">{updatedText}</span>
          <RefreshFleetButton staleMinutes={staleMinutes} />
        </div>
      </div>

      {between}

      <FleetList rows={rows} selectedId={selected} money={money} />

      {after}
    </>
  )
}
