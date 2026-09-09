'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Radio } from 'lucide-react'
import { addTruckFromEld } from '@/app/actions'
import { Button } from '@/components/button'
import { useLocale } from '@/components/locale-provider'
import { notify } from '@/lib/notify'
import { t } from '@/lib/i18n'

/** Юниты, которые ZigZag уже показывает, а в парке их нет: по кнопке заводятся сами,
 * с водителем из ELD и экономикой последнего трака. Место — над списком траков. */
export function EldNewTrucks({ units }: { units: { unit: string; driver: string | null; location: string | null }[] }) {
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()
  if (units.length === 0) return null
  return (
    <div className="mb-4 rounded-2xl border border-haul-500/40 bg-haul-500/[0.08] p-3 sm:p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-haul-200">
        <Radio size={13} strokeWidth={2.2} />
        {t(locale, 'trucks.eldNew.title')}
      </div>
      <p className="mt-1 text-[12.5px] text-white/65">{t(locale, 'trucks.eldNew.hint')}</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {units.map((u) => (
          <li key={u.unit} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-ink-950/40 px-3 py-2">
            <span className="nums text-[15px] font-bold">{u.unit}</span>
            {u.driver && <span className="text-[13px] text-white/85">{u.driver}</span>}
            {u.location && <span className="truncate text-[12px] text-white/45">📍 {u.location}</span>}
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              icon={<Plus size={14} strokeWidth={2.5} />}
              className="ml-auto"
              onClick={() =>
                start(async () => {
                  const r = await addTruckFromEld(u.unit)
                  if ('error' in r) return notify('error', r.error)
                  notify('ok', t(locale, 'trucks.eldNew.added').replace('{n}', u.unit))
                  router.push(`/trucks/${r.id}`)
                })
              }
            >
              {t(locale, 'trucks.eldNew.add')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
