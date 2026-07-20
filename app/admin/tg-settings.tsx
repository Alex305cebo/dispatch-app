'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { setTgVisibility, type TgAdminStatus } from './actions'
import { notify } from '@/lib/notify'

export function TgSettings({ status }: { status: TgAdminStatus | { error: string } }) {
  if ('error' in status) {
    return <p className="text-[13px] text-bad-400">Не удалось загрузить: {status.error}</p>
  }
  if (!status.connected) {
    return (
      <p className="text-[13px] text-white/65">
        Telegram ещё не подключён.{' '}
        <Link href="/telegram" className="text-haul-400 hover:underline">
          Подключить →
        </Link>
      </p>
    )
  }
  return <ConnectedTgSettings account={status.account} dialogs={status.dialogs} hidden={status.hidden} />
}

function ConnectedTgSettings({
  account,
  dialogs,
  hidden,
}: Omit<Extract<TgAdminStatus, { connected: true }>, 'connected'>) {
  const [hiddenSet, setHiddenSet] = useState(new Set(hidden))
  const [pending, start] = useTransition()
  const dirty = hiddenSet.size !== hidden.length || hidden.some((id) => !hiddenSet.has(id))

  function toggle(id: string) {
    setHiddenSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function save() {
    start(async () => {
      const res = await setTgVisibility([...hiddenSet])
      if (res?.error) notify('error', res.error)
      else notify('ok', 'Список чатов обновлён')
    })
  }

  return (
    <div>
      {account && (
        <p className="mb-3 text-[12.5px] text-white/65">
          Подключён аккаунт: <span className="font-medium text-white/85">{account.name}</span>
          {account.phone && <span className="text-white/45"> · +{account.phone}</span>}
        </p>
      )}

      {dialogs.length === 0 ? (
        <p className="text-[13px] text-white/55">Диалогов не видно на этом аккаунте.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {dialogs.map((d) => (
            <label
              key={d.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/6 bg-white/[0.015] px-3 py-2 select-none"
            >
              <input
                type="checkbox"
                checked={!hiddenSet.has(d.id)}
                onChange={() => toggle(d.id)}
                className="size-4 shrink-0 accent-haul-500"
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">{d.name}</span>
              {!d.isUser && (
                <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] text-white/55">
                  группа
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      <button
        disabled={pending || !dirty}
        onClick={save}
        className="mt-3 rounded-lg bg-haul-500 px-4 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
      >
        {pending ? 'Сохраняю…' : 'Сохранить'}
      </button>
    </div>
  )
}
