'use client'

// Three-state availability pill row on the truck page: Active / In repair / On vacation.
// An unavailable truck is badged across the app and excluded from "free" counts.

import { useTransition } from 'react'
import { setTruckAvailability } from '@/app/actions'
import { notify } from '@/lib/notify'
import { t, type Locale } from '@/lib/i18n'

const OPTIONS = [
  { value: 'active', key: 'trucks.avail.active' },
  { value: 'repair', key: 'trucks.avail.repair' },
  { value: 'vacation', key: 'trucks.avail.vacation' },
] as const

export function TruckAvailability({
  truckId,
  current,
  locale = 'en',
}: {
  truckId: number
  current: 'repair' | 'vacation' | null
  locale?: Locale
}) {
  const [pending, start] = useTransition()
  const active = current ?? 'active'

  function pick(value: (typeof OPTIONS)[number]['value']) {
    if (value === active) return
    start(async () => {
      const res = await setTruckAvailability(truckId, value)
      if (res?.error) notify('error', res.error)
      else {
        notify(
          'ok',
          value === 'active'
            ? t(locale, 'trucks.avail.backInService')
            : value === 'repair'
              ? t(locale, 'trucks.avail.markedRepair')
              : t(locale, 'trucks.avail.markedVacation'),
        )
      }
    })
  }

  return (
    <div className="inline-flex h-8 overflow-hidden rounded-lg border border-white/12 bg-white/[0.03] text-[12.5px] font-semibold max-md:h-10">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={pending}
          onClick={() => pick(o.value)}
          className={`px-3 transition-colors disabled:opacity-50 [&+&]:border-l [&+&]:border-white/10 ${
            active === o.value
              ? o.value === 'active'
                ? 'bg-good-500/20 text-good-400'
                : 'bg-warn-400/20 text-warn-400'
              : 'text-t3 hover:bg-white/5 hover:text-t1'
          }`}
        >
          {t(locale, o.key)}
        </button>
      ))}
    </div>
  )
}
