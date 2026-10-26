'use client'

// Кнопки-копии на плашке «Трак ⇄ Груз»: «Manteno, IL 60950» и «Load Info».
// Только буфер обмена — никаких отправок: связь с брокером и водителем диспетчер
// ведёт сам, в Telegram.

import { ClipboardList, MapPin } from 'lucide-react'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/** Общий вид кнопок плашки — и копий, и ссылок (чат, Rate Con). На телефоне —
 * квадрат со значком, с sm — значок и слово. */
export const PAIR_CHIP =
  'relative z-10 inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-sm font-semibold text-t1 transition-colors hover:border-haul-400/70 hover:bg-haul-500/10 hover:text-white sm:h-10 sm:px-2.5'

export function PairCopyChip({
  value,
  label,
  title,
  kind,
}: {
  /** Что кладётся в буфер. */
  value: string
  /** Что видно на кнопке с sm и шире. */
  label: string
  title: string
  kind: 'place' | 'info'
}) {
  const locale = useLocale()
  async function run(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      // Load Info — полтора десятка строк: в уведомлении хватит заголовка.
      notify('ok', kind === 'info' ? t(locale, 'pair.loadInfoCopied') : `${t(locale, 'pair.placeCopied')}${value}`)
    } catch {
      notify('warn', t(locale, 'tracking.clipboardDenied'))
    }
  }
  const Icon = kind === 'place' ? MapPin : ClipboardList
  return (
    <button type="button" onClick={run} title={title} aria-label={kind === 'place' ? `${title}: ${value}` : title} className={PAIR_CHIP}>
      <Icon size={15} className="shrink-0 text-haul-400" aria-hidden />
      {/* Место — главное на кнопке: на широком экране видно целиком, на среднем
          обрезается многоточием, на телефоне остаётся значок (полный текст — в title). */}
      <span className={`hidden truncate sm:inline ${kind === 'place' ? 'nums max-w-[9rem] lg:max-w-[14rem]' : ''}`}>{label}</span>
    </button>
  )
}
