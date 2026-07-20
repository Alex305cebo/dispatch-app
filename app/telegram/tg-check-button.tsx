'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tgCheckNow } from './actions'
import { notify } from '@/lib/notify'

export function TgCheckButton() {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await tgCheckNow()
          if ('error' in res) notify('error', res.error)
          else {
            notify('ok', `Прикреплено: ${res.attached} · пропущено: ${res.skipped} · напоминаний: ${res.nudged}`)
            router.refresh()
          }
        })
      }
      className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
    >
      {pending ? 'Проверяю…' : 'Проверить документы сейчас'}
    </button>
  )
}
