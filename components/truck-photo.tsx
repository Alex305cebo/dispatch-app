'use client'

// Картинка трака в шапке карточки — и кнопка её сменить. Нажатие открывает выбор
// файла; своё фото хранится в truck_meta.truck_photo, без него — /truck.png.
import { useRef, useState, useTransition } from 'react'
import { saveTruckPhoto } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TruckPhoto({ truckId, hasPhoto, alt }: { truckId: number; hasPhoto: boolean; alt: string }) {
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
      className={`group relative mt-0.5 block h-9 w-12 shrink-0 sm:h-12 sm:w-16 ${pending ? 'opacity-50' : 'cursor-pointer'}`}
    >
      <img src={src} alt={alt} className="size-full object-contain" />
      <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/0 text-[9px] font-medium text-transparent transition-colors group-hover:bg-black/50 group-hover:text-white">
        {pending ? '…' : t(locale, 'trucks.photo.overlay')}
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
