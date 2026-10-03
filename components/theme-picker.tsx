'use client'

// Выбор темы на экране входа: две кнопки «Светлая / Тёмная» вместо одной иконки — человек
// видит, что выбор есть, до того как войти. Пишет тот же localStorage 'theme', что и
// переключатель в меню (components/theme-toggle.tsx), и тот же data-theme на <html>, так
// что выбор применяется сразу и остаётся после входа.

import { useEffect, useState } from 'react'
import { t, type Locale } from '@/lib/i18n'

/** compact — только значки ☀️/🌙 (подпись в title): на форме входа встаёт в строку с флагами. */
export function ThemePicker({ locale, className = '', compact = false }: { locale: Locale; className?: string; compact?: boolean }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('light')

  useEffect(() => {
    // Сохранённый выбор важнее атрибута: к первому эффекту data-theme может быть ещё не выставлен.
    let saved: string | null = null
    try {
      saved = localStorage.getItem('theme')
    } catch {}
    setTheme((saved ?? document.documentElement.dataset.theme) === 'dark' ? 'dark' : 'light')
  }, [])

  function pick(next: 'dark' | 'light') {
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* приватный режим — тема просто не запомнится */
    }
  }

  const opt = (value: 'light' | 'dark', icon: string, key: 'theme.lightShort' | 'theme.darkShort') => (
    <button
      type="button"
      onClick={() => pick(value)}
      aria-pressed={theme === value}
      title={t(locale, key)}
      aria-label={compact ? t(locale, key) : undefined}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors ${compact ? 'h-7 w-8' : 'px-2.5 py-1.5'} ${
        theme === value ? 'bg-haul-500 text-[#fff] shadow-sm' : 'text-t2 hover:text-t1'
      }`}
    >
      <span aria-hidden>{icon}</span>
      {!compact && t(locale, key)}
    </button>
  )

  return (
    <div role="group" aria-label={t(locale, 'theme.pick')} className={`flex gap-0.5 border border-white/10 bg-white/[0.03] ${compact ? 'shrink-0 rounded-lg p-0.5' : 'rounded-xl p-1'} ${className}`}>
      {opt('light', '☀️', 'theme.lightShort')}
      {opt('dark', '🌙', 'theme.darkShort')}
    </div>
  )
}
