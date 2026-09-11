'use client'

// Картинка трака в шапке карточки. Сменить — маленькая иконка камеры в правом
// нижнем углу: окно с готовыми моделями (public/trucks, lib/truck-models.ts),
// «Загрузить своё фото» и «Стандартная». Показывается выбранное последним.
import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Check, ImageUp, RotateCcw, X } from 'lucide-react'
import { saveTruckModel, saveTruckPhoto } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { TRUCK_MODELS, truckModelSrc } from '@/lib/truck-models'

export function TruckPhoto({
  truckId,
  hasPhoto,
  model = null,
  alt,
  className = '',
  fill = false,
  demo = false,
}: {
  truckId: number
  hasPhoto: boolean
  /** Демо только для просмотра: выбор показывается сразу, но в базу не пишется. */
  demo?: boolean
  /** Ключ готовой картинки (lib/truck-models.ts), если выбрана. */
  model?: string | null
  alt: string
  className?: string
  /** Заполнить родителя (position: relative у него): трак во всю высоту, прижат к низу. */
  fill?: boolean
}) {
  const locale = useLocale()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(hasPhoto)
  const [picked, setPicked] = useState<string | null>(model)
  // Штамп после загрузки: адрес тот же, а картинка новая — иначе браузер покажет
  // старую из кэша (cache-control у роута час).
  const [stamp, setStamp] = useState(0)
  const src = custom
    ? `/api/truck-photo/${truckId}${stamp ? `?v=${stamp}` : ''}`
    : picked
      ? truckModelSrc(picked)
      : '/truck.png'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function upload(file: File | undefined) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    start(async () => {
      const res = await saveTruckPhoto(truckId, fd)
      if (res?.error) notify('error', res.error)
      else {
        setCustom(true)
        setPicked(null)
        setStamp(Date.now())
        setOpen(false)
        notify('ok', t(locale, 'trucks.photo.saved'))
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  function choose(key: string | null) {
    // Демо: сохранять нельзя, но выбор видно сразу — иначе нажатие выглядело как
    // «ничего не происходит».
    if (demo) {
      setPicked(key)
      setCustom(false)
      setOpen(false)
      notify('ok', t(locale, 'trucks.photo.demoNote'))
      return
    }
    start(async () => {
      const res = await saveTruckModel(truckId, key)
      if (res?.error) notify('error', res.error)
      else {
        setPicked(key)
        setCustom(false)
        setOpen(false)
        notify('ok', t(locale, 'trucks.photo.saved'))
      }
    })
  }

  const current = custom ? null : picked

  return (
    <div className={`block shrink-0 ${fill ? 'absolute inset-0' : 'relative'} ${className}`}>
      <img
        src={src}
        alt={alt}
        className={`${fill ? 'h-full w-full object-contain object-bottom p-2 sm:object-right sm:p-4' : 'w-full object-contain'} ${pending ? 'opacity-50' : ''}`}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t(locale, 'trucks.photo.change')}
        aria-label={t(locale, 'trucks.photo.change')}
        className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full border border-white/15 bg-ink-900/80 text-white/70 transition-colors hover:border-white/35 hover:text-white max-md:size-10"
      >
        {pending ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Camera size={15} strokeWidth={2.2} />
        )}
      </button>

      {/* Окно — в body через портал: шапка трака обрезает содержимое (overflow-hidden). */}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 sm:p-6"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t(locale, 'trucks.photo.pickTitle')}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-white/12 bg-ink-900 shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <h2 className="text-base font-semibold leading-6 text-white/90">{t(locale, 'trucks.photo.pickTitle')}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t(locale, 'trucks.photo.close')}
                  className="flex size-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white max-md:size-11"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3">
                {TRUCK_MODELS.map((m) => {
                  const sel = current === m.key
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={pending}
                      onClick={() => choose(m.key)}
                      className={`relative flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors ${
                        sel ? 'border-haul-400/70 bg-haul-500/10' : 'border-white/10 hover:border-white/30 hover:bg-white/[0.03]'
                      }`}
                    >
                      <img src={truckModelSrc(m.key)} alt={m.label} loading="lazy" className="aspect-[2/1] w-full object-contain" />
                      <span className="text-[12px] font-medium leading-4 text-white/80">{m.label}</span>
                      {sel && (
                        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-haul-500 text-white">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                <label
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[13px] font-medium text-white/80 hover:border-white/30 hover:text-white max-md:min-h-11 ${
                    pending ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                  }`}
                >
                  <ImageUp size={15} strokeWidth={2.2} />
                  {t(locale, 'trucks.photo.upload')}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={pending}
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || (!custom && !picked)}
                  onClick={() => choose(null)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[13px] font-medium text-white/70 hover:border-white/30 hover:text-white disabled:opacity-40 max-md:min-h-11"
                >
                  <RotateCcw size={14} strokeWidth={2.2} />
                  {t(locale, 'trucks.photo.default')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
