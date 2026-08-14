'use client'

import { Button } from '@/components/button'
// The load's "Детали" panel — read view by default, "Изменить" flips every field to
// an input so the dispatcher can fix whatever the RC parse got wrong. All fields
// feed the profit calc, so saving refreshes the page with new numbers.

import { useState, useTransition } from 'react'
import { updateLoadDetails } from '@/app/actions'
import { usd, usd2 } from '@/lib/fmt'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export type LoadDetails = {
  id: number
  rate: number
  loadedMiles: number
  deadheadMiles: number
  transitDays: number
  spotRpm: number | null
  brokerName: string | null
  brokerMc: string | null
  brokerPhone: string | null
  brokerEmail: string | null
  truckLocation: string | null
  pickupDate: string | null
  deliveryDate: string | null
  /** Окно из рейт-кона («8/14/2026 09:00-13:00»), если оно было прочитано. */
  pickupTime?: string | null
  deliveryTime?: string | null
  /** Наш собственный средний $/милю по этому направлению — подпорка на месте
   * биржевого спот-рейта, которого у нас нет ни от одного бесплатного источника. */
  laneAvgRpm?: number | null
}

export function LoadEditNumbers({ load }: { load: LoadDetails }) {
  const locale = useLocale()  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  // Form state as strings (inputs), seeded from the load.
  const [f, setF] = useState({
    rate: String(load.rate),
    loadedMiles: String(load.loadedMiles),
    deadheadMiles: String(load.deadheadMiles),
    transitDays: String(load.transitDays),
    spotRpm: load.spotRpm != null ? String(load.spotRpm) : '',
    brokerName: load.brokerName ?? '',
    brokerMc: load.brokerMc ?? '',
    brokerPhone: load.brokerPhone ?? '',
    brokerEmail: load.brokerEmail ?? '',
    pickupDate: load.pickupDate ?? '',
    deliveryDate: load.deliveryDate ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value })

  function save() {
    start(async () => {
      const res = await updateLoadDetails(load.id, {
        rate: Number(f.rate) || 0,
        loadedMiles: Number(f.loadedMiles) || 0,
        deadheadMiles: Number(f.deadheadMiles) || 0,
        transitDays: Number(f.transitDays) || 0,
        spotRpm: f.spotRpm.trim() === '' ? null : Number(f.spotRpm),
        brokerName: f.brokerName.trim() || null,
        brokerMc: f.brokerMc.trim() || null,
        brokerPhone: f.brokerPhone.trim() || null,
        brokerEmail: f.brokerEmail.trim() || null,
        pickupDate: f.pickupDate || null,
        deliveryDate: f.deliveryDate || null,
      })
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'loadEdit.updatedToast'))
        setEditing(false)
      }
    })
  }

  if (!editing) {
    return (
      <>
        {/* Две колонки вместо столбика из двенадцати строк — тот же объём занимает
            вдвое меньше высоты. Брокер, MC, телефон и даты рисуются ВСЕГДА, даже
            пустыми: раньше строки просто не было, и «в рейт-коне нет MC» было не
            отличить от «поле есть, но мы его не показали» — а заодно не видно, что
            надо дописать руками. */}
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
          <Row label={t(locale, 'loadEdit.rate')} value={usd.format(load.rate)} />
          <Row label={t(locale, 'loadEdit.loadedMiles')} value={String(load.loadedMiles)} />
          <Row label={t(locale, 'loadEdit.deadheadMiles')} value={`${load.deadheadMiles} mi`} />
          <Row label={t(locale, 'loadEdit.transitDays')} value={String(load.transitDays)} />
          <Row
            label={t(locale, 'loadEdit.spotRate')}
            value={load.spotRpm ? `${usd2.format(load.spotRpm)}/mi` : '—'}
            // Биржевого фида у нас нет, и вечный прочерк ни о чём не говорит. Вместо
            // него — единственная честная опора: сколько мы сами брали на этом
            // направлении раньше.
            hint={
              load.spotRpm
                ? undefined
                : load.laneAvgRpm
                  ? `${t(locale, 'loadEdit.ourLaneAvg')} ${usd2.format(load.laneAvgRpm)}/mi`
                  : t(locale, 'loadEdit.noMarketData')
            }
          />
          <Row label={t(locale, 'loadEdit.brokerName')} value={load.brokerName ?? '—'} />
          <Row label={t(locale, 'loadEdit.brokerMc')} value={load.brokerMc ?? '—'} />
          <Row
            label={t(locale, 'loadEdit.phone')}
            value={load.brokerPhone ?? '—'}
            href={load.brokerPhone ? `tel:${load.brokerPhone}` : undefined}
          />
          <Row
            label="Email"
            value={load.brokerEmail ?? '—'}
            href={load.brokerEmail ? `mailto:${load.brokerEmail}` : undefined}
          />
          {/* Окно из рейт-кона («8/14/2026 09:00-13:00») информативнее голой даты —
              диспетчеру нужен именно интервал, поэтому оно идёт первым. */}
          <Row label={t(locale, 'loadEdit.pickup')} value={load.pickupTime || load.pickupDate || '—'} />
          <Row label={t(locale, 'loadEdit.delivery')} value={load.deliveryTime || load.deliveryDate || '—'} />
          {load.truckLocation && <Row label={t(locale, 'loadEdit.truckWasAt')} value={load.truckLocation} />}
        </dl>
        <button
          onClick={() => setEditing(true)}
          className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
        >
          {t(locale, 'loadEdit.edit')}
        </button>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t(locale, 'loadEdit.rateDollar')} value={f.rate} onChange={set('rate')} />
        <Field label="Loaded miles" value={f.loadedMiles} onChange={set('loadedMiles')} />
        <Field label={t(locale, 'loadEdit.deadheadMiles')} value={f.deadheadMiles} onChange={set('deadheadMiles')} />
        <Field label={t(locale, 'loadEdit.transitDays')} value={f.transitDays} onChange={set('transitDays')} />
        <Field label="Spot rate $/mi" value={f.spotRpm} onChange={set('spotRpm')} placeholder="—" />
        <Field label={t(locale, 'loadEdit.brokerName')} value={f.brokerName} onChange={set('brokerName')} text />
        <Field label={t(locale, 'loadEdit.brokerMc')} value={f.brokerMc} onChange={set('brokerMc')} text />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t(locale, 'loadEdit.phone')} value={f.brokerPhone} onChange={set('brokerPhone')} text />
        <Field label="Email" value={f.brokerEmail} onChange={set('brokerEmail')} text />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t(locale, 'loadEdit.pickup')} value={f.pickupDate} onChange={set('pickupDate')} type="date" />
        <Field label={t(locale, 'loadEdit.delivery')} value={f.deliveryDate} onChange={set('deliveryDate')} type="date" />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending}
          onClick={save}>
          {pending ? t(locale, 'loadEdit.saving') : t(locale, 'loadEdit.save')}
        </Button>
        <button
          onClick={() => setEditing(false)}
          className="rounded-lg px-4 py-2 text-[13px] text-white/70 transition-colors hover:text-white"
        >
          {t(locale, 'loadEdit.cancel')}
        </button>
      </div>
    </div>
  )
}

// Was nested inside LoadEditNumbers — a new function identity every render, so
// React tore down and remounted the <input> on every keystroke, dropping focus
// and characters. Hoisted out so its identity (and the DOM node) stays stable.
function Field({
  label,
  value,
  onChange,
  text,
  type,
  placeholder,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  text?: boolean
  type?: 'date'
  placeholder?: string
}) {
  const input =
    'w-full rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500'
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-white/55">{label}</span>
      <input
        type={type ?? (text ? 'text' : 'number')}
        inputMode={type || text ? undefined : 'decimal'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={input}
      />
    </label>
  )
}

function Row({
  label,
  value,
  href,
  hint,
}: {
  label: string
  value: string
  href?: string
  /** Приписка под значением — чем заменить прочерк, когда самого значения нет. */
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-1.5">
      <dt className="shrink-0 text-white/60">{label}</dt>
      <dd className="nums min-w-0 text-right font-medium">
        {href ? (
          <a href={href} className="text-haul-400 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
        {hint && <span className="ml-1.5 text-[11px] font-normal text-white/40">{hint}</span>}
      </dd>
    </div>
  )
}
