'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { StatusBadge } from '@/components/status'
import { Info } from '@/components/info'
import type { LoadRecord } from '@/lib/map'
import type { LoadStop } from '@/lib/stops'
import { t, type Locale } from '@/lib/i18n'
import { usd } from '@/lib/fmt'
import { whenText } from '@/lib/loads-dashboard'

export type LoadsMapRow = {
  load: LoadRecord
  name: string
  markers: MapMarker[]
  routes: MapRoute[]
  /** «15 мин назад» — посчитано на сервере, чтобы клиент не пересчитывал в своём поясе. */
  seenText: string | null
  nextStop: LoadStop | null
}

/** Карта плюс список рейсов рядом: выбор с любой стороны — строкой, пином или линией. */
export function LoadsMap({ rows, locale }: { rows: LoadsMapRow[]; locale: Locale }) {
  const [id, setId] = useState<number | null>(rows[0]?.load.id ?? null)
  // Линиям нужны coords, иначе FleetMap не даёт по ним щёлкнуть. Выбранный рейс —
  // сплошной акцентом, остальные — серым пунктиром.
  const routes = useMemo(
    () =>
      rows.flatMap((row) =>
        row.routes.map((r) => ({
          ...r,
          coords: r.coords ?? [r.from, r.to],
          id: String(row.load.id),
          tone: row.load.id === id ? ('toll' as const) : ('free' as const),
        })),
      ),
    [rows, id],
  )
  const markers = useMemo(() => rows.flatMap((r) => r.markers), [rows])

  const heading = (
    <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
      {t(locale, 'loads.dash.activeMap')}
      <Info text={t(locale, 'loads.dash.mapHint')} />
    </h2>
  )
  if (!rows.length)
    return (
      <section className="panel mb-4 px-3.5 py-3">
        {heading}
        <p className="mt-0.5 text-[13px] text-white/55">{t(locale, 'loads.dash.noActive')}</p>
      </section>
    )

  return (
    <section className="panel mb-4 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        {heading}
        <span className="nums rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-bold text-white/70">{rows.length}</span>
      </div>
      <div className="grid min-w-0 border-t border-white/[0.06] lg:grid-cols-[minmax(0,3fr)_minmax(240px,2fr)]">
        <div className="min-w-0">
          <FleetMap
            markers={markers}
            routes={routes}
            height="clamp(240px, 34vw, 360px)"
            onRoute={(value) => setId(Number(value))}
            onSelect={(value) => {
              if (value != null) setId(value)
            }}
          />
        </div>
        <div className="max-h-[360px] overflow-y-auto border-t border-white/[0.06] lg:border-l lg:border-t-0">
          {rows.map((row) => {
            const active = id === row.load.id
            const stop = row.nextStop
            return (
              <div
                key={row.load.id}
                className={`border-b border-white/[0.06] px-3.5 py-2.5 transition-colors last:border-b-0 ${
                  active ? 'bg-white/[0.04] shadow-[inset_3px_0_0_var(--color-haul-500)]' : ''
                }`}
              >
                <button type="button" aria-pressed={active} onClick={() => setId(row.load.id)} className="block w-full text-left">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-[12px] font-medium text-white/55">{row.name}</span>
                    <StatusBadge status={row.load.status} locale={locale} />
                  </span>
                  <span className="mt-1 block break-words text-[13.5px] font-medium">
                    {row.load.origin ?? '—'} → {row.load.destination ?? '—'}
                  </span>
                  {stop && (
                    <span className="mt-0.5 block break-words text-[12px] text-white/65">
                      {t(locale, stop.role === 'pickup' ? 'stops.pickup' : 'stops.delivery')} · {stop.city ?? stop.address ?? '—'} ·{' '}
                      {whenText(stop.date, stop.time, t(locale, 'loads.dash.noDate'), '')}
                    </span>
                  )}
                </button>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="nums text-[15px] font-bold">{usd.format(row.load.rate)}</span>
                  <Link
                    href={`/loads/${row.load.id}`}
                    className="inline-flex min-h-8 items-center gap-1 text-[12px] font-medium text-haul-400 hover:underline max-md:min-h-11"
                  >
                    {t(locale, 'loads.dash.open')}
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
                {(!row.markers.length || row.seenText) && (
                  <p className="text-[11px] text-white/45">
                    {!row.markers.length ? t(locale, 'loads.dash.noPosition') : `${t(locale, 'loads.dash.gps')}: ${row.seenText}`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
