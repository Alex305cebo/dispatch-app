'use client'

import { Button } from '@/components/button'
// Self-service curation of MY connected account: which of my chats show up on
// /telegram, and which truck each belongs to. Same idea the admin panel used to do
// globally — now every user does it for their own account.

import { useState, useTransition } from 'react'
import { setMyChatTruck, setMyShownChats } from './actions'
import { notify } from '@/lib/notify'
import type { TgDialog } from '@/lib/telegram'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TgChatSettings({
  dialogs,
  shown,
  chatTruck,
  trucks,
}: {
  dialogs: TgDialog[]
  shown: string[]
  chatTruck: Record<string, number>
  trucks: { id: number; number: string }[]
}) {
  const locale = useLocale()
  const [shownSet, setShownSet] = useState(new Set(shown))
  const [pending, start] = useTransition()
  const [truckPending, startTruck] = useTransition()
  const dirty = shownSet.size !== shown.length || shown.some((id) => !shownSet.has(id))

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
      const res = await setMyShownChats([...shownSet])
      if (res?.error) notify('error', res.error)
      else notify('ok', t(locale, 'telegram.settings.saved'))
    })
  }

  function assignTruck(chatId: string, value: string) {
    startTruck(async () => {
      const res = await setMyChatTruck(chatId, value ? Number(value) : null)
      if (res?.error) notify('error', res.error)
    })
  }

  return (
    <details className="panel mb-3 p-4">
      <summary className="cursor-pointer text-[13px] font-semibold text-white/85">
        {t(locale, 'telegram.settings.summary')}
        <span className="ml-2 text-[12px] font-normal text-white/50">
          {t(locale, 'telegram.settings.marked').replace('{a}', String(shownSet.size)).replace('{b}', String(dialogs.length))}
        </span>
      </summary>

      <p className="mt-2 text-[12px] text-white/55">
        {t(locale, 'telegram.settings.explain')}
      </p>

      {dialogs.length === 0 ? (
        <p className="mt-3 text-[13px] text-white/55">{t(locale, 'telegram.settings.noneVisible')}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
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
                  {t(locale, 'telegram.settings.group')}
                </span>
              )}
              <select
                disabled={truckPending}
                defaultValue={chatTruck[d.id] ?? ''}
                onChange={(e) => assignTruck(d.id, e.target.value)}
                className="shrink-0 rounded-md border border-white/10 bg-ink-800 px-1.5 py-1 text-[11px] disabled:opacity-40"
              >
                <option value="">{t(locale, 'telegram.settings.pickTruck')}</option>
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

      <Button variant="primary" size="sm" className="mt-3" disabled={pending || !dirty}
        onClick={save}>
        {pending ? t(locale, 'telegram.settings.saving') : t(locale, 'telegram.settings.save')}
      </Button>
    </details>
  )
}
