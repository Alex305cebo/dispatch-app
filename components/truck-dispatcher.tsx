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
  bare = false,
}: {
  truckId: number
  current: number | null
  users: { id: number; name: string; role: 'admin' | 'dispatcher' }[]
  /** Без своей подписи — подпись даёт поле шапки трака. */
  bare?: boolean
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

  const select = (
    <select
      value={value}
      disabled={pending}
      aria-label={t(locale, 'trucks.detail.dispatcherPick')}
      onChange={(e) => save(e.target.value)}
      className={
        bare
          ? 'h-8 max-w-full cursor-pointer rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-[13px] font-medium text-t1 outline-none transition-colors hover:border-white/30 focus:border-haul-500 disabled:opacity-50 max-md:h-10'
          : 'rounded-lg border border-white/12 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500 disabled:opacity-50'
      }
    >
      <option value="">{t(locale, 'admin.assign.free')}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  )
  if (bare) return select

  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-t2 font-medium">
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
