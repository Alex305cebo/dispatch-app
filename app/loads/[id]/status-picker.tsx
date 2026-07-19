'use client'

import { useTransition } from 'react'
import { setStatus } from '@/app/actions'
import { STATUSES, type LoadStatus } from '@/lib/map'
import { notify } from '@/lib/notify'
import { STATUS_LABEL } from '@/components/status'

export function StatusPicker({ id, current }: { id: number; current: LoadStatus }) {
  const [pending, start] = useTransition()

  return (
    <div className="flex flex-wrap gap-1.5" aria-busy={pending}>
      {STATUSES.map((s) => (
        <button
          key={s}
          disabled={pending || s === current}
          onClick={() =>
            start(async () => {
              await setStatus(id, s)
              notify('ok', `Груз #${id}: ${STATUS_LABEL[s]}`)
            })
          }
          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-default ${
            s === current
              ? 'bg-haul-500 text-white'
              : 'bg-white/6 text-white/72 hover:bg-white/10 hover:text-white/90 disabled:opacity-40'
          }`}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  )
}
