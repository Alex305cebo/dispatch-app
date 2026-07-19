'use client'

// Send box + auto-refresh for an open conversation. Messages themselves are
// server-rendered; this only writes and nudges the page to re-fetch.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tgSendMessage } from './actions'
import { notify } from '@/lib/notify'

export function TgSendBox({ chatId }: { chatId: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [pending, start] = useTransition()

  // Poll while the chat is open — ~15s keeps it "live" without hammering Telegram.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000)
    return () => clearInterval(t)
  }, [router])

  const send = () =>
    start(async () => {
      const res = await tgSendMessage(chatId, text)
      if (res?.error) notify('error', res.error)
      else {
        setText('')
        router.refresh()
      }
    })

  return (
    <div className="flex gap-2 border-t border-white/8 p-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
            e.preventDefault()
            send()
          }
        }}
        placeholder="Сообщение водителю…"
        className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[14px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15"
      />
      <button
        disabled={pending || !text.trim()}
        onClick={send}
        className="shrink-0 rounded-xl bg-haul-500 px-4 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
      >
        {pending ? '…' : '➤'}
      </button>
    </div>
  )
}
