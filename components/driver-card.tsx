'use client'

import { safeUploadFile } from '@/lib/upload-name'
import { Button } from '@/components/button'
// Водитель живёт в шапке трака, а не отдельной плиткой. Была своя плитка «Водитель ·
// CDL, медкарта, фото», и имя, телефон, трак, трейлер и VIN стояли на экране дважды —
// в ней и рядом в шапке. Теперь в шапку встают только части, которых там не было:
// фото (нажать — загрузить новое), «Скопировать для брокера» и «Изменить», а правка
// открывается окном поверх страницы.

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Pencil } from 'lucide-react'
import { saveDriverInfo, saveDriverPhoto } from '@/app/actions'
import { notify } from '@/lib/notify'
import { DriverAvatar } from '@/components/driver-avatar'
import { infoBlock } from '@/components/driver-directory'
import { t, type Locale } from '@/lib/i18n'

/** Кнопка шапки трака — тот же вид, что у телефона рядом: h-8 с рамкой и иконкой. */
const HEAD_BTN =
  'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-base font-medium text-t1 transition-colors hover:border-white/30 hover:bg-white/[0.08] max-md:h-10'

/** Фото водителя; нажатие — загрузить новое. */
export function DriverPhoto({
  truckId,
  name,
  hasPhoto,
  size = 44,
  locale = 'en',
}: {
  truckId: number
  name: string | null
  hasPhoto: boolean
  size?: number
  locale?: Locale
}) {
  const [pending, start] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function pick(file: File | undefined) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', safeUploadFile(file))
    start(async () => {
      const res = await saveDriverPhoto(truckId, fd)
      if (res?.error) notify('error', res.error)
      else notify('ok', t(locale, 'trucks.driverCard.photoSaved'))
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <label
      className={`group relative block shrink-0 rounded-full ${pending ? 'opacity-50' : 'cursor-pointer'}`}
      title={t(locale, 'trucks.driverCard.photoOverlay')}
    >
      <DriverAvatar truckId={truckId} name={name} hasPhoto={hasPhoto} size={size} locale={locale} />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-2xs font-medium text-transparent transition-colors group-hover:bg-black/50 group-hover:text-white">
        {pending ? '…' : t(locale, 'trucks.driverCard.photoOverlay')}
      </span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={pending}
        onChange={(e) => pick(e.target.files?.[0])}
      />
    </label>
  )
}

type DriverFields = {
  truckId: number
  name: string | null
  phone: string | null
  cdlExpiry: string | null
  medcardExpiry: string | null
  hasPhoto: boolean
  /** Номер трака, прицепа и VIN. Брокер спрашивает их в каждом звонке вместе с
   * именем и телефоном, поэтому и правятся они здесь же. */
  truckNumber?: string | null
  trailerNumber?: string | null
  vin?: string | null
}

/** «Скопировать для брокера» и «Изменить» — кнопки шапки трака. */
export function DriverActions({
  broker,
  locale = 'en',
  ...d
}: DriverFields & {
  /** Компания и диспетчер — вторая половина блока, который уходит брокеру. Без них
   * кнопка «скопировать» не показывается: половина блока хуже, чем его отсутствие. */
  broker?: {
    mc: string
    companyName: string
    companyEmail: string
    dispatcherName: string
    dispatcherPhone: string
  }
  locale?: Locale
}) {
  const [editing, setEditing] = useState(false)

  return (
    <>
      {/* Готовый блок для брокера — тот же текст, что на странице «Траки»:
          один формат в двух местах, иначе брокер получал бы разные письма. */}
      {broker && (
        <button
          type="button"
          onClick={() =>
            copyText(
              infoBlock(
                {
                  truckId: d.truckId,
                  driverName: d.name,
                  driverPhone: d.phone,
                  truckNumber: d.truckNumber ?? null,
                  trailerNumber: d.trailerNumber ?? null,
                  vin: d.vin ?? null,
                },
                broker,
              ),
              t(locale, 'trucks.driverCard.copied'),
            )
          }
          className={HEAD_BTN}
        >
          <Copy size={14} strokeWidth={2.2} className="text-haul-300" />
          {t(locale, 'trucks.driverCard.copyForBroker')}
        </button>
      )}
      <button type="button" onClick={() => setEditing(true)} className={HEAD_BTN}>
        <Pencil size={14} strokeWidth={2.2} className="text-haul-300" />
        {d.name || d.phone ? t(locale, 'trucks.driverCard.edit') : t(locale, 'trucks.driverCard.fill')}
      </button>
      {editing && <DriverEdit {...d} locale={locale} onClose={() => setEditing(false)} />}
    </>
  )
}

/** Правка водителя окном поверх страницы: ✕, Escape и щелчок мимо окна закрывают. */
function DriverEdit({ onClose, locale = 'en', ...d }: DriverFields & { onClose: () => void; locale?: Locale }) {
  const [pending, start] = useTransition()
  const [f, setF] = useState({
    name: d.name ?? '',
    phone: d.phone ?? '',
    cdlExpiry: d.cdlExpiry ?? '',
    medcardExpiry: d.medcardExpiry ?? '',
    truckNumber: d.truckNumber ?? '',
    trailerNumber: d.trailerNumber ?? '',
    vin: d.vin ?? '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  function save() {
    start(async () => {
      const res = await saveDriverInfo(d.truckId, f)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'trucks.driverCard.saved'))
        onClose()
      }
    })
  }

  // Портал в <body>: у плиток свои transform и overflow:hidden, внутри них окно
  // обрезалось бы по краю плитки.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'trucks.driverCard.heading')}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel flex max-h-full w-full max-w-xl flex-col gap-3 overflow-auto p-4 sm:p-5"
      >
        <div className="flex items-center gap-3">
          <DriverPhoto truckId={d.truckId} name={d.name} hasPhoto={d.hasPhoto} locale={locale} />
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold leading-6 text-t1">
            {t(locale, 'trucks.driverCard.heading')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'common.close')}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg text-t3 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t(locale, 'trucks.driverCard.nameLabel')} value={f.name} onChange={set('name')} placeholder={t(locale, 'trucks.driverCard.namePlaceholder')} />
          <Field label={t(locale, 'trucks.driverCard.phoneLabel')} value={f.phone} onChange={set('phone')} placeholder="(555) 123-4567" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t(locale, 'trucks.driverCard.truckRowLabel')} value={f.truckNumber} onChange={set('truckNumber')} placeholder="1935" />
          <Field label={t(locale, 'trucks.driverCard.trailerRowLabel')} value={f.trailerNumber} onChange={set('trailerNumber')} placeholder="53487" />
          <div className="col-span-2 sm:col-span-1">
            <Field label={t(locale, 'trucks.driverCard.vinRowLabel')} value={f.vin} onChange={set('vin')} placeholder="3AKJJHDR8TSWJ2407" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t(locale, 'trucks.driverCard.cdlLabel')} value={f.cdlExpiry} onChange={set('cdlExpiry')} type="date" />
          <Field label={t(locale, 'trucks.driverCard.medcardLabel')} value={f.medcardExpiry} onChange={set('medcardExpiry')} type="date" />
        </div>
        <div className="flex gap-2">
          <Button variant="primary" disabled={pending} onClick={save}>
            {pending ? t(locale, 'trucks.common.saving') : t(locale, 'trucks.common.save')}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-base text-t2 transition-colors hover:text-white"
          >
            {t(locale, 'trucks.common.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Буфер закрыт (нет https или отказано в разрешении) — молчать нельзя, иначе
 * человек решит, что скопировалось, и отправит брокеру пустоту. */
function copyText(text: string, okMessage: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => notify('ok', okMessage))
    .catch(() => notify('warn', text))
}

// Отдельный компонент, а не функция внутри формы: новая функция на каждый рендер
// заставляла React пересоздавать <input> на каждое нажатие клавиши — терялись фокус
// и буквы.
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
    'w-full min-w-0 rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1.5 text-base text-white outline-none focus:border-haul-500'
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-t2 font-medium">{label}</span>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} className={input} />
    </label>
  )
}
