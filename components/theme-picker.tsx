'use client'

// Выбор темы на экране входа: две кнопки «Светлая / Тёмная» вместо одной иконки — человек
// видит, что выбор есть, до того как войти. Пишет тот же localStorage 'theme', что и
// переключатель в меню (components/theme-toggle.tsx), и тот же data-theme на <html>, так
// что выбор применяется сразу и остаётся после входа.

import { useEffect, useState } from 'react'
import { t, type Locale } from '@/lib/i18n'

export function ThemePicker({ locale, className = '' }: { locale: Locale; className?: string }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('light')

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
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
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
        theme === value ? 'bg-haul-500 text-[#fff] shadow-sm' : 'text-white/60 hover:text-white/90'
      }`}
    >
      <span aria-hidden>{icon}</span>
      {t(locale, key)}
    </button>
  )

  return (
    <div role="group" aria-label={t(locale, 'theme.pick')} className={`flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 ${className}`}>
      {opt('light', '☀️', 'theme.lightShort')}
      {opt('dark', '🌙', 'theme.darkShort')}
    </div>
  )
}
