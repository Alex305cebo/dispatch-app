'use client'

// The truck list on /tracking: status, delivery ETA, weather/idle flags, and quick
// actions (call, open load) — plus a client-side filter for "who's free right now".

import { useState } from 'react'
import { Fuel, Phone, Copy, Package, History, AlertTriangle } from 'lucide-react'
import { notify } from '@/lib/notify'
import { Button } from '@/components/button'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

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

export function FleetList({
  rows,
  selectedId = null,
}: {
  rows: TrackingRow[]
  /** Truck picked on the map — its card gets a ring so the two views stay tied. The
   * card itself is NOT a click target: a <div onClick> full of links has no keyboard
   * path and swallows nothing useful. The map is the selection surface. */
  selectedId?: number | null
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

  async function copyLocation(city: string) {
    try {
      await navigator.clipboard.writeText(city)
      notify('ok', `${t(locale, 'tracking.addressCopiedPrefix')}${city}`)
    } catch {
      notify('warn', t(locale, 'tracking.clipboardDenied'))
    }
  }

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
            className={`panel flex h-full flex-col p-3 transition-shadow ${
              selectedId === r.id ? 'ring-2 ring-haul-400/70' : ''
            }`}
          >
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
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate">{r.city ?? t(locale, 'tracking.noEldData')}</span>
                {r.city && (
                  <button
                    onClick={() => void copyLocation(r.city!)}
                    title={t(locale, 'tracking.copyLocationTitle')}
                    className="shrink-0 rounded p-0.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/80"
                  >
                    <Copy size={11} />
                  </button>
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
            <div className="mt-auto flex items-center gap-1.5 pt-2.5">
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
              <Button
                size="sm"
                variant="ghost"
                href={`/trucks/${r.id}`}
                icon={<History size={12} />}
                className="ml-auto"
              >
                {t(locale, 'tracking.historyShort')}
              </Button>
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
