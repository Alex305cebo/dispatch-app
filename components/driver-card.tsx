'use client'

import { Button } from '@/components/button'
// One obvious place to see and edit the driver: name, phone, licence dates. Before
// this, the name was buried in the truck-economics form and the phone in the care
// passport — nobody could find either.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveDriverInfo, saveDriverPhoto } from '@/app/actions'
import { notify } from '@/lib/notify'
import { Info } from '@/components/info'
import { DriverAvatar } from '@/components/driver-avatar'
import { t, type Locale } from '@/lib/i18n'

export function DriverCard({
  truckId,
  name,
  phone,
  cdlExpiry,
  medcardExpiry,
  hasPhoto,
  embedded,
  locale = 'en',
}: {
  truckId: number
  name: string | null
  phone: string | null
  cdlExpiry: string | null
  medcardExpiry: string | null
  hasPhoto: boolean
  /** Nested inside another panel (the truck hero) — no own border/background, no header. */
  embedded?: boolean
  locale?: Locale
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  const [photoPending, startPhoto] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [f, setF] = useState({
    name: name ?? '',
    phone: phone ?? '',
    cdlExpiry: cdlExpiry ?? '',
    medcardExpiry: medcardExpiry ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value })

  function save() {
    start(async () => {
      const res = await saveDriverInfo(truckId, f)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'trucks.driverCard.saved'))
        setEditing(false)
        router.refresh()
      }
    })
  }

  function pickPhoto(file: File | undefined) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    startPhoto(async () => {
      const res = await saveDriverPhoto(truckId, fd)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'trucks.driverCard.photoSaved'))
        router.refresh()
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  const Wrap = embedded ? 'div' : 'section'

  return (
    <Wrap className={embedded ? '' : 'panel p-4'}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'trucks.driverCard.heading')}
          {!embedded && <Info text={t(locale, 'trucks.driverCard.info')} />}
        </h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-white/10 px-3 py-1 text-[12px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
          >
            {name || phone ? t(locale, 'trucks.driverCard.edit') : t(locale, 'trucks.driverCard.fill')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className={`group relative block shrink-0 ${photoPending ? 'opacity-50' : 'cursor-pointer'}`}>
              <DriverAvatar truckId={truckId} name={name} hasPhoto={hasPhoto} size={44} locale={locale} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-[9px] font-medium text-transparent transition-colors group-hover:bg-black/50 group-hover:text-white">
                {photoPending ? '…' : t(locale, 'trucks.driverCard.photoOverlay')}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={photoPending}
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
            </label>
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Field label={t(locale, 'trucks.driverCard.nameLabel')} value={f.name} onChange={set('name')} placeholder={t(locale, 'trucks.driverCard.namePlaceholder')} />
              <Field label={t(locale, 'trucks.driverCard.phoneLabel')} value={f.phone} onChange={set('phone')} placeholder="(555) 123-4567" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t(locale, 'trucks.driverCard.cdlLabel')} value={f.cdlExpiry} onChange={set('cdlExpiry')} type="date" />
            <Field label={t(locale, 'trucks.driverCard.medcardLabel')} value={f.medcardExpiry} onChange={set('medcardExpiry')} type="date" />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={pending}
              onClick={save}>
              {pending ? t(locale, 'trucks.common.saving') : t(locale, 'trucks.common.save')}
            </Button>
            <button
              onClick={() => {
                setF({
                  name: name ?? '',
                  phone: phone ?? '',
                  cdlExpiry: cdlExpiry ?? '',
                  medcardExpiry: medcardExpiry ?? '',
                })
                setEditing(false)
              }}
              className="rounded-lg px-4 py-2 text-[13px] text-white/70 transition-colors hover:text-white"
            >
              {t(locale, 'trucks.common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        // Avatar sits INLINE with the info, not stacked above it — one row, not two.
        // The hover overlay on the avatar itself ("photo") is enough to teach the
        // click-to-upload interaction; a second line of static hint text below it
        // was the actual source of the wasted vertical space.
        <div className="flex items-center gap-3">
          <label className={`group relative block shrink-0 ${photoPending ? 'opacity-50' : 'cursor-pointer'}`}>
            <DriverAvatar truckId={truckId} name={name} hasPhoto={hasPhoto} size={44} locale={locale} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-[9px] font-medium text-transparent transition-colors group-hover:bg-black/50 group-hover:text-white">
              {photoPending ? '…' : t(locale, 'trucks.driverCard.photoOverlay')}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={photoPending}
              onChange={(e) => pickPhoto(e.target.files?.[0])}
            />
          </label>
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-4">
            <Row label={t(locale, 'trucks.driverCard.nameRowLabel')} value={name || '—'} />
            <Row label={t(locale, 'trucks.driverCard.phoneRowLabel')} value={phone || '—'} href={phone ? `tel:${phone}` : undefined} />
            <Row label={t(locale, 'trucks.driverCard.cdlLabel')} value={cdlExpiry || '—'} />
            <Row label={t(locale, 'trucks.driverCard.medcardLabel')} value={medcardExpiry || '—'} />
          </dl>
        </div>
      )}
    </Wrap>
  )
}

// Was nested inside DriverCard — a new function identity every render, so React
// tore down and remounted the <input> on every keystroke, dropping focus and
// characters. Hoisted out so its identity (and the DOM node) stays stable.
function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
}) {
  const input =
    'w-full rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500'
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-white/55">{label}</span>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} className={input} />
    </label>
  )
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-white/45">{label}</dt>
      <dd className="truncate font-medium text-white/85">
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
