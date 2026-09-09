import { AlertTriangle, ListChecks } from 'lucide-react'
import { t, type Locale } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'

/**
 * Что делать, когда следующий груз забукирован, а водитель ещё везёт текущий.
 * Ситуация штатная (рейт-кон на следующий рейс приходит за день-два), но раньше
 * диспетчер не понимал, почему на траке «два груза» и что переключать. Ответ: ничего;
 * ниже — три вещи, которые проверить. Пикап раньше выгрузки — красным.
 */
export function QueuedLoadHint({
  locale,
  current,
  next,
  compact = false,
}: {
  locale: Locale
  current: {
    origin: string | null
    destination: string | null
    deliveryDate: string | null
    deliveryTime: string | null
  }
  next: { pickupDate: string | null; pickupTime: string | null }
  /** Под строкой «Следующий груз» на карточке трака — без заголовка и рамки. */
  compact?: boolean
}) {
  const tight = !!(
    current.deliveryDate &&
    next.pickupDate &&
    next.pickupDate.slice(0, 10) < current.deliveryDate.slice(0, 10)
  )
  const delivery = current.deliveryTime || usDate(current.deliveryDate) || '—'
  const pickup = next.pickupTime || usDate(next.pickupDate) || '—'
  const steps = [
    t(locale, 'queued.step1'),
    t(locale, 'queued.step2').replace('{delivery}', delivery).replace('{pickup}', pickup),
    t(locale, 'queued.step3'),
  ]
  return (
    <div
      className={`${compact ? 'mt-2' : 'mt-4'} rounded-xl border px-3 py-2.5 text-[12.5px] ${
        tight ? 'border-bad-500/35 bg-bad-500/[0.07]' : 'border-haul-500/30 bg-haul-500/[0.06]'
      }`}
    >
      {!compact && (
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          <ListChecks size={13} strokeWidth={2.2} className="text-haul-300" />
          {t(locale, 'queued.title').replace('{route}', `${current.origin ?? '—'} → ${current.destination ?? '—'}`)}
        </p>
      )}
      {tight && (
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-bad-300">
          <AlertTriangle size={13} strokeWidth={2.4} />
          {t(locale, 'queued.tight').replace('{delivery}', delivery).replace('{pickup}', pickup)}
        </p>
      )}
      <ol className="list-decimal space-y-0.5 pl-4 leading-relaxed text-white/70">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  )
}
