'use client'

// The truck list on /tracking: status, delivery ETA, weather/idle flags, and quick
// actions (call, open load) — plus a client-side filter for "who's free right now".

import { useState } from 'react'
import { Fuel, Phone, Package, AlertTriangle } from 'lucide-react'
import { LocalTime } from '@/components/local-time'
import Link from 'next/link'
import { Button } from '@/components/button'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { usd } from '@/lib/fmt'
import { CopyPlace } from '@/components/copy-place'

export type TrackingRow = {
  id: number
  label: string
  city: string | null
  eldSeen: string | null
  statusText: string
  statusTone: 'move' | 'on' | 'rest'
  hasLoad: boolean
  loadId: number | null
  loadRoute: string | null
  phone: string | null
  /** IANA-пояс последнего GPS-фикса — рядом с телефоном показывает, который час у
   * водителя. Половина парка живёт в другом поясе, и звонок в 4 утра стоит дороже
   * любой сэкономленной минуты. */
  zone: string | null
  delivery: { to: string; miles: number; etaMin: number } | null
  driveTimeText: string | null
  weather: { event: string; headline: string } | null
  idleHours: number | null
  /** Tank level in percent, straight from the truck's sensor (lib/eld.ts). Null when
   * the ELD hasn't reported one — the app has no other way to know it. */
  fuel: number | null
  /** Manual flag from the truck: 'repair' | 'vacation' | null. Badged, and never
   * counted as free — a truck in the shop isn't available just because it's empty. */
  unavailable: 'repair' | 'vacation' | null
}

const toneClass = {
  move: 'bg-good-500/15 text-good-400',
  on: 'bg-haul-500/15 text-haul-400',
  rest: 'bg-white/8 text-white/60',
}

/** Fuel colour ladder — below 15% it's a stop-and-fix, below 30% a plan-ahead. */
const fuelClass = (v: number) =>
  v <= 15 ? 'text-bad-400' : v <= 30 ? 'text-warn-400' : 'text-white/55'

/** Экономика трака за неделю — вторая половина строки. Раньше жила в отдельной
 * сетке карточек под этим же списком, и один трак показывался на странице дважды:
 * сверху «где он», снизу «сколько заработал». Диспетчер решает по обоим числам
 * сразу, поэтому они стоят в одной строке. */
export type TruckMoney = {
  /** Гросс по грузам этой недели. */
  week: number
  /** Сколько грузов у трака всего — по нему видно новичка и рабочую лошадь. */
  loads: number
  /** Ближайший к истечению документ, если он уже жёлтый или красный. */
  docWarn: string | null
}

