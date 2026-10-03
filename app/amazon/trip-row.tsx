'use client'

import { useState, useTransition } from 'react'
import { DeleteButton } from '@/components/delete-button'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'
import { tripRpm, type AmazonStatus } from '@/lib/amazon-relay'
import type { AmazonTrip } from '@/lib/amazon'
import { deleteAmazonTrip, setAmazonTripStatus, setAmazonTripTruck } from '@/app/amazon/actions'
import { TripForm, type TruckOption } from './trip-form'

const STATUS_TONE: Record<AmazonStatus, string> = {
  booked: 'border-haul-400/40 text-haul-300',
  in_transit: 'border-warn-400/40 text-warn-400',
  delivered: 'border-good-400/40 text-good-400',
  cancelled: 'border-white/15 text-t3 line-through',
}

const NEXT: Partial<Record<AmazonStatus, { to: AmazonStatus; label: MsgKey }>> = {
  booked: { to: 'in_transit', label: 'amazon.toTransit' },
  in_transit: { to: 'delivered', label: 'amazon.toDelivered' },
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const SMALL_BTN =
  'min-h-9 rounded-lg border border-white/12 px-2.5 text-sm text-t2 hover:border-white/25 hover:text-t1 disabled:opacity-50 max-md:min-h-11'

export function TripRow({ trip, trucks }: { trip: AmazonTrip; trucks: TruckOption[] }) {
  const locale = useLocale()
  const [editing, setEditing] = useState(false)
  const [busy, start] = useTransition()
  const run = (fn: () => Promise<{ error: string } | void>) =>
    start(async () => {
      const res = await fn()
      if (res?.error) notify('error', res.error)
    })

  if (editing)
    return (
      <li className="panel-inset rounded-xl p-3">
        <TripForm
          id={trip.id}
          trucks={trucks}
          initial={{
            vrid: trip.vrid ?? '',
            tourId: trip.tourId ?? '',
            truckId: trip.truckId,
            stops: trip.stops,
            rate: trip.rate != null ? String(trip.rate) : '',
            miles: trip.miles != null ? String(trip.miles) : '',
            trailerNo: trip.trailerNo ?? '',
            trailerOwner: trip.trailerOwner ?? '',
            loadKind: trip.loadKind ?? '',
            notes: trip.notes ?? '',
            rawText: '',
          }}
          onDone={() => setEditing(false)}
        />
      </li>
    )

  const rpm = tripRpm(trip.rate, trip.miles)
  const next = NEXT[trip.status]
  const cancelled = trip.status === 'cancelled'

  return (
    <li className={`panel-inset rounded-xl p-3 ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[trip.status]}`}>
          {t(locale, `amazon.status.${trip.status}` as MsgKey)}
        </span>
        {trip.vrid && <span className="font-mono text-sm font-bold text-t1">{trip.vrid}</span>}
        {trip.tourId && (
          <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-t2">
            {t(locale, 'amazon.tour')} {trip.tourId}
          </span>
        )}
        <span className="ml-auto nums text-sm font-semibold text-t1">
          {trip.rate != null && usd.format(trip.rate)}
          {trip.miles != null && <span className="font-normal text-t3"> · {Math.round(trip.miles)} mi</span>}
          {rpm != null && (
            <span className="font-normal text-t2" title={t(locale, 'amazon.rpmSource')}>
              {' '}
              · ${rpm.toFixed(2)}/mi
            </span>
          )}
        </span>
      </div>

      {/* Маршрут: склады по порядку, у каждого — время, как напечатано в Relay. */}
      <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {trip.stops.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-t3">→</span>}
            <span className="font-mono font-semibold text-t1">{s.code ?? s.city}</span>
            {s.code && s.city && <span className="text-t3">{s.city}</span>}
            {(s.date || s.time) && (
              <span className="nums text-t2">
                {s.date ? usDate(s.date) : ''} {s.time ?? ''}
                {s.tz ? ` ${s.tz}` : ''}
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <select
          value={trip.truckId ?? ''}
          disabled={busy}
          onChange={(e) => run(() => setAmazonTripTruck(trip.id, e.target.value ? Number(e.target.value) : null))}
          aria-label={t(locale, 'amazon.truck')}
          className="min-h-9 max-w-[14rem] rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm text-t1 outline-none max-md:min-h-11"
        >
          <option value="">{t(locale, 'amazon.noTruck')}</option>
          {trucks.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.label}
            </option>
          ))}
        </select>
        {(trip.trailerOwner || trip.trailerNo || trip.loadKind) && (
          <span className="text-t2">
            {[
              trip.trailerOwner === 'amazon' ? t(locale, 'amazon.trailerAmazon') : null,
              trip.trailerNo ? `TRL ${trip.trailerNo}` : null,
              trip.loadKind ? t(locale, trip.loadKind === 'drop' ? 'amazon.kindDrop' : 'amazon.kindLive') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        {trip.notes && <span className="text-t3">{trip.notes}</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {next && (
          <button type="button" disabled={busy} onClick={() => run(() => setAmazonTripStatus(trip.id, next.to))} className={`${SMALL_BTN} border-haul-500/40 text-haul-300`}>
            {t(locale, next.label)}
          </button>
        )}
        {cancelled ? (
          <button type="button" disabled={busy} onClick={() => run(() => setAmazonTripStatus(trip.id, 'booked'))} className={SMALL_BTN}>
            {t(locale, 'amazon.restore')}
          </button>
        ) : (
          trip.status !== 'delivered' && (
            <button type="button" disabled={busy} onClick={() => run(() => setAmazonTripStatus(trip.id, 'cancelled'))} className={SMALL_BTN}>
              {t(locale, 'amazon.toCancel')}
            </button>
          )
        )}
        <button type="button" onClick={() => setEditing(true)} className={SMALL_BTN}>
          {t(locale, 'amazon.edit')}
        </button>
        <span className="ml-auto">
          <DeleteButton action={deleteAmazonTrip} id={trip.id} title={trip.vrid ?? t(locale, 'amazon.delete')} note={t(locale, 'amazon.deleteNote')} />
        </span>
      </div>
    </li>
  )
}
