'use client'

// A quiet, no-frills GPS refresh for spots that don't need RefreshFleetButton's full
// "live"/auto-poll treatment (that one polls every 30s on its own — fine for the one
// /tracking page, too much GPS-vendor traffic to repeat on every truck page opened).

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshFleetStatus } from '@/app/actions'
import { notify } from '@/lib/notify'

export function SmallRefreshButton() {
  const router = useRouter()
  const [pending, start] = useTransition()

  function refresh(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    start(async () => {
      const res = await refreshFleetStatus()
      if (res.errors.length) notify('warn', res.errors.join(' · '))
      else notify('ok', res.updated > 0 ? `Обновлено траков: ${res.updated}` : 'Новых данных нет')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={refresh}
      title="Обновить GPS"
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-[12px] text-white/55 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
    >
      <span className={pending ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
    </button>
  )
}
