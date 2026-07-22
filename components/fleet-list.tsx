'use client'

// The truck list on /tracking: status, delivery ETA, weather/idle flags, and quick
// actions (call, open load) — plus a client-side filter for "who's free right now".

import { useState } from 'react'
import Link from 'next/link'
import { notify } from '@/lib/notify'

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
  /** Manual flag from the truck: 'repair' | 'vacation' | null. Badged, and never
   * counted as free — a truck in the shop isn't available just because it's empty. */
  unavailable: 'repair' | 'vacation' | null
}

const toneClass = {
  move: 'bg-good-500/15 text-good-400',
  on: 'bg-haul-500/15 text-haul-400',
  rest: 'bg-white/8 text-white/60',
}

export function FleetList({ rows }: { rows: TrackingRow[] }) {
  const [freeOnly, setFreeOnly] = useState(false)
  const isFree = (r: TrackingRow) => !r.hasLoad && !r.unavailable
  const freeCount = rows.filter(isFree).length
  const shown = freeOnly ? rows.filter(isFree) : rows

  async function copyLocation(city: string) {
    try {
      await navigator.clipboard.writeText(city)
      notify('ok', `Адрес скопирован: ${city}`)
    } catch {
      notify('warn', 'Браузер не дал буфер — выдели адрес вручную')
    }
  }

  return (
    <div>
      {freeCount > 0 && (
        <button
          onClick={() => setFreeOnly((v) => !v)}
          className={`mb-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
            freeOnly
              ? 'border-haul-500 bg-haul-500/15 text-haul-400'
              : 'border-white/10 text-white/65 hover:border-white/25 hover:text-white'
          }`}
        >
          {freeOnly ? '✓ ' : ''}Свободные траки · {freeCount}
        </button>
      )}

      <div className="flex flex-col gap-2">
        {shown.map((r) => (
          <div key={r.id} className="panel p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold">{r.label}</span>
                  {r.unavailable && (
                    <span className="shrink-0 rounded-full bg-warn-400/15 px-2 py-0.5 text-[10.5px] font-semibold text-warn-400">
                      {r.unavailable === 'repair' ? '🔧 В ремонте' : '🌴 Отпуск'}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[12px] text-white/60">
                  <span className="truncate">{r.city ?? 'Нет данных с ELD'}</span>
                  {r.city && (
                    <button
                      onClick={() => copyLocation(r.city!)}
                      title="Скопировать адрес местоположения трака"
                      className="shrink-0 text-white/40 transition-colors hover:text-white/80"
                    >
                      📋
                    </button>
                  )}
                  {r.eldSeen && <span className="shrink-0 text-white/40"> · {r.eldSeen}</span>}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${toneClass[r.statusTone]}`}>
                {r.statusText}
              </span>
            </div>

            {(r.weather || r.idleHours !== null) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.weather && (
                  <span className="rounded-md bg-bad-500/15 px-2 py-1 text-[11px] font-medium text-bad-400">
                    ⚠ {r.weather.event}
                  </span>
                )}
                {r.idleHours !== null && (
                  <span className="rounded-md bg-warn-400/15 px-2 py-1 text-[11px] font-medium text-warn-400">
                    ⏸ стоит на месте ~{r.idleHours}ч — груз в пути
                  </span>
                )}
              </div>
            )}

            {r.delivery ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
                <span className="min-w-0 truncate text-[12px] text-white/60">
                  До выгрузки · <span className="text-white/80">{r.delivery.to}</span>
                </span>
                <span className="nums shrink-0 text-[12px] font-semibold text-white/85">
                  {r.delivery.miles} mi · ~{r.driveTimeText}
                </span>
              </div>
            ) : (
              <div className="mt-3 text-[12px] text-white/40">Нет активного груза</div>
            )}

            <div className="mt-3 flex items-center gap-2">
              {r.phone && (
                <a
                  href={`tel:${r.phone}`}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-medium text-white/75 transition-colors hover:border-white/25 hover:text-white"
                >
                  📞 Позвонить
                </a>
              )}
              {r.loadId && (
                <Link
                  href={`/loads/${r.loadId}`}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-medium text-white/75 transition-colors hover:border-white/25 hover:text-white"
                >
                  Открыть груз{r.loadRoute ? ` · ${r.loadRoute}` : ''}
                </Link>
              )}
              <Link
                href={`/trucks/${r.id}`}
                className="ml-auto shrink-0 text-[12px] text-white/45 transition-colors hover:text-white/75"
              >
                История пути →
              </Link>
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="panel p-4 text-center text-[13px] text-white/55">Все траки сейчас в работе.</p>
        )}
      </div>
    </div>
  )
}
