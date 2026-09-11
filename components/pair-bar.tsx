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
  truck: { id: number; label: string; short?: string } | null
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
  // Телефон: без заголовка-капса и без «TRK-/TRL-» — иконка говорит, что это, подсветка
  // говорит, где ты; остаётся одна строка «Morgan T. · DEMO-512», маршрут — до двух.
  const cap = 'hidden truncate text-[11px] font-medium uppercase tracking-wider text-white/60 sm:block'
  // Без «block» в общем классе: он перебивал «hidden», и на телефоне показывались
  // обе подписи разом. Видимость — только через варианты sm:/max-sm:.
  const label = 'font-semibold max-sm:line-clamp-2 max-sm:text-[12px] max-sm:leading-[1.2] sm:block sm:truncate'
  const truckInner = (
    <>
      <Truck strokeWidth={2.2} className="size-4 shrink-0 text-haul-400 sm:size-[18px]" />
      <span className="min-w-0">
        <span className={cap}>{truckCap}</span>
        <span className="line-clamp-2 text-[12px] font-semibold leading-[1.2] sm:hidden">
          {truck?.short ?? truck?.label ?? t(locale, 'pair.noTruck')}
        </span>
        <span className="hidden truncate font-semibold sm:block">{truck?.label ?? t(locale, 'pair.noTruck')}</span>
      </span>
    </>
  )
  const loadInner = (
    <>
      <Package strokeWidth={2.2} className="size-4 shrink-0 text-good-400 sm:size-[18px]" />
      <span className="min-w-0">
        <span className={cap}>
          {loadCap}
          {load?.sub ? ` · ${load.sub}` : ''}
        </span>
        <span className={label}>{load?.label ?? t(locale, 'pair.noLoad')}</span>
      </span>
    </>
  )

  return (
    <div className="sticky top-[var(--sticky-top)] z-30 mt-2 flex gap-1.5 rounded-xl border border-white/8 bg-ink-950/85 p-1 backdrop-blur sm:mt-3 sm:gap-2 sm:rounded-2xl sm:p-1.5">
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
