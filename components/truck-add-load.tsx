'use client'

// «＋ Груз» в шапке трака — одна кнопка вместо трёх (план «Порядок в TMS», 10/09/26).
// Раньше груз заводился кнопкой «Создать груз из Rate Con» в шапке, отдельной плиткой
// «Новый груз из rate con» и кнопкой «Добавить груз» у списка грузов. Теперь кнопка
// открывает окно: Rate Con выбрать или перетащить (тот же разбор, components/truck-rc-drop.tsx)
// или завести груз вручную. Файл можно бросить прямо на кнопку — разбор начнётся сразу.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PencilLine, Plus } from 'lucide-react'
import { Button } from './button'
import { TruckRcDrop } from './truck-rc-drop'
import { useLocale } from './locale-provider'
import { t } from '@/lib/i18n'

export function TruckAddLoad({
  truckId,
  currentLoad = null,
}: {
  truckId: number
  currentLoad?: { id: number; route: string } | null
}) {
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[] | undefined>(undefined)
  const [over, setOver] = useState(false)
  const close = () => {
    setOpen(false)
    setFiles(undefined)
    // Груз мог уже завестись — список грузов трака и плитки должны его показать.
    router.refresh()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <span
        className={`rounded-xl ${over ? 'ring-2 ring-haul-300' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const picked = Array.from(e.dataTransfer.files ?? [])
          if (!picked.length) return
          setFiles(picked)
          setOpen(true)
        }}
      >
        <Button variant="primary" icon={<Plus size={15} strokeWidth={2.6} />} onClick={() => setOpen(true)}>
          {t(locale, 'trucks.addLoad.btn')}
        </Button>
      </span>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t(locale, 'trucks.addLoad.title')}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
            onClick={(e) => e.target === e.currentTarget && close()}
          >
            <div className="panel flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-auto p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <h2 className="min-w-0 flex-1 truncate text-lg font-semibold leading-6 text-t1">{t(locale, 'trucks.addLoad.title')}</h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t(locale, 'common.close')}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg text-t3 transition-colors hover:bg-white/10 hover:text-t1"
                >
                  ✕
                </button>
              </div>
              <TruckRcDrop truckId={truckId} currentLoad={currentLoad} files={files} />
              {/* Без Rate Con — та же форма, что «＋ Груз» в «Грузах», с этим траком. */}
              <Link
                href={`/loads/new?truck=${truckId}`}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-base font-semibold text-t2 transition-colors hover:border-white/25 hover:text-t1 max-md:min-h-11"
              >
                <PencilLine size={15} strokeWidth={2.2} className="text-haul-300" />
                {t(locale, 'trucks.addLoad.manual')}
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
