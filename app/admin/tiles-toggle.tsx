'use client'

import { useTransition } from 'react'
import { setTilesEnabled } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/** Выключатель перестановки плиток. Пока выключен — кнопки «Переставить» нет ни на
 *  одном разделе, и блоки стоят в сохранённом порядке как обычные карточки. */
export function TilesToggle({ enabled }: { enabled: boolean }) {
  const locale = useLocale()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      const res = await setTilesEnabled(!enabled)
      if (res?.error) notify('error', res.error)
      else notify('ok', enabled ? t(locale, 'admin.tiles.turnedOff') : t(locale, 'admin.tiles.turnedOn'))
    })
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm leading-relaxed text-t2">
        {enabled ? t(locale, 'admin.tiles.currentlyOn') : t(locale, 'admin.tiles.currentlyOff')}
      </p>
      <button
        disabled={pending}
        onClick={toggle}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
          enabled
            ? 'border-bad-500/25 text-bad-400 hover:border-bad-500/50'
            : 'border-good-500/25 text-good-400 hover:border-good-500/50'
        }`}
      >
        {enabled ? t(locale, 'admin.tiles.turnOff') : t(locale, 'admin.tiles.turnOn')}
      </button>
    </div>
  )
}
