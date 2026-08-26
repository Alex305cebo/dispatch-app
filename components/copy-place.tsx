'use client'

// Место водителя, которое можно скопировать одним нажатием.
//
// Вопрос «где сейчас трак» задают не для себя: ответ тут же уходит брокеру в чат
// или в письмо. До этого место было простым текстом — его выделяли мышью по букве,
// на телефоне это вообще пытка, и половина адресов набиралась заново руками.
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
  icon = true,
}: {
  /** Что показать. */
  text: string
  /** Что положить в буфер, если это не то же самое, что на экране. */
  copy?: string
  className?: string
  icon?: boolean
}) {
  const locale = useLocale()
  const value = copy ?? text

  async function run() {
    try {
      await navigator.clipboard.writeText(value)
      notify('ok', `${t(locale, 'tracking.addressCopiedPrefix')}${value}`)
    } catch {
      // Браузер может запретить буфер (нет https, отказ в разрешении) — тогда
      // говорим об этом, а не молчим с видом, будто скопировали.
      notify('warn', t(locale, 'tracking.clipboardDenied'))
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      title={t(locale, 'tracking.copyLocationTitle')}
      className={`group inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left transition-colors hover:bg-white/10 ${className}`}
    >
      <span className="min-w-0 truncate">{text}</span>
      {icon && <Copy size={12} className="shrink-0 text-white/40 transition-colors group-hover:text-white/80" />}
    </button>
  )
}
