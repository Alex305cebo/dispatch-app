'use client'

// Копия переключателя открытого доступа: та же форма, тот же вес слова «выключить».
// Витрине демо нужно, клиентской копии — нет.

import { useTransition } from 'react'
import { setDemoPublic } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function DemoToggle({ enabled }: { enabled: boolean }) {
  const locale = useLocale()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      const res = await setDemoPublic(!enabled)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', enabled ? t(locale, 'admin.demoPublic.turnedOff') : t(locale, 'admin.demoPublic.turnedOn'))
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[12.5px] leading-relaxed text-white/65">
        {enabled ? t(locale, 'admin.demoPublic.currentlyOn') : t(locale, 'admin.demoPublic.currentlyOff')}
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
        {enabled ? t(locale, 'admin.demoPublic.turnOff') : t(locale, 'admin.demoPublic.turnOn')}
      </button>
    </div>
  )
}
