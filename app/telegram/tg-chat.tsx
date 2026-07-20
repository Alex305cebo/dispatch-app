'use client'

// Send box + auto-refresh for an open conversation. Messages themselves are
// server-rendered; this only writes and nudges the page to re-fetch.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tgSendMessage } from './actions'
import { notify } from '@/lib/notify'

// A message to a real driver can't be unsent — this popup is a deliberate speed
// bump, not real security (the code is fixed and shown right there). Picking a
// random equivalent expression each time means it can't be muscle-memoried away.
const PIN_EXPRESSIONS = ['100 + 20 + 3', '100 + 10 + 13', '150 - 27', '61 + 62']
const PIN = 123

export function TgSendBox({ chatId }: { chatId: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [expr, setExpr] = useState('')
  const [answer, setAnswer] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

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

  function openConfirm() {
    setExpr(PIN_EXPRESSIONS[Math.floor(Math.random() * PIN_EXPRESSIONS.length)]!)
    setAnswer('')
    setPinError(null)
    setConfirming(true)
  }

  function confirmSend() {
    if (Number(answer) !== PIN) {
      setPinError('Неверный код.')
      return
    }
    setConfirming(false)
    send()
  }

  return (
    <div className="relative border-t border-white/8 p-3">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
              e.preventDefault()
              openConfirm()
            }
          }}
          placeholder="Сообщение водителю…"
          className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[14px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15"
        />
        <button
          disabled={pending || !text.trim()}
          onClick={openConfirm}
          className="shrink-0 rounded-xl bg-haul-500 px-4 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
        >
          {pending ? '…' : '➤'}
        </button>
      </div>

      {confirming && (
        <div className="absolute inset-x-3 bottom-full z-10 mb-2 rounded-xl border border-white/10 bg-ink-900 p-3.5 shadow-2xl">
          <p className="text-[12.5px] text-white/70">
            Сообщение уйдёт водителю — отменить будет нельзя. Чтобы отправить, введи код:
          </p>
          <p className="nums mt-1 text-[15px] font-bold text-haul-300">{expr}</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              inputMode="numeric"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmSend()}
              placeholder="Код"
              className="w-24 rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[14px] text-white outline-none focus:border-haul-500"
            />
            <button
              onClick={confirmSend}
              className="rounded-lg bg-haul-500 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400"
            >
              Отправить
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-[12px] text-white/60 hover:text-white/85"
            >
              Отмена
            </button>
          </div>
          {pinError && <p className="mt-1.5 text-[12px] text-bad-400">{pinError}</p>}
        </div>
      )}
    </div>
  )
}
