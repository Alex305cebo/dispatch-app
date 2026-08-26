'use client'

// Место водителя, которое копируется одним нажатием.
//
// Вопрос «где сейчас трак» задают не для себя: ответ тут же уходит брокеру в чат
// или в письмо, и за день это повторяется десятки раз. Раньше место было простым
// текстом — его выделяли мышью по букве, а на телефоне не выделяли вовсе.
//
// Кнопка намеренно выглядит кнопкой: рамка и постоянный значок, а не блёклая
// иконка, появляющаяся при наведении. Наведение на телефоне не существует, а
// невидимую кнопку не находят — так и было с прежним значком в списке парка.
//
// Копируется короткая форма «город, штат», а не «1.1mi SSW from Tonopah, NV»:
// брокеру нужен город, а не румб и расстояние до него.

import { Copy } from 'lucide-react'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function CopyPlace({
  text,
  copy,
  className = '',
  size = 'md',
}: {
  /** Что показать. */
  text: string
  /** Что положить в буфер, если это не то же самое, что на экране. */
  copy?: string
  className?: string
  /** 'sm' — внутри плотных строк списка, 'md' — в карточках и шапках. */
  size?: 'sm' | 'md'
}) {
  const locale = useLocale()
  const value = copy ?? text

  async function run(e: React.MouseEvent) {
    // Место часто лежит внутри строки-ссылки: без этого щелчок по кнопке уводил бы
    // на страницу трака вместо копирования.
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      notify('ok', `${t(locale, 'tracking.addressCopiedPrefix')}${value}`)
    } catch {
      // Браузер может запретить буфер (нет https, отказ в разрешении) — тогда
      // говорим об этом, а не молчим с видом, будто скопировали.
      notify('warn', t(locale, 'tracking.clipboardDenied'))
    }
  }

  const pad = size === 'sm' ? 'gap-1 px-1.5 py-0.5' : 'gap-1.5 px-2 py-1'

  return (
    <button
      type="button"
      onClick={run}
      title={t(locale, 'tracking.copyLocationTitle')}
      className={`group relative z-10 inline-flex max-w-full items-center rounded-lg border border-white/12 bg-white/[0.04] text-left transition-colors hover:border-haul-500/50 hover:bg-haul-500/10 ${pad} ${className}`}
    >
      <span className="min-w-0 truncate">{text}</span>
      <Copy
        size={size === 'sm' ? 11 : 12}
        className="shrink-0 text-haul-300/70 transition-colors group-hover:text-haul-300"
      />
    </button>
  )
}
