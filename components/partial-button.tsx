'use client'

import { useTransition } from 'react'
import { Layers, X } from 'lucide-react'
import { setLoadPartial } from '@/app/actions'
import { notify } from '@/lib/notify'
import { t, type Locale } from '@/lib/i18n'

/**
 * «Едут вместе — это партиал» одним нажатием, там, где вопрос возникает: в
 * предупреждении о стыковке двух грузов трака. Галочка в «Деталях» груза оставалась, но
 * её не находили. `undo` — маленькое «партиал ✕» в общем задании, снять ошибочную отметку.
 */
export function PartialButton({
  loadId,
  locale,
  undo = false,
  strong = false,
}: {
  loadId: number
  locale: Locale
  /** Снять отметку (метка в ленте задания) вместо «отметить». */
  undo?: boolean
  /** Пикап раньше выгрузки — кнопка заметнее, это почти наверняка партиал. */
  strong?: boolean
}) {
  const [busy, start] = useTransition()
  const run = () =>
    start(async () => {
      const res = await setLoadPartial(loadId, !undo)
      if (res?.error) notify('error', res.error)
      else notify('ok', t(locale, undo ? 'partial.undone' : 'partial.done'))
    })
  if (undo)
    return (
      <button
        type="button"
        disabled={busy}
        onClick={run}
        title={t(locale, 'partial.unmark')}
        className="inline-flex items-center gap-0.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-t2 transition-colors hover:bg-bad-500/15 hover:text-bad-400 disabled:opacity-50 max-md:min-h-7"
      >
        {t(locale, 'partial.tag')}
        <X size={10} strokeWidth={3} />
      </button>
    )
  return (
    <button
      type="button"
      disabled={busy}
      onClick={run}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-colors disabled:opacity-50 max-md:min-h-10 ${
        strong ? 'bg-haul-500 text-white hover:bg-haul-400' : 'border border-haul-500/40 text-haul-300 hover:bg-haul-500/10'
      }`}
    >
      <Layers size={14} strokeWidth={2.3} />
      {busy ? '…' : t(locale, 'partial.mark')}
    </button>
  )
}
