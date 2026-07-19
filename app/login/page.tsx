'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from './actions'
import { LOCALE_COOKIE, LOCALES, resolveLocale, t, type Locale } from '@/lib/i18n'

export default function LoginPage() {
  const [pin, setPin] = useState('')
  const [who, setWho] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locale, setLocale] = useState<Locale>('ru')
  const [pending, start] = useTransition()
  const router = useRouter()

  // Prefill the name from this device so a returning person doesn't retype it, and
  // pick up any language chosen earlier (cookie).
  useEffect(() => {
    const saved = localStorage.getItem('dispatch_who')
    if (saved) setWho(saved)
    const m = document.cookie.match(/(?:^|; )locale=([^;]+)/)
    if (m) setLocale(resolveLocale(decodeURIComponent(m[1]!)))
  }, [])

  // Choosing a language sets the cookie so the whole app (after sign-in) uses it.
  function chooseLocale(l: Locale) {
    setLocale(l)
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      localStorage.setItem('dispatch_who', who.trim())
      const res = await signIn(pin, remember, who)
      if (res?.error) {
        setError(res.error)
        return
      }
      // refresh(), not push(): middleware rewrote this response, so the address bar
      // still holds the real URL — including a QR's #load data. Re-render in place.
      router.refresh()
    })
  }

  return (
    // Covers the nav: middleware rewrites this page over whatever route was asked
    // for, so usePathname() still reports that route and the nav can't know to hide.
    <main className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950 px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-haul-500 to-good-500 text-[17px] font-bold">
            D
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight">Dispatch</h1>
            <p className="text-[12px] text-white/65">{t(locale, 'login.subtitle')}</p>
          </div>
          {/* Language picker — first thing on the very first screen. */}
          <div className="ml-auto flex overflow-hidden rounded-lg border border-white/10 text-[12px] font-semibold">
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => chooseLocale(l)}
                className={`px-2.5 py-1 transition-colors ${
                  locale === l ? 'bg-haul-500 text-white' : 'text-white/55 hover:text-white/85'
                }`}
              >
                {l === 'ru' ? 'РУ' : 'EN'}
              </button>
            ))}
          </div>
        </div>

        <input
          type="text"
          value={who}
          autoComplete="name"
          onChange={(e) => setWho(e.target.value)}
          placeholder={t(locale, 'login.name')}
          className="mb-2.5 w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15"
        />

        <input
          type="password"
          value={pin}
          autoFocus
          autoComplete="current-password"
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className="w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15"
        />

        <label className="mt-3 flex cursor-pointer items-center gap-2.5 select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 shrink-0 accent-haul-500"
          />
          <span className="text-[13px] text-white/72">{t(locale, 'login.remember')}</span>
        </label>
        <p className="mt-1 text-[11px] leading-relaxed text-white/45">
          {remember ? t(locale, 'login.remember_on') : t(locale, 'login.remember_off')}
        </p>

        <button
          type="submit"
          disabled={pending || !pin}
          className="mt-4 w-full rounded-xl bg-haul-500 py-3 text-[15px] font-semibold transition-colors hover:bg-haul-400 disabled:bg-white/8 disabled:text-white/55"
        >
          {pending ? t(locale, 'login.checking') : t(locale, 'login.submit')}
        </button>

        {error && <p className="mt-2 text-[13px] text-bad-400">{error}</p>}
      </form>
    </main>
  )
}
