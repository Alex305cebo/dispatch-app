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
  // На телефоне — одна строка на половину: короткая подпись, мелкие отступы. Три
  // строки «ОТКРЫТЬ КАРТОЧКУ ТРАКА →» на 180px ширины съедали пол-экрана.
  const base =
    'flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1 text-[12.5px] transition-colors sm:gap-2.5 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[13px]'
  const active = `${base} border-haul-500/50 bg-haul-500/[0.14] text-white`
  const link = `${base} border-white/12 bg-ink-900/70 text-white/85 hover:border-haul-400/60 hover:bg-haul-500/10 hover:text-white`
  const empty = `${base} border-white/8 text-white/40`

  // Подпись говорит прямо, что это и что случится по клику: «Ты на карточке трака» /
  // «Открыть карточку груза →». Голые «Трак» и «Груз» читались как заголовки, а не
  // как переключатель.
  const truckCap =
    current === 'truck' ? t(locale, 'pair.hereTruck') : truck ? t(locale, 'pair.openTruck') : t(locale, 'pair.truck')
  const loadCap =
    current === 'load' ? t(locale, 'pair.hereLoad') : load ? t(locale, 'pair.openLoad') : t(locale, 'pair.load')
  const here = t(locale, 'pair.here')
  const truckShort = current === 'truck' ? `${t(locale, 'pair.truck')} · ${here}` : `${t(locale, 'pair.truck')} →`
  const loadShort = current === 'load' ? `${t(locale, 'pair.load')} · ${here}` : `${t(locale, 'pair.load')} →`
  const cap = 'block truncate text-[10px] font-medium uppercase tracking-wider text-white/60 sm:text-[11px]'
  const truckInner = (
    <>
      <Truck strokeWidth={2.2} className="size-4 shrink-0 text-haul-400 sm:size-[18px]" />
      <span className="min-w-0">
        <span className={`${cap} sm:hidden`}>{truckShort}</span>
        <span className={`${cap} hidden sm:block`}>{truckCap}</span>
        <span className="block truncate font-semibold">{truck?.label ?? t(locale, 'pair.noTruck')}</span>
      </span>
    </>
  )
  const loadInner = (
    <>
      <Package strokeWidth={2.2} className="size-4 shrink-0 text-good-400 sm:size-[18px]" />
      <span className="min-w-0">
        <span className={`${cap} sm:hidden`}>{loadShort}</span>
        <span className={`${cap} hidden sm:block`}>
          {loadCap}
          {load?.sub ? ` · ${load.sub}` : ''}
        </span>
        <span className="block truncate font-semibold">{load?.label ?? t(locale, 'pair.noLoad')}</span>
      </span>
    </>
  )

  return (
    <div className="sticky top-1 z-30 mt-2 flex gap-1.5 rounded-xl border border-white/8 bg-ink-950/85 p-1 backdrop-blur sm:top-2 sm:mt-3 sm:gap-2 sm:rounded-2xl sm:p-1.5">
      {current === 'truck' ? (
        <div className={active} aria-current="page">{truckInner}</div>
      ) : truck ? (
        <Link href={`/trucks/${truck.id}`} className={link}>{truckInner}</Link>
      ) : (
        <div className={empty}>{truckInner}</div>
      )}
      <span className="hidden self-center text-white/30 sm:inline">⇄</span>
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