export function FleetList({
  rows,
  selectedId = null,
  money,
}: {
  rows: TrackingRow[]
  /** Truck picked on the map — its card gets a ring so the two views stay tied. */
  selectedId?: number | null
  /** id трака → деньги и бумаги. Ключом объект, а не Map: так он переживает
   * пересылку с сервера в браузер без превращений. */
  money?: Record<number, TruckMoney>
}) {
  const locale = useLocale()
  // Two lenses on the same rows, not two copies of them: "who can I book right now"
  // and "who do I have to deal with right now" are the two questions a dispatcher
  // actually opens this page with.
  const [lens, setLens] = useState<'all' | 'free' | 'attention'>('all')
  const isFree = (r: TrackingRow) => !r.hasLoad && !r.unavailable
  const needsAttention = (r: TrackingRow) =>
    r.city === null || r.idleHours !== null || !!r.weather || (r.fuel !== null && r.fuel <= 15)
  const freeCount = rows.filter(isFree).length
  const attentionCount = rows.filter(needsAttention).length
  const shown = lens === 'free' ? rows.filter(isFree) : lens === 'attention' ? rows.filter(needsAttention) : rows
  const toggle = (next: 'free' | 'attention') => () => setLens((v) => (v === next ? 'all' : next))

  return (
    <div>
      {(freeCount > 0 || attentionCount > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {freeCount > 0 && (
            <Button size="sm" variant={lens === 'free' ? 'primary' : 'secondary'} onClick={toggle('free')}>
              {t(locale, 'tracking.freeTrucks')} · {freeCount}
            </Button>
          )}
          {attentionCount > 0 && (
            <Button
              size="sm"
              variant={lens === 'attention' ? 'danger' : 'secondary'}
              icon={<AlertTriangle size={12} />}
              onClick={toggle('attention')}
            >
              {t(locale, 'tracking.needAttention')} · {attentionCount}
            </Button>
          )}
        </div>
      )}

      {/* Two columns from `sm` up. Each card is three short lines, so one full-width
          row per truck left most of the screen empty and made the stack read as ragged
          — the gaps between cards were wider than the cards' own content. Grid rows
          stretch, so every card in a row ends at the same height. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {shown.map((r) => (
          // flex-col + the mt-auto action row below: the badge strip and the delivery
          // block are both optional, so without this the buttons floated at a different
          // height in every card. Now they line up along the bottom edge.
          <div
            key={r.id}
            className={`panel panel-interactive relative flex h-full flex-col p-3 ${
              selectedId === r.id ? 'ring-2 ring-haul-400/70' : ''
            }`}
          >
            {/* The whole card opens the truck. An overlay link rather than a <Link>
                wrapped around the content, because the card already contains a button
                and two links — nesting those inside an anchor is invalid HTML and eats
                their clicks. Everything interactive below sits on z-10 and stays
                clickable; this covers the inert space between them. panel-interactive's
                :has(:focus-visible) gives the card its lift for keyboard users. */}
            <Link
              href={`/trucks/${r.id}`}
              aria-label={r.label}
              className="absolute inset-0 rounded-[inherit]"
            />

            {/* Line 1 — who. Name and status only; anything else pushed the status
                pill onto its own line at card width. */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold">{r.label}</span>
                {r.unavailable && (
                  <span className="shrink-0 rounded-full bg-warn-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn-400">
                    {r.unavailable === 'repair'
                      ? t(locale, 'tracking.repairLabel')
                      : t(locale, 'tracking.vacationLabel')}
                  </span>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${toneClass[r.statusTone]}`}
              >
                {r.statusText}
              </span>
            </div>

            {/* Line 2 — where, plus fuel pinned right. Fuel used to sit alone on a
                whole line of its own for one tiny pill; here it costs nothing and
                lines up down the column. */}
            <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-white/55">
              <span className="flex min-w-0 items-center gap-1.5">
                {/* Место — кнопка с рамкой, а не текст с блёклым значком рядом.
                    Прежний значок в 11 пикселей и на треть прозрачный просто не
                    находили, а адрес отсюда уходит брокеру по нескольку раз в день. */}
                {r.city ? (
                  <CopyPlace text={r.city} size="sm" className="min-w-0 text-[12px] text-white/70" />
                ) : (
                  <span className="truncate">{t(locale, 'tracking.noEldData')}</span>
                )}
                {r.zone && (
                  <LocalTime
                    zone={r.zone}
                    className="nums shrink-0 text-[11.5px] text-white/40"
                  />
                )}
              </span>
              {r.fuel !== null && (
                <span
                  title={t(locale, 'tracking.fuelTitle')}
                  className={`nums flex shrink-0 items-center gap-1 font-semibold ${fuelClass(r.fuel)}`}
                >
                  <Fuel size={11} strokeWidth={2.5} />
                  {Math.round(r.fuel)}%
                </span>
              )}
            </div>

            {/* Exceptions only — a card with nothing wrong shows no strip at all. */}
            {(r.weather || r.idleHours !== null) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.weather && (
                  <span
                    title={r.weather.headline}
                    className="rounded bg-bad-500/15 px-1.5 py-0.5 text-[10.5px] font-medium text-bad-400"
                  >
                    ⚠ {r.weather.event}
                  </span>
                )}
                {r.idleHours !== null && (
                  <span className="rounded bg-warn-400/15 px-1.5 py-0.5 text-[10.5px] font-medium text-warn-400">
                    {t(locale, 'tracking.idlePrefix')}
                    {r.idleHours}
                    {t(locale, 'tracking.idleSuffix')}
                  </span>
                )}
              </div>
            )}

            {r.delivery ? (
              <div className="panel-inset mt-2 flex items-baseline justify-between gap-2 px-2.5 py-1.5">
                <span className="min-w-0 truncate text-[12px] text-white/55">
                  {t(locale, 'tracking.toDeliveryLabel')}
                  <span className="font-medium text-white/85">{r.delivery.to}</span>
                </span>
                <span className="nums shrink-0 text-[11.5px] font-semibold text-white/80">
                  {r.delivery.miles.toLocaleString('en-US')} mi · ~{r.driveTimeText}
                </span>
              </div>
            ) : (
              <div className="mt-2 text-[12px] text-white/30">{t(locale, 'tracking.noActiveLoad')}</div>
            )}

            {/* Bottom rail. Every label is short and every control is the shared
                Button, which is whitespace-nowrap — the old hand-rolled links wrapped
                "Открыть груз · Chicago, IL → Dallas, TX" onto three lines and tore
                the card's height apart. The route lives in the title instead. */}
            <div className="relative z-10 mt-auto flex items-center gap-1.5 pt-2.5">
              {r.phone && (
                <Button
                  size="sm"
                  href={`tel:${r.phone}`}
                  external
                  icon={<Phone size={12} />}
                >
                  {t(locale, 'tracking.callShort')}
                </Button>
              )}
              {r.loadId && (
                <Button
                  size="sm"
                  href={`/loads/${r.loadId}`}
                  icon={<Package size={12} />}
                  title={r.loadRoute ?? undefined}
                >
                  {t(locale, 'tracking.loadShort')}
                </Button>
              )}
              {/* No "История пути" link any more — the card itself goes there. */}

              {/* Деньги недели и бумаги — справа на той же полке. Это вторая половина
                  того же трака: раньше ради неё была отдельная сетка карточек ниже. */}
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {money?.[r.id]?.docWarn && (
                  <span
                    title={money[r.id]!.docWarn!}
                    className="rounded bg-warn-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn-400"
                  >
                    {t(locale, 'tracking.docsShort')}
                  </span>
                )}
                {money?.[r.id] && (
                  <span className="text-right leading-tight">
                    <span
                      className={`nums block text-[13px] font-bold ${
                        money[r.id]!.week > 0 ? 'text-good-400' : 'text-white/35'
                      }`}
                    >
                      {money[r.id]!.week > 0 ? usd.format(money[r.id]!.week) : '—'}
                    </span>
                    <span className="block text-[9.5px] uppercase tracking-wider text-white/40">
                      {t(locale, 'tracking.weekShort')}
                    </span>
                  </span>
                )}
              </span>
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="panel p-4 text-center text-[13px] text-white/55 sm:col-span-2 2xl:col-span-3">
            {t(locale, 'tracking.allTrucksBusy')}
          </p>
        )}
      </div>
    </div>
  )
}
