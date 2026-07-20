'use client'

// Send box + auto-refresh for an open conversation. Messages themselves are
// server-rendered; this only writes and nudges the page to re-fetch.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { tgSendMessage, verifyTgSendPin } from './actions'
import { notify } from '@/lib/notify'

// A message to a real driver can't be unsent — the PIN is a deliberate speed bump
// (same shared PIN as guarded deletes), not per-message: once entered, sending stays
// unlocked for a couple minutes so a real conversation doesn't need a PIN per line.
const UNLOCK_MS = 2 * 60 * 1000
const UNLOCK_KEY = 'tg_send_unlocked_until'

function readUnlock(): number {
  return Number(sessionStorage.getItem(UNLOCK_KEY) ?? 0)
}

export function TgSendBox({ chatId }: { chatId: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinPending, startPin] = useTransition()
  const [unlockedUntil, setUnlockedUntil] = useState(0)
  const [now, setNow] = useState(0)

  // Ticks the countdown shown on the send button; also picks up an unlock set from
  // another chat (the window is page-wide, via sessionStorage, not per-conversation).
  useEffect(() => {
    setUnlockedUntil(readUnlock())
    const t = setInterval(() => {
      setNow(Date.now())
      setUnlockedUntil(readUnlock())
    }, 1000)
    setNow(Date.now())
    return () => clearInterval(t)
  }, [])

  // Poll while the chat is open — ~15s keeps it "live" without hammering Telegram.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000)
    return () => clearInterval(t)
  }, [router])

  const unlocked = now > 0 && now < unlockedUntil
  const remaining = unlocked ? Math.ceil((unlockedUntil - now) / 1000) : 0

  const send = () =>
    start(async () => {
      const res = await tgSendMessage(chatId, text)
      if (res?.error) notify('error', res.error)
      else {
        setText('')
        router.refresh()
      }
    })

  function trySend() {
    if (!text.trim()) return
    if (unlocked) {
      send()
      return
    }
    setPin('')
    setPinError(null)
    setConfirming(true)
  }

  function confirmSend() {
    startPin(async () => {
      const res = await verifyTgSendPin(pin)
      if ('error' in res) {
        setPinError(res.error)
        return
      }
      const until = Date.now() + UNLOCK_MS
      sessionStorage.setItem(UNLOCK_KEY, String(until))
      setUnlockedUntil(until)
      setConfirming(false)
      send()
    })
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
              trySend()
            }
          }}
          placeholder="Сообщение водителю…"
          className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[14px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15"
        />
        <button
          disabled={pending || !text.trim()}
          onClick={trySend}
          title={unlocked ? `Отправка разблокирована ещё ${remaining}с` : 'Нужен PIN для отправки'}
          className={`relative shrink-0 rounded-xl px-4 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
            unlocked ? 'bg-haul-500 hover:bg-haul-400' : 'bg-white/10 text-white/70 hover:bg-white/16'
          }`}
        >
          {pending ? '…' : unlocked ? '➤' : '🔒'}
          {unlocked && (
            <span className="nums absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-ink-950 px-1 text-[9px] text-white/50">
              {remaining}с
            </span>
          )}
        </button>
      </div>

      {confirming && (
        <div className="absolute inset-x-3 bottom-full z-10 mb-2 rounded-xl border border-white/10 bg-ink-900 p-3.5 shadow-2xl">
          <p className="text-[12.5px] text-white/70">
            Сообщение уйдёт водителю — отменить будет нельзя. Введи PIN, чтобы разблокировать отправку на 2 минуты:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pin && confirmSend()}
              placeholder="PIN"
              className="w-24 rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[14px] text-white outline-none focus:border-haul-500"
            />
            <button
              disabled={pinPending || !pin}
              onClick={confirmSend}
              className="rounded-lg bg-haul-500 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
            >
              {pinPending ? '…' : 'Разблокировать'}
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
