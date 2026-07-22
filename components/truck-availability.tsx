'use client'

// Three-state availability pill row on the truck page: Активен / В ремонте / Отпуск.
// An unavailable truck is badged across the app and excluded from "свободно" counts.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setTruckAvailability } from '@/app/actions'
import { notify } from '@/lib/notify'

const OPTIONS = [
  { value: 'active', label: '✓ Активен' },
  { value: 'repair', label: '🔧 В ремонте' },
  { value: 'vacation', label: '🌴 Отпуск' },
] as const

export function TruckAvailability({
  truckId,
  current,
}: {
  truckId: number
  current: 'repair' | 'vacation' | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const active = current ?? 'active'

  function pick(value: (typeof OPTIONS)[number]['value']) {
    if (value === active) return
    start(async () => {
      const res = await setTruckAvailability(truckId, value)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', value === 'active' ? 'Трак снова в строю' : value === 'repair' ? 'Помечен: в ремонте' : 'Помечен: отпуск')
        router.refresh()
      }
    })
  }

  return (
    <div className="inline-flex overflow-hidden rounded-full border border-white/10 text-[11.5px] font-semibold">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={pending}
          onClick={() => pick(o.value)}
          className={`px-3 py-1.5 transition-colors disabled:opacity-50 ${
            active === o.value
              ? o.value === 'active'
                ? 'bg-good-500/20 text-good-400'
                : 'bg-warn-400/20 text-warn-400'
              : 'text-white/55 hover:bg-white/5 hover:text-white/85'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
