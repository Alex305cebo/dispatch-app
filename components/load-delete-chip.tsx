'use client'

// «Удалить груз» на плашке «Трак ⇄ Груз» (Alex, 06.11.2026: «Где кнопка, чтобы
// удалить груз?» — корзина в плитке статуса проявлялась только под мышью, и её не
// нашли). Та же защита, что везде: слово DELETE, запись в «Журнал». После удаления —
// на карточку трака: этого груза больше нет. В демо не показывается.

import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { DeleteButton } from '@/components/delete-button'
import { deleteLoad } from '@/app/actions'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function LoadDeleteChip({ id, title, truckId }: { id: number; title: string; truckId: number | null }) {
  const locale = useLocale()
  const router = useRouter()
  return (
    <DeleteButton
      action={deleteLoad}
      id={id}
      title={title}
      note={t(locale, 'loads.page.deleteNote')}
      className="relative z-10 inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-bad-500/40 bg-bad-500/[0.06] px-2 text-sm font-semibold text-bad-400 transition-colors hover:border-bad-400 hover:bg-bad-500/15 sm:h-10 sm:px-2.5"
      label={
        <>
          <Trash2 size={15} strokeWidth={2.25} aria-hidden />
          <span className="hidden sm:inline">{t(locale, 'common.delete')}</span>
          <span className="sr-only sm:hidden">{t(locale, 'loadStatus.deleteWrong')}</span>
        </>
      }
      onDone={() => router.push(truckId ? `/trucks/${truckId}` : '/loads')}
    />
  )
}
