'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setOpenAccess } from './actions'
import { notify } from '@/lib/notify'

export function OpenAccessToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      const res = await setOpenAccess(!enabled)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', enabled ? 'Вход снова обязателен' : 'Открытый доступ включён')
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[12.5px] leading-relaxed text-white/65">
        {enabled
          ? 'Сейчас приложение открыто для всех, без входа — кроме этой панели.'
          : 'Сейчас нужен вход. Включи, чтобы приложение открылось всем без пароля.'}
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
