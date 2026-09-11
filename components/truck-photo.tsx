'use client'

// Картинка трака в шапке карточки — и кнопка её сменить. Нажатие открывает выбор
// файла; своё фото хранится в truck_meta.truck_photo, без него — /truck.png.
import { useRef, useState, useTransition } from 'react'
import { Camera } from 'lucide-react'
import { saveTruckPhoto } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TruckPhoto({
  truckId,
  hasPhoto,
  alt,
  className = '',
  fill = false,
}: {
  truckId: number
  hasPhoto: boolean
  alt: string
  className?: string
  /** Заполнить родителя (position: relative у него): трак во всю высоту, прижат к низу. */
  fill?: boolean
}) {
  const locale = useLocale()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  // Штамп после загрузки: адрес тот же, а картинка новая — иначе браузер покажет
  // старую из кэша (cache-control у роута час).
  const [stamp, setStamp] = useState(0)
  const src = hasPhoto || stamp ? `/api/truck-photo/${truckId}${stamp ? `?v=${stamp}` : ''}` : '/truck.png'

  function pick(file: File | undefined) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    start(async () => {
      const res = await saveTruckPhoto(truckId, fd)
      if (res?.error) notify('error', res.error)
      else {
        setStamp(Date.now())
        notify('ok', t(locale, 'trucks.photo.saved'))
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  // Сама картинка не кнопка и не затемняется при наведении — сменить фото можно только
  // маленькой иконкой в правом нижнем углу.
  return (
    <div className={`block shrink-0 ${fill ? 'absolute inset-0' : 'relative'} ${className}`}>
      <img
        src={src}
        alt={alt}
        className={`${fill ? 'h-full w-full object-contain object-bottom p-2 sm:object-right sm:p-4' : 'w-full object-contain'} ${pending ? 'opacity-50' : ''}`}
      />
      <label
        title={t(locale, 'trucks.photo.change')}
        aria-label={t(locale, 'trucks.photo.change')}
        className={`absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full border border-white/15 bg-ink-900/80 text-white/70 transition-colors hover:border-white/35 hover:text-white max-md:size-10 ${
          pending ? 'pointer-events-none' : 'cursor-pointer'
        }`}
      >
        {pending ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Camera size={15} strokeWidth={2.2} />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={pending}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
    </div>
  )
}
