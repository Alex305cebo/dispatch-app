'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setTgDispatcherAccess } from './actions'
import { notify } from '@/lib/notify'

export function TgAccessToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      const res = await setTgDispatcherAccess(!enabled)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', enabled ? 'Telegram снова только для админа' : 'Telegram открыт диспетчерам')
        router.refresh()
      }
    })
  }

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-white/[0.015] px-3 py-2">
      <p className="text-[12px] leading-relaxed text-white/65">
        {enabled
          ? 'Диспетчеры видят раздел Telegram и могут им пользоваться.'
          : 'Сейчас Telegram виден только админу. Включи, чтобы открыть диспетчерам.'}
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
        {enabled ? 'Выключить' : 'Включить'}
      </button>
    </div>
  )
}
