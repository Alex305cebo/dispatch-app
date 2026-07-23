'use client'

// Client-side access to the locale the root layout already resolved server-side (see
// lib/i18n-server's getLocale()) — set once at the root, read anywhere via useLocale()
// with no prop drilling. Switching locale always does a full reload (see
// components/locale-toggle.tsx) since most of the app is Server Components, whose
// text is baked into the HTML at render time — a context update alone can't touch it.

import { createContext, useContext } from 'react'
import type { Locale } from '@/lib/i18n'

const LocaleContext = createContext<Locale>('en')

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}
