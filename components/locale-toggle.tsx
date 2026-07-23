'use client'

// Same round-button rhythm as ThemeToggle, sitting right next to it in the nav's
// account row. Shows the OTHER language (the one you'd switch to), same affordance
// as the sun/moon icon. Writing the cookie + a hard reload (not router.refresh()) is
// required: Server Components render their text server-side, so only a fresh request
// picks up the new locale.

import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'

export function LocaleToggle() {
  const locale = useLocale()
  const target: Locale = locale === 'ru' ? 'en' : 'ru'

  function choose() {
    document.cookie = `locale=${target}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    window.location.reload()
  }

  return (
    <button
      onClick={choose}
      aria-label={t(locale, target === 'en' ? 'nav.switchToEnglish' : 'nav.switchToRussian')}
      title={target === 'en' ? 'English' : 'Русский'}
      className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-ink-800/80 text-[11px] font-bold uppercase transition-colors hover:border-white/25"
    >
      {target}
    </button>
  )
}
