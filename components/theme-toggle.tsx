'use client'

// Floating light/dark switch. Flips document.documentElement.dataset.theme, which
// re-points the CSS colour variables (see globals.css) — the whole app recolours
// with no per-component work. Choice persists in localStorage; an inline script in
// the layout applies it before first paint so there's no flash.

import { useEffect, useState } from 'react'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const locale = useLocale()
  const [theme, setTheme] = useState<'dark' | 'light'>('light')

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as 'dark' | 'light') || 'light')
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
      className={`nav-icon-btn flex size-9 items-center justify-center rounded-full border border-white/10 hover:border-white/25 ${collapsed ? 'is-collapsed' : ''}`}
    >
      {/* Линейный значок, как колокольчик и «?» рядом: эмодзи выбивался из ряда. */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden>
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  )
}
