'use client'

// Guarded delete: a ✕ that opens a password confirm and calls a server action
// (id, password). Used for documents and loads — anything whose removal must land
// in the Журнал. The action verifies the SIGNED-IN user's own login password and
// stamps the audit row with their name, so there's no "кто удалил" field to type.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'

export function DeleteButton({
  action,
  id,
  title,
  note,
}: {
  action: (id: number, password: string) => Promise<{ error?: string } | void>
  id: number
  title: string
  note?: string // e.g. "и его расчёты удалятся насовсем."
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    setErr('')
    start(async () => {
      const res = await action(id, password)
      if (res?.error) setErr(res.error)
      else {
        notify('ok', 'Удалено', title)
        setOpen(false)
        setPassword('')
        router.refresh()
      }
    })
  }

  const field =
    'w-full rounded-xl border border-white/10 bg-ink-950/70 px-3 py-2 text-[14px] text-white outline-none focus:border-haul-500'

  return (
    <>
      <button
        title="Удалить"
        onClick={() => setOpen(true)}
        className="shrink-0 text-[13px] text-white/35 transition-colors hover:text-bad-400"
      >
        ✕
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold">Удалить</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
              «{title}» {note ?? 'удалится насовсем.'} Введи свой пароль — тот, которым входишь.
              Запись, кто удалил, останется в Журнале.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && password && submit()}
                placeholder="Твой пароль"
                className={field}
              />
            </div>
            {err && <p className="mt-2 text-[12.5px] text-bad-400">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 text-[13px] text-white/70 transition-colors hover:text-white"
              >
                Отмена
              </button>
              <button
                disabled={pending || !password}
                onClick={submit}
                className="rounded-xl bg-bad-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-bad-400 disabled:opacity-40"
              >
                {pending ? 'Удаляю…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
