'use client'

import { useTransition } from 'react'
import { setOpenAccess } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function OpenAccessToggle({ enabled }: { enabled: boolean }) {
  const locale = useLocale()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      const res = await setOpenAccess(!enabled)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', enabled ? t(locale, 'admin.openAccess.turnedOff') : t(locale, 'admin.openAccess.turnedOn'))
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[12.5px] leading-relaxed text-white/65">
        {enabled ? t(locale, 'admin.openAccess.currentlyOn') : t(locale, 'admin.openAccess.currentlyOff')}
      </p>
      <button
        disabled={pending}
        onClick={toggle}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
          enabled
            ? 'border-bad-500/25 text-bad-400 hover:border-bad-500/50'
            : 'border-good-500/25 text-good-400 hover:border-good-500/50'
        }`}
      >
        {enabled ? t(locale, 'admin.openAccess.turnOff') : t(locale, 'admin.openAccess.turnOn')}
      </button>
    </div>
  )
}
