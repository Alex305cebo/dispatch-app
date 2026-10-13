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
import { TripSteps } from '@/components/today-cards'
import { TRIP_COLS } from './trip-cols'

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
/** Второстепенные действия строки — словами, но без рамки: в таблице три кнопки в
 *  рамках на каждой строке спорили с самим рейсом. */
const TEXT_BTN = 'min-h-9 whitespace-nowrap rounded-lg px-1.5 text-sm text-t3 hover:bg-white/[0.06] hover:text-t1 disabled:opacity-50 max-md:min-h-11'

/** Сколько шагов рейса пройдено — полоса под статусом, как «Рейс» на «Грузах». */
const STEPS: Record<AmazonStatus, number | null> = { booked: 1, in_transit: 2, delivered: 3, cancelled: null }


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
      <li className="border-t border-white/[0.07] bg-white/[0.02] p-4 first:border-t-0">
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
    <li className={`${TRIP_COLS} border-t border-white/[0.07] px-4 py-3 transition-colors first:border-t-0 hover:bg-white/[0.025] ${cancelled ? 'opacity-60' : ''}`}>
      {/* Статус плашкой и полоса из трёх шагов: взят → в пути → доставлен. */}
      <div className="flex min-w-0 flex-col items-start gap-1.5 [grid-area:status]">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[trip.status]}`}>
          {t(locale, `amazon.status.${trip.status}` as MsgKey)}
        </span>
        <div className="w-16">
          <TripSteps
            steps={STEPS[trip.status]}
            labels={[t(locale, 'amazon.status.booked'), t(locale, 'amazon.status.in_transit'), t(locale, 'amazon.status.delivered')]}
          />
        </div>
      </div>

      {/* Рейс: VRID крупно, тур под ним. */}
      <div className="min-w-0 [grid-area:trip]">
        {trip.vrid && <div className="truncate font-mono text-sm font-bold text-t1">{trip.vrid}</div>}
        {trip.tourId && (
          <div className="truncate font-mono text-xs text-t3">
            {t(locale, 'amazon.tour')} {trip.tourId}
          </div>
        )}
      </div>

      {/* Маршрут: склады по порядку, у каждого — время, как напечатано в Relay. Дата —
          только у остановки другого дня: день рейса и так стоит заголовком над ним
          («Сегодня», «Завтра»), и одна и та же дата у каждого склада была лишней цифрой. */}
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm [grid-area:route]">
        {trip.stops.map((s, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-t3">→</span>}
            <span className="min-w-0">
              <span className="font-mono font-semibold text-t1">{s.code ?? s.city}</span>
              {((s.date && s.date !== trip.startDate) || s.time) && (
                <span className="nums ml-1.5 text-t2">
                  {s.date && s.date !== trip.startDate ? `${usDate(s.date)} ` : ''}
                  {s.time ?? ''}
                  {s.time && s.tz ? ` ${s.tz}` : ''}
                </span>
              )}
              {s.code && s.city && <span className="block truncate text-xs text-t3">{s.city}</span>}
            </span>
          </li>
        ))}
      </ol>

      {/* Трак — выбор на месте; прицеп и тип погрузки строкой под ним. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm [grid-area:truck] @4xl:flex-col @4xl:items-stretch">
        <select
          value={trip.truckId ?? ''}
          disabled={busy}
          onChange={(e) => run(() => setAmazonTripTruck(trip.id, e.target.value ? Number(e.target.value) : null))}
          aria-label={t(locale, 'amazon.truck')}
          className="min-h-9 max-w-[14rem] rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm text-t1 outline-none max-md:min-h-11 @4xl:w-full @4xl:min-w-0 @4xl:max-w-none"
        >
          <option value="">{t(locale, 'amazon.noTruck')}</option>
          {trucks.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.label}
            </option>
          ))}
        </select>
        {(trip.trailerOwner || trip.trailerNo || trip.loadKind || trip.notes) && (
          <span className="min-w-0 text-xs text-t3">
            {[
              trip.trailerOwner === 'amazon' ? t(locale, 'amazon.trailerAmazon') : null,
              trip.trailerNo ? `TRL ${trip.trailerNo}` : null,
              trip.loadKind ? t(locale, trip.loadKind === 'drop' ? 'amazon.kindDrop' : 'amazon.kindLive') : null,
              trip.notes,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {/* Оплата: сумма крупно, мили и $/mi под ней. */}
      <div className="nums min-w-0 text-right [grid-area:pay]">
        {trip.rate != null && <div className="text-md font-bold text-t1">{usd.format(trip.rate)}</div>}
        {(trip.miles != null || rpm != null) && (
          <div className="text-xs text-t3" title={t(locale, 'amazon.rpmSource')}>
            {[trip.miles != null ? `${Math.round(trip.miles)} mi` : null, rpm != null ? `$${rpm.toFixed(2)}/mi` : null].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* Действия: следующий шаг рейса — кнопкой, остальное — словами без рамки. */}
      <div className="flex flex-wrap items-center gap-1 [grid-area:acts] @4xl:flex-nowrap @4xl:justify-end">
        {next && (
          <button type="button" disabled={busy} onClick={() => run(() => setAmazonTripStatus(trip.id, next.to))} className={`${SMALL_BTN} whitespace-nowrap border-haul-500/40 text-haul-300`}>
            {t(locale, next.label)}
          </button>
        )}
        <button type="button" onClick={() => setEditing(true)} className={TEXT_BTN}>
          {t(locale, 'amazon.edit')}
        </button>
        {cancelled ? (
          <button type="button" disabled={busy} onClick={() => run(() => setAmazonTripStatus(trip.id, 'booked'))} className={TEXT_BTN}>
            {t(locale, 'amazon.restore')}
          </button>
        ) : (
          trip.status !== 'delivered' && (
            <button type="button" disabled={busy} onClick={() => run(() => setAmazonTripStatus(trip.id, 'cancelled'))} className={TEXT_BTN}>
              {t(locale, 'amazon.toCancel')}
            </button>
          )
        )}
        <span className="ml-auto @4xl:ml-0">
          <DeleteButton action={deleteAmazonTrip} id={trip.id} title={trip.vrid ?? t(locale, 'amazon.delete')} note={t(locale, 'amazon.deleteNote')} />
        </span>
      </div>
    </li>
  )
}
