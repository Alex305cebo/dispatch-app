import Link from 'next/link'
import type { ReactNode } from 'react'
import { Package, Send, Truck } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { t } from '@/lib/i18n'
import { RateConButton } from '@/components/ratecon-button'
import { PAIR_CHIP, PairCopyChip } from '@/components/pair-chips'

/**
 * Переключатель «Трак ⇄ Груз» — липкая полоса наверху обеих карточек. Диспетчер
 * между ними ходит весь день: посмотрел, где трак, открыл его груз, вернулся к
 * траку. Раньше обратный путь был ссылкой в 13px внутри шапки, которую искали.
 * Текущая половина подсвечена и не кликается, вторая — крупная кнопка на пару.
 * Пары нет (трак без груза, груз без трака) — половина серая, с подписью.
 *
 * Справа в каждой половине — по две кнопки (Alex, 26.10.2026): у трака «где сейчас»
 * (копирует «Manteno, IL 60950») и чат водителя в Telegram, у груза — Rate Con и
 * апдейт брокеру в буфер. Ничего не отправляют сами — только копия или открытие.
 */
export function PairBar({
  current,
  truck,
  load,
  locale,
  place,
  chatHref,
  rateConId,
  brokerUpdate,
}: {
  current: 'truck' | 'load'
  truck: { id: number; label: string; short?: string } | null
  load: { id: number; label: string; sub?: string | null } | null
  locale: Locale
  /** «Manteno, IL 60950» — место трака по GPS (lib/us-zip.ts placeZip). */
  place?: string | null
  /** Чат водителя в Telegram — только если Telegram подключён. */
  chatHref?: string | null
  /** Rate Con груза пары. */
  rateConId?: number | null
  /** Готовый текст апдейта брокеру (pairBrokerUpdate). */
  brokerUpdate?: string | null
}) {
  // На телефоне — одна строка на половину: короткая подпись, мелкие отступы. Три
  // строки «ОТКРЫТЬ КАРТОЧКУ ТРАКА →» на 180px ширины съедали пол-экрана.
  // Половина — рамка, внутри ссылка на карточку и кнопки справа. Кнопки не внутри
  // ссылки: кнопка в <a> — невалидный HTML, и щелчок по ней уводил бы на карточку.
  const half =
    'flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-lg border p-1 text-sm transition-colors sm:flex-nowrap sm:gap-1.5 sm:rounded-xl sm:p-1.5 sm:text-base'
  const inner = 'flex min-w-[6.5rem] flex-1 items-center gap-2 rounded-md px-1 py-0.5 sm:gap-2.5 sm:px-1.5 sm:py-0.5'
  const active = `${half} border-haul-500/50 bg-haul-500/[0.14] text-white`
  const link = `${half} border-white/12 bg-ink-900/70 text-t1 hover:border-haul-400/60 hover:bg-haul-500/10 hover:text-white`
  const empty = `${half} border-white/8 text-t3`

  // Подпись говорит прямо, что это и что случится по клику: «Ты на карточке трака» /
  // «Открыть карточку груза →». Голые «Трак» и «Груз» читались как заголовки, а не
  // как переключатель.
  const truckCap =
    current === 'truck' ? t(locale, 'pair.hereTruck') : truck ? t(locale, 'pair.openTruck') : t(locale, 'pair.truck')
  const loadCap =
    current === 'load' ? t(locale, 'pair.hereLoad') : load ? t(locale, 'pair.openLoad') : t(locale, 'pair.load')
  // Телефон: без заголовка-капса и без «TRK-/TRL-» — иконка говорит, что это, подсветка
  // говорит, где ты; остаётся одна строка «Morgan T. · DEMO-512», маршрут — до двух.
  const cap = 'hidden truncate text-xs font-medium text-t2 sm:block'
  // Без «block» в общем классе: он перебивал «hidden», и на телефоне показывались
  // обе подписи разом. Видимость — только через варианты sm:/max-sm:.
  const label = 'font-semibold max-sm:line-clamp-2 max-sm:text-sm max-sm:leading-[1.2] sm:block sm:truncate'
  const truckInner = (
    <>
      <Truck strokeWidth={2.2} className="size-4 shrink-0 text-haul-400 sm:size-[18px]" />
      <span className="min-w-0">
        <span className={cap}>{truckCap}</span>
        <span className="line-clamp-2 text-sm font-semibold leading-[1.2] sm:hidden">
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

  const truckChips: ReactNode[] = []
  if (place)
    truckChips.push(
      <PairCopyChip key="place" kind="place" value={place} label={place} title={t(locale, 'pair.placeTitle')} />,
    )
  if (chatHref)
    truckChips.push(
      <Link key="chat" href={chatHref} title={t(locale, 'pair.chatTitle')} aria-label={t(locale, 'pair.chatTitle')} className={PAIR_CHIP}>
        <Send size={15} className="shrink-0 text-sky-400" aria-hidden />
        <span className="hidden sm:inline">{t(locale, 'pair.chat')}</span>
      </Link>,
    )
  const loadChips: ReactNode[] = []
  if (load && rateConId) loadChips.push(<RateConButton key="rc" docId={rateConId} compact />)
  if (load && brokerUpdate)
    loadChips.push(
      <PairCopyChip key="broker" kind="broker" value={brokerUpdate} label={t(locale, 'pair.broker')} title={t(locale, 'pair.brokerTitle')} />,
    )
  const chips = (list: ReactNode[]) => (list.length ? <span className="flex shrink-0 items-center gap-1">{list}</span> : null)

  return (
    // Липкая только при паре: трак без груза (и груз без трака) переключать не на что,
    // и полоса, едущая за экраном, лишь занимает место.
    <div className={`${truck && load ? 'sticky top-[var(--sticky-top)] z-30' : ''} mt-2 flex gap-1.5 rounded-xl border border-white/8 bg-ink-950/85 p-1 backdrop-blur sm:mt-3 sm:gap-2 sm:rounded-2xl sm:p-1.5`}>
      <div className={current === 'truck' ? active : truck ? link : empty}>
        {current === 'truck' || !truck ? (
          <div className={inner} aria-current={current === 'truck' ? 'page' : undefined}>{truckInner}</div>
        ) : (
          <Link href={`/trucks/${truck.id}`} className={inner}>{truckInner}</Link>
        )}
        {chips(truckChips)}
      </div>
      <span className="hidden self-center text-t3 sm:inline">⇄</span>
      <div className={current === 'load' ? active : load ? link : empty}>
        {current === 'load' || !load ? (
          <div className={inner} aria-current={current === 'load' ? 'page' : undefined}>{loadInner}</div>
        ) : (
          <Link href={`/loads/${load.id}`} className={inner}>{loadInner}</Link>
        )}
        {chips(loadChips)}
      </div>
    </div>
  )
}

const etClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: '2-digit',
  day: '2-digit',
  year: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
})

/**
 * Апдейт брокеру одной строкой, по-английски — его вставляют в чат или письмо:
 * «Load 1234567 · Truck at Manteno, IL 60950 (10/26/26, 11:52 PM ET) · Heading to Aurora, CO».
 * Время — GPS-фикс по ET. ETA не пишем: её считает диспетчер, а не догадка программы.
 */
export function pairBrokerUpdate(o: {
  loadRef: string | null | undefined
  loadId: number
  place: string | null | undefined
  fixAt: string | null | undefined
  destination: string | null | undefined
}): string | null {
  if (!o.place) return null
  const ms = o.fixAt ? Date.parse(o.fixAt) : NaN
  const at = Number.isFinite(ms) ? ` (${etClock.format(new Date(ms)).replace(',', '')} ET)` : ''
  return [
    `Load ${o.loadRef?.trim() || `#${o.loadId}`}`,
    `Truck at ${o.place}${at}`,
    o.destination ? `Heading to ${o.destination}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
