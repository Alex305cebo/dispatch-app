'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tgAttachToLoad } from './actions'
import { notify } from '@/lib/notify'

export function TgAttachButton({
  chatId,
  msgId,
  phone,
}: {
  chatId: string
  msgId: number
  phone: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)

  return (
    <button
      disabled={pending || done}
      onClick={() =>
        start(async () => {
          const res = await tgAttachToLoad(chatId, msgId, phone)
          if ('error' in res) notify('error', res.error)
          else {
            notify('ok', `Добавлено к грузу ${res.loadRoute}`)
            setDone(true)
            router.refresh()
          }
        })
      }
      className={`mb-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors disabled:cursor-default ${
        done
          ? 'bg-good-500/15 text-good-400'
          : 'bg-white/10 text-white/80 hover:bg-white/16 disabled:opacity-60'
      }`}
    >
      {done ? '✓ В грузе' : pending ? 'Добавляю…' : '📎 В груз водителя'}
    </button>
  )
}
