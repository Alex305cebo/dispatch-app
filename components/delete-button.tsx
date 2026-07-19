'use client'

// Guarded delete: a ✕ that opens a name + PIN confirm and calls a server action
// (id, who, pin). Used for documents and loads — anything whose removal must land
// in the Журнал with who did it. The action itself validates the PIN and audits.

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { notify } from '@/lib/notify'

const NAME_KEY = 'doc_actor' // remembered per device — same person deletes docs & loads

export function DeleteButton({
  action,
  id,
  title,
  note,
}: {
  action: (id: number, who: string, pin: string) => Promise<{ error?: string } | void>
  id: number
  title: string
  note?: string // e.g. "и его расчёты удалятся насовсем."
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  useEffect(() => {
    if (open) setName(localStorage.getItem(NAME_KEY) ?? '')
  }, [open])

  function submit() {
    setErr('')
    start(async () => {
      const res = await action(id, name, pin)
      if (res?.error) setErr(res.error)
      else {
        localStorage.setItem(NAME_KEY, name.trim())
        notify('ok', 'Удалено', title)
        setOpen(false)
        setPin('')
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
              «{title}» {note ?? 'удалится насовсем.'} Впиши имя и PIN — запись, кто удалил,
              останется в Журнале.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Твоё имя"
                className={field}
              />
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name.trim() && pin && submit()}
                placeholder="PIN"
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
                disabled={pending || !name.trim() || !pin}
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
