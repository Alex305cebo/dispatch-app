'use client'

import { useOptimistic, useTransition } from 'react'
import { Flag } from 'lucide-react'
import { setLoadPriority } from '@/app/actions'
import { LOAD_PRIORITIES, type LoadPriority } from '@/lib/map'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { PRIORITY_KEY } from '@/lib/loads-dashboard'

/** Цвет флага — один ряд на чип в списке и на кнопки выбора. */
export const PRIORITY_TONE: Record<LoadPriority, string> = {
  caution: 'bg-warn-400/15 text-warn-400 ring-warn-400/30',
  important: 'bg-orange-400/15 text-orange-400 ring-orange-400/30',
  critical: 'bg-bad-500/15 text-bad-400 ring-bad-400/30',
}

/** Чип «Критичный» в строке груза; без флага — ничего. */
export function PriorityChip({ priority, locale }: { priority: LoadPriority | null; locale: Parameters<typeof t>[0] }) {
  if (!priority) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${PRIORITY_TONE[priority]}`}>
      <Flag size={11} strokeWidth={2.5} />
      {t(locale, PRIORITY_KEY[priority])}
    </span>
  )
}

/** Выбор флага на странице груза: обычный / внимание / важный / критичный. Как в Alvys —
 * пометка «за этим следить» поднимает груз наверх очереди внимания. */
export function PriorityPicker({ loadId, value }: { loadId: number; value: LoadPriority | null }) {
  const locale = useLocale()
  const [busy, start] = useTransition()
  const [shown, setShown] = useOptimistic(value)
  const pick = (p: LoadPriority | null) =>
    start(async () => {
      setShown(p)
      const res = await setLoadPriority(loadId, p)
      if (res?.error) notify('error', res.error)
    })
  const btn = 'min-h-8 rounded-full px-2.5 text-[12px] font-medium ring-1 transition-colors disabled:opacity-60 max-md:min-h-9'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] text-t3">{t(locale, 'loads.priority.label')}</span>
      <button
        type="button"
        disabled={busy}
        aria-pressed={shown === null}
        onClick={() => pick(null)}
        className={`${btn} ${shown === null ? 'bg-white/[0.1] text-white ring-white/20' : 'text-t3 ring-white/10 hover:text-white'}`}
      >
        {t(locale, 'loads.priority.none')}
      </button>
      {LOAD_PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          disabled={busy}
          aria-pressed={shown === p}
          onClick={() => pick(p)}
          className={`${btn} ${shown === p ? PRIORITY_TONE[p] : 'text-t3 ring-white/10 hover:text-white'}`}
        >
          {t(locale, PRIORITY_KEY[p])}
        </button>
      ))}
    </div>
  )
}
