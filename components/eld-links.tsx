'use client'

// Tracking links (one per truck) → we pull GPS from them, no vendor key needed.
// Deliberately generic and instruction-free in the UI: the owner sets this up once,
// and no third-party product should be named or explained on their screen.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveEldShareLinks } from '@/app/actions'
import { notify } from '@/lib/notify'

export function EldLinks({ count }: { count: number }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()

  function save() {
    start(async () => {
      const res = await saveEldShareLinks(text)
      if ('error' in res) notify('error', res.error)
      else {
        notify(
          res.updated > 0 ? 'ok' : 'warn',
          `Ссылок сохранено: ${res.saved}, обновлено траков: ${res.updated}` +
            (res.errors.length ? ` · ошибки: ${res.errors.length}` : ''),
        )
        router.refresh()
      }
    })
  }

  return (
    <div className="mb-4 rounded-xl border border-white/8 bg-ink-900/50 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-[12px] font-semibold text-white/70"
      >
        <span>Отслеживание траков {count > 0 && `· подключено ${count}`}</span>
        <span className="text-white/45">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] leading-relaxed text-white/55">
            Вставь ссылки отслеживания траков — по одной на строку. Координаты и скорость
            обновляются сами.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Ссылка на трак 1&#10;Ссылка на трак 2"
            className="w-full rounded-lg border border-white/8 bg-ink-900/80 px-3 py-2 text-[12px] text-white outline-none focus:border-haul-500"
          />
          <button
            disabled={pending || !text.trim()}
            onClick={save}
            className="mt-2 rounded-lg bg-haul-500 px-4 py-2 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
          >
            {pending ? 'Сохраняю и обновляю…' : 'Сохранить и обновить'}
          </button>
        </div>
      )}
    </div>
  )
}
