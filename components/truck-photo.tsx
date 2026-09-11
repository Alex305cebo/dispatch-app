'use client'

// Картинка трака в шапке карточки — и кнопка её сменить. Нажатие открывает выбор
// файла; своё фото хранится в truck_meta.truck_photo, без него — /truck.png.
import { useRef, useState, useTransition } from 'react'
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

  return (
    <label
      title={t(locale, 'trucks.photo.change')}
      className={`group block shrink-0 ${fill ? 'absolute inset-0' : 'relative'} ${className} ${pending ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <img
        src={src}
        alt={alt}
        className={fill ? 'h-full w-full object-contain object-bottom p-2 sm:object-right-bottom sm:p-3' : 'w-full object-contain'}
      />
      <span className="absolute inset-0 flex items-end justify-center rounded-xl bg-black/0 pb-1 text-[12px] font-medium text-transparent transition-colors group-hover:bg-black/40 group-hover:text-white">
        {pending ? '…' : t(locale, 'trucks.photo.change')}
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
