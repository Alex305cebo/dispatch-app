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
      className="mb-1 flex items-center gap-1 text-[11px] text-white/45 underline decoration-dotted transition-colors hover:text-white/75 disabled:no-underline disabled:opacity-70"
    >
      {done ? '✓ В грузе' : pending ? 'Добавляю…' : '+ В груз водителя'}
    </button>
  )
}
