'use client'

// The load's "Детали" panel — read view by default, "Изменить" flips every field to
// an input so the dispatcher can fix whatever the RC parse got wrong. All fields
// feed the profit calc, so saving refreshes the page with new numbers.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
  brokerMc: string | null
  brokerPhone: string | null
  brokerEmail: string | null
  truckLocation: string | null
  pickupDate: string | null
  deliveryDate: string | null
}

export function LoadEditNumbers({ load }: { load: LoadDetails }) {
  const locale = useLocale()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()

  // Form state as strings (inputs), seeded from the load.
  const [f, setF] = useState({
    rate: String(load.rate),
    loadedMiles: String(load.loadedMiles),
    deadheadMiles: String(load.deadheadMiles),
    transitDays: String(load.transitDays),
    spotRpm: load.spotRpm != null ? String(load.spotRpm) : '',
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
        router.refresh()
      }
    })
  }

  if (!editing) {
    return (
      <>
        <dl className="flex flex-col gap-2.5 text-[13px]">
          <Row label={t(locale, 'loadEdit.rate')} value={usd.format(load.rate)} />
          <Row label={t(locale, 'loadEdit.loadedMiles')} value={String(load.loadedMiles)} />
          <Row label={t(locale, 'loadEdit.deadheadMiles')} value={`${load.deadheadMiles} mi`} />
          <Row label={t(locale, 'loadEdit.transitDays')} value={String(load.transitDays)} />
          <Row
            label={t(locale, 'loadEdit.spotRate')}
            value={load.spotRpm ? `${usd2.format(load.spotRpm)}/mi` : '—'}
          />
          {load.truckLocation && <Row label={t(locale, 'loadEdit.truckWasAt')} value={load.truckLocation} />}
          {load.brokerMc && <Row label={t(locale, 'loadEdit.brokerMc')} value={load.brokerMc} />}
          {load.brokerPhone && (
            <Row label={t(locale, 'loadEdit.phone')} value={load.brokerPhone} href={`tel:${load.brokerPhone}`} />
          )}
          {load.brokerEmail && (
            <Row label="Email" value={load.brokerEmail} href={`mailto:${load.brokerEmail}`} />
          )}
          {load.pickupDate && <Row label={t(locale, 'loadEdit.pickup')} value={load.pickupDate} />}
          {load.deliveryDate && <Row label={t(locale, 'loadEdit.delivery')} value={load.deliveryDate} />}
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
        <button
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
        >
          {pending ? t(locale, 'loadEdit.saving') : t(locale, 'loadEdit.save')}
        </button>
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

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-white/60">{label}</dt>
      <dd className="nums text-right font-medium">
        {href ? (
          <a href={href} className="text-haul-400 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
