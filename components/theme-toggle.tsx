'use client'

// Floating light/dark switch. Flips document.documentElement.dataset.theme, which
// re-points the CSS colour variables (see globals.css) — the whole app recolours
// with no per-component work. Choice persists in localStorage; an inline script in
// the layout applies it before first paint so there's no flash.

import { useEffect, useState } from 'react'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function ThemeToggle() {
  const locale = useLocale()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as 'dark' | 'light') || 'dark')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* private mode — theme just won't persist, no harm */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={t(locale, theme === 'dark' ? 'theme.light' : 'theme.dark')}
      title={t(locale, theme === 'dark' ? 'theme.light' : 'theme.dark')}
      // Inline: lives in the nav next to the bell, not floating over the page.
      className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-ink-800/80 text-[15px] transition-colors hover:border-white/25"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
