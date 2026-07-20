'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { setChatTruck, setTgVisibility, type TgAdminStatus } from './actions'
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
  return (
    <ConnectedTgSettings
      account={status.account}
      dialogs={status.dialogs}
      shown={status.shown}
      chatTruck={status.chatTruck}
      trucks={status.trucks}
    />
  )
}

function ConnectedTgSettings({
  account,
  dialogs,
  shown,
  chatTruck,
  trucks,
}: Omit<Extract<TgAdminStatus, { connected: true }>, 'connected'>) {
  const [shownSet, setShownSet] = useState(new Set(shown))
  const [pending, start] = useTransition()
  const dirty = shownSet.size !== shown.length || shown.some((id) => !shownSet.has(id))
  const [truckPending, startTruck] = useTransition()

  function assignTruck(chatId: string, value: string) {
    startTruck(async () => {
      const res = await setChatTruck(chatId, value ? Number(value) : null)
      if (res?.error) notify('error', res.error)
    })
  }

  function toggle(id: string) {
    setShownSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function save() {
    start(async () => {
      const res = await setTgVisibility([...shownSet])
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
      <p className="mb-3 text-[12px] text-white/50">
        Отмеченные диалоги видны диспетчерам на /telegram. Всё остальное — не видно нигде, даже мельком.
      </p>

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
                checked={shownSet.has(d.id)}
                onChange={() => toggle(d.id)}
                className="size-4 shrink-0 accent-haul-500"
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">{d.name}</span>
              {!d.isUser && (
                <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] text-white/55">
                  группа
                </span>
              )}
              <select
                disabled={truckPending}
                defaultValue={chatTruck[d.id] ?? ''}
                onChange={(e) => assignTruck(d.id, e.target.value)}
                className="shrink-0 rounded-md border border-white/10 bg-ink-800 px-1.5 py-1 text-[11px] disabled:opacity-40"
              >
                <option value="">— трак —</option>
                {trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.number}
                  </option>
                ))}
              </select>
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
