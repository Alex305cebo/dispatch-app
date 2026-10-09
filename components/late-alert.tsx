'use client'

import { useOptimistic, useTransition } from 'react'
import { Check } from 'lucide-react'
import { setLateAck } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/**
 * «Опаздывает» на странице груза. Красная тревога с кнопкой «Всё ок, брокер в курсе»:
 * диспетчер позвонил водителю и предупредил брокера — нажал, и плитка становится
 * спокойной пометкой «Брокер в курсе». Отметка привязана к остановке и её окну
 * (stopKey), поэтому следующая опоздавшая точка снова красная. «Вернуть» — на случай
 * промаха пальцем.
 */
export function LateAlert({
  loadId,
  stopKey,
  acked,
  where,
}: {
  loadId: number
  stopKey: string
  acked: boolean
  /** «Пикап · West Jefferson, OH · окно закрылось 18ч 39м назад» — уже на языке страницы. */
  where: string
}) {
  const locale = useLocale()
  const [busy, start] = useTransition()
  const [shown, setShown] = useOptimistic(acked)
  const save = (on: boolean) =>
    start(async () => {
      setShown(on)
      const res = await setLateAck(loadId, on ? stopKey : null)
      if (res?.error) notify('error', res.error)
    })
  const btn =
    'inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors disabled:opacity-50 max-md:min-h-10'

  if (shown)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-base">
        <span className="inline-flex items-center gap-1.5 font-semibold text-good-400">
          <Check size={16} strokeWidth={2.6} />
          {t(locale, 'loadDetail.lateAcked')}
        </span>
        <span className="min-w-0 flex-1 text-t3">{where}</span>
        <button type="button" disabled={busy} onClick={() => save(false)} className={`${btn} border border-white/15 text-t2 hover:border-white/35 hover:text-white`}>
          {t(locale, 'loadDetail.lateAckUndo')}
        </button>
      </div>
    )

  return (
    <div className="rounded-xl border border-bad-500/30 bg-bad-500/[0.08] px-4 py-3 text-base">
      <span className="font-semibold text-bad-400">{t(locale, 'loads.dash.late')}</span>{' '}
      <span className="text-t2">
        {where}. {t(locale, 'loadDetail.lateHint')}
      </span>
      <div className="mt-2">
        <button type="button" disabled={busy} onClick={() => save(true)} className={`${btn} border border-white/15 text-t1 hover:border-white/35 hover:text-white`}>
          <Check size={15} strokeWidth={2.6} />
          {t(locale, 'loadDetail.lateAck')}
        </button>
      </div>
    </div>
  )
}
