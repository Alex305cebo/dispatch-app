'use client'

// Кто ведёт эту машину — выбор прямо на странице трака.
//
// Закрепление есть и в админке списком, но спрашивают о нём здесь: диспетчера
// меняют, когда открыт трак, а не когда открыт список пользователей. Один трак —
// один ответственный, поэтому выбор одиночный: новый диспетчер забирает машину у
// прежнего сразу, отвязывать вручную не нужно.

import { useState, useTransition } from 'react'
import { setTruckDispatcher } from '@/app/admin/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function TruckDispatcher({
  truckId,
  current,
  users,
}: {
  truckId: number
  current: number | null
  users: { id: number; name: string; role: 'admin' | 'dispatcher' }[]
}) {
  const locale = useLocale()
  const [value, setValue] = useState<string>(current == null ? '' : String(current))
  const [pending, start] = useTransition()

  function save(next: string) {
    const before = value
    setValue(next)
    start(async () => {
      const res = await setTruckDispatcher(truckId, next === '' ? null : Number(next))
      if (res?.error) {
        // Возвращаем прежнее значение: список, который показывает не то, что в базе,
        // хуже отказа — по нему потом решают, кому звонить.
        setValue(before)
        notify('error', res.error)
        return
      }
      notify('ok', t(locale, 'admin.assign.saved'))
    })
  }

  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-white/45">
        {t(locale, 'trucks.detail.dispatcherPick')}
      </span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        className="rounded-lg border border-white/12 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500 disabled:opacity-50"
      >
        <option value="">{t(locale, 'admin.assign.free')}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  )
}
