'use client'

// Same round-button rhythm as ThemeToggle, sitting right next to it in the nav's
// account row. Shows the OTHER language (the one you'd switch to), same affordance
// as the sun/moon icon. Writing the cookie + a hard reload (not router.refresh()) is
// required: Server Components render their text server-side, so only a fresh request
// picks up the new locale.

import { useRouter } from 'next/navigation'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'

export function LocaleToggle({ collapsed = false }: { collapsed?: boolean }) {
  const locale = useLocale()
  const router = useRouter()
  const target: Locale = locale === 'ru' ? 'en' : 'ru'

  function choose() {
    document.cookie = `locale=${target}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    // router.refresh(), а не window.location.reload(): серверные компоненты
    // перечитают куку и отрисуются заново, но это мягкое обновление — не теряются
    // ни позиция прокрутки, ни открытые секции, ни состояние форм на странице.
    router.refresh()
  }

  return (
    <button
      onClick={choose}
      aria-label={t(locale, target === 'en' ? 'nav.switchToEnglish' : 'nav.switchToRussian')}
      title={target === 'en' ? 'English' : 'Русский'}
      className={`nav-icon-btn flex size-9 items-center justify-center rounded-full border border-white/10 text-[11px] font-bold uppercase hover:border-white/25 ${collapsed ? 'is-collapsed' : ''}`}
    >
      {target}
    </button>
  )
}
