import Link from 'next/link'
import { Package, Truck } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { t } from '@/lib/i18n'

/**
 * Переключатель «Трак ⇄ Груз» — липкая полоса наверху обеих карточек. Диспетчер
 * между ними ходит весь день: посмотрел, где трак, открыл его груз, вернулся к
 * траку. Раньше обратный путь был ссылкой в 13px внутри шапки, которую искали.
 * Текущая половина подсвечена и не кликается, вторая — крупная кнопка на пару.
 * Пары нет (трак без груза, груз без трака) — половина серая, с подписью.
 */
export function PairBar({
  current,
  truck,
  load,
  locale,
}: {
  current: 'truck' | 'load'
  truck: { id: number; label: string } | null
  load: { id: number; label: string; sub?: string | null } | null
  locale: Locale
}) {
  const base =
    'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px] transition-colors'
  const active = `${base} border-haul-500/50 bg-haul-500/[0.14] text-white`
  const link = `${base} border-white/12 bg-ink-900/70 text-white/85 hover:border-haul-400/60 hover:bg-haul-500/10 hover:text-white`
  const empty = `${base} border-white/8 text-white/40`

  const truckInner = (
    <>
      <Truck size={17} strokeWidth={2.2} className="shrink-0 text-haul-400" />
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wider text-white/50">{t(locale, 'pair.truck')}</span>
        <span className="block truncate font-semibold">{truck?.label ?? t(locale, 'pair.noTruck')}</span>
      </span>
    </>
  )
  const loadInner = (
    <>
      <Package size={17} strokeWidth={2.2} className="shrink-0 text-good-400" />
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wider text-white/50">
          {t(locale, 'pair.load')}
          {load?.sub ? ` · ${load.sub}` : ''}
        </span>
        <span className="block truncate font-semibold">{load?.label ?? t(locale, 'pair.noLoad')}</span>
      </span>
    </>
  )

  return (
    <div className="sticky top-2 z-30 mt-3 flex gap-2 rounded-2xl border border-white/8 bg-ink-950/85 p-1.5 backdrop-blur">
      {current === 'truck' ? (
        <div className={active} aria-current="page">{truckInner}</div>
      ) : truck ? (
        <Link href={`/trucks/${truck.id}`} className={link}>{truckInner}</Link>
      ) : (
        <div className={empty}>{truckInner}</div>
      )}
      <span className="self-center text-white/30">⇄</span>
      {current === 'load' ? (
        <div className={active} aria-current="page">{loadInner}</div>
      ) : load ? (
        <Link href={`/loads/${load.id}`} className={link}>{loadInner}</Link>
      ) : (
        <div className={empty}>{loadInner}</div>
      )}
    </div>
  )
}
