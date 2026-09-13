// «Нет POD у прошлого груза» — в шапке груза и на карточке трака.
//
// Пока трак везёт следующий рейс, про предыдущий легко забыть: он доставлен, в работе
// уже другой, а без POD брокеру не выставить счёт и деньги стоят. Раньше это было
// видно только на карточке самого старого груза и в колокольчике через полтора дня.
// Серверный компонент: список собирает lib/loads.ts loadsMissingPod.

import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import type { LoadRecord } from '@/lib/map'
import { usDate } from '@/lib/fmt'
import { t, type Locale } from '@/lib/i18n'

const SHOWN = 3

export function MissingPodBanner({ loads, locale, className = '' }: { loads: LoadRecord[]; locale: Locale; className?: string }) {
  if (!loads.length) return null
  return (
    <div className={`rounded-xl border border-warn-400/40 bg-warn-400/[0.08] px-3 py-2.5 ${className}`}>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warn-300">
        <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />
        {loads.length === 1
          ? t(locale, 'missingPod.one')
          : t(locale, 'missingPod.many').replace('{n}', String(loads.length))}
      </p>
      <ul className="mt-1.5 space-y-1">
        {loads.slice(0, SHOWN).map((l) => (
          <li key={l.id}>
            <Link
              href={`/loads/${l.id}`}
              className="group flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-1 py-0.5 text-[13px] transition-colors hover:bg-white/[0.04] max-md:min-h-11"
            >
              <span className="font-medium text-white/90">
                {l.origin ?? '—'} → {l.destination ?? '—'}
              </span>
              {l.referenceId && <span className="nums text-white/55">#{l.referenceId}</span>}
              {l.deliveryDate && (
                <span className="nums text-white/55">
                  · {t(locale, 'missingPod.delivered')} {usDate(l.deliveryDate)}
                </span>
              )}
              <span className="ml-auto font-semibold text-warn-300 group-hover:underline">
                {t(locale, 'missingPod.upload')} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {loads.length > SHOWN && (
        <p className="mt-1 px-1 text-[12px] text-white/50">
          {t(locale, 'missingPod.more').replace('{n}', String(loads.length - SHOWN))}
        </p>
      )}
      <p className="mt-1 px-1 text-[11.5px] text-white/50">{t(locale, 'missingPod.why')}</p>
    </div>
  )
}
