'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshFleetStatus } from '@/app/actions'
import { notify } from '@/lib/notify'

/** Pulls fresh GPS from Live Share (+ vendor API if configured) right now, instead
 * of waiting for the 5-min external cron. */
export function RefreshFleetButton() {
  const router = useRouter()
  const [pending, start] = useTransition()

  function refresh() {
    start(async () => {
      const res = await refreshFleetStatus()
      if (res.errors.length) notify('warn', res.errors.join(' · '))
      else notify('ok', res.updated > 0 ? `Обновлено траков: ${res.updated}` : 'Новых данных нет')
      router.refresh()
    })
  }

  return (
    <button
      disabled={pending}
      onClick={refresh}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
    >
      <span className={pending ? 'animate-spin' : ''}>↻</span>
      {pending ? 'Обновляю…' : 'Обновить'}
    </button>
  )
}
