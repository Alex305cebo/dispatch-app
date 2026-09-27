'use client'

// «Создать груз из Rate Con» в шапке трака: выбрал файл — и сразу тот же разбор, что в
// плитке «Новый груз из rate con» (components/truck-rc-drop.tsx), в окне поверх страницы.
// Плитка бывает ниже экрана или скрыта в раскладке, а кнопка всегда на виду.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { FilePlus2 } from 'lucide-react'
import { TruckRcDrop } from './truck-rc-drop'
import { useLocale } from './locale-provider'
import { t } from '@/lib/i18n'

export function TruckRcButton({
  truckId,
  currentLoad = null,
  className,
}: {
  truckId: number
  currentLoad?: { id: number; route: string } | null
  className: string
}) {
  const locale = useLocale()
  const router = useRouter()
  const [files, setFiles] = useState<File[] | null>(null)
  const close = () => {
    setFiles(null)
    // Груз уже создан — список грузов трака и плитки должны его показать.
    router.refresh()
  }

  useEffect(() => {
    if (!files) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <label className={`${className} cursor-pointer`}>
        <FilePlus2 size={14} strokeWidth={2.2} className="text-haul-300" />
        {t(locale, 'trucks.detail.createFromRc')}
        <input
          type="file"
          accept="application/pdf,.pdf,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (picked.length) setFiles(picked)
          }}
        />
      </label>
      {files &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t(locale, 'trucks.detail.createFromRc')}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
          >
            <div className="panel flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-auto p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <h2 className="min-w-0 flex-1 truncate text-lg font-semibold leading-6 text-t1">
                  {t(locale, 'trucks.detail.createFromRc')}
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t(locale, 'common.close')}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg text-t3 transition-colors hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <TruckRcDrop truckId={truckId} currentLoad={currentLoad} files={files} />
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
