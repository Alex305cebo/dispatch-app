'use client'

// Выбор языка интерфейса.
//
// Был переключатель на два положения: кнопка показывала ДРУГОЙ язык («EN» значило
// «переключиться на английский»). С двумя языками это работало, с пятью — нет:
// показать одну кнопку из пяти нельзя, а листать язык по кругу никто не станет.
//
// Поэтому список. Языки в нём названы НА СЕБЕ — «Español», а не «Spanish»: человек,
// который лезет за переключателем языка, английского может и не знать, в этом и
// причина, по которой он туда лезет.

import { useRouter } from 'next/navigation'
import { useLocale } from '@/components/locale-provider'
import { LOCALES, type Locale } from '@/lib/i18n'

export function LocaleToggle({ collapsed = false }: { collapsed?: boolean }) {
  const locale = useLocale()
  const router = useRouter()
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]!

  function choose(next: Locale) {
    if (next === locale) return
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    // router.refresh(), а не перезагрузка страницы: серверные компоненты перечитают
    // куку и отрисуются заново, но мягко — не теряются ни прокрутка, ни открытые
    // секции, ни состояние форм.
    router.refresh()
  }

  return (
    <span className={`relative inline-flex items-center ${collapsed ? 'nav-icon-btn is-collapsed' : ''}`}>
      {/* Настоящий <select> поверх подписи: на телефоне он открывает системный
          список выбора, к которому палец уже привык, и изобретать нечего. */}
      <span className="pointer-events-none flex h-9 items-center gap-1 rounded-full border border-white/10 px-2.5 text-[11px] font-bold uppercase text-white/75">
        {current.short}
        <span className="text-[9px] text-white/40">▾</span>
      </span>
      <select
        value={locale}
        onChange={(e) => choose(e.target.value as Locale)}
        aria-label="Language"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </span>
  )
}
