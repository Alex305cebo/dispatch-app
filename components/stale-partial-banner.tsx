'use client'

import { useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { setLoadPartial, setStopState } from '@/app/actions'
import { notify } from '@/lib/notify'
import { usDate } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'

export type StalePartial = {
  id: number
  label: string
  deliveryDate: string
  /** Номер последней выгрузки — её и отмечает «Выгрузился». */
  lastSeq: number
}

/**
 * Партиал, про который забыли: выгрузка прошла, а груз всё ещё «в пути» — и его точки
 * попадают в задание трака вместе с новым грузом (у водителя тоже). Одним нажатием
 * закрыть («Выгрузился» — та же отметка, что у водителя) или снять отметку «партиал».
 */
export function StalePartialBanner({ items, locale }: { items: StalePartial[]; locale: Locale }) {
  const [busy, start] = useTransition()
  if (!items.length) return null
  const btn =
    'inline-flex min-h-8 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-50 max-md:min-h-10'
  return (
    <div className="mb-3 flex flex-col gap-2">
      {items.map((p) => (
        <div key={p.id} className="rounded-xl border border-warn-400/35 bg-warn-400/[0.07] px-3.5 py-2.5">
          <p className="flex items-start gap-1.5 text-[13px] leading-snug text-white/85">
            <AlertTriangle size={14} strokeWidth={2.4} className="mt-0.5 shrink-0 text-warn-400" />
            <span>
              {t(locale, 'stalePartial.text').replace('{load}', p.label).replace('{date}', usDate(p.deliveryDate))}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2 pl-5">
            <button
              type="button"
              disabled={busy}
              className={`${btn} bg-haul-500 text-white hover:bg-haul-400`}
              onClick={() =>
                start(async () => {
                  const res = await setStopState(p.id, p.lastSeq, 'done')
                  if (res?.error) notify('error', res.error)
                })
              }
            >
              {t(locale, 'stalePartial.delivered')}
            </button>
            <button
              type="button"
              disabled={busy}
              className={`${btn} border border-white/15 text-white/80 hover:border-white/35 hover:text-white`}
              onClick={() =>
                start(async () => {
                  const res = await setLoadPartial(p.id, false)
                  if (res?.error) notify('error', res.error)
                  else notify('ok', t(locale, 'partial.undone'))
                })
              }
            >
              {t(locale, 'stalePartial.notPartial')}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
