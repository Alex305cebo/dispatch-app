'use client'

// Click the name in the sidebar → small popover with the account's own settings.
// Room to grow later; for now just what every account needs day one: its own
// password change, without waiting on an admin to reset it.

import { useState, useTransition } from 'react'
import { changeMyPassword } from '@/app/account/actions'
import { notify } from '@/lib/notify'
import type { CurrentUser } from '@/lib/session'

const ROLE_LABEL = { admin: 'Админ', dispatcher: 'Диспетчер' } as const

export function UserPanel({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const res = await changeMyPassword(pw)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', 'Пароль изменён')
        setPw('')
        setOpen(false)
      }
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="truncate text-[12px] font-medium text-white/85 transition-colors hover:text-white"
      >
        {user.name}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-white/10 bg-ink-900 p-3.5 shadow-2xl">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="text-[11px] text-white/45">{ROLE_LABEL[user.role]}</p>

          <div className="mt-3 border-t border-white/8 pt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
              Сменить пароль
            </p>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Новый пароль, минимум 8 символов"
              className="w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500"
            />
            <button
              disabled={pending || pw.length < 8}
              onClick={save}
              className="mt-2 w-full rounded-lg bg-haul-500 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
            >
              {pending ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
