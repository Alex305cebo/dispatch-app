'use client'

import { Button } from '@/components/button'
import { useState, useTransition } from 'react'
import { bootstrapAdmin, signIn } from './actions'
import { LOCALE_COOKIE, LOCALES, t, type Locale } from '@/lib/i18n'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-10-8-10-8a18.5 18.5 0 0 1 4.22-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]">
      <path d="M1 12s3-8 11-8 11 8 11 8-3 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const input =
  'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-[15px] text-white outline-none transition-all placeholder:text-white/45 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15'

/** Same form for both first-run (create the admin) and every login after — the
 * chrome (logo, language picker, password field, submit) is identical either way. */
export function LoginForm({
  bootstrap,
  needsSchema,
  companyName,
  askLocale,
  initialLocale,
}: {
  bootstrap: boolean
  /** Название компании из базы — заголовок карточки входа. Пусто на первом
   * запуске (в базе его ещё нет) и в установке. */
  companyName: string
  /** Таблиц в базе ещё нет — это установка, а не просто первый аккаунт. Отдельно
   * от bootstrap, потому что заголовок и надпись на кнопке разные: «Установить»
   * занимает секунды, и молчащая кнопка «Создать аккаунт» выглядит зависшей. */
  needsSchema: boolean
  /** No locale cookie yet — greet with the language choice before anything else. */
  askLocale: boolean
  initialLocale: Locale
}) {
  const [name, setName] = useState('')
  const [coName, setCoName] = useState('')
  const [coMcdot, setCoMcdot] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [asking, setAsking] = useState(askLocale)
  const [pending, start] = useTransition()

  function writeLocaleCookie(l: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }

  function chooseLocale(l: Locale) {
    setLocale(l)
    writeLocaleCookie(l)
  }

  /** First-run choice reloads instead of swapping state, for two reasons. Swapping
   * replaces the card's contents under a cursor that is still mid-click, and the
   * browser then delivers that click to whatever button now sits at those
   * coordinates — in testing, picking a language went straight into the demo.
   * A reload also lets page.tsx re-decide askLocale server-side, same pattern as
   * components/locale-toggle.tsx. */
  function chooseFirstLocale(l: Locale) {
    writeLocaleCookie(l)
    window.location.reload()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = bootstrap
        ? await bootstrapAdmin(name, email, password, coName, coMcdot)
        : await signIn(email, password, remember)
      if (res?.error) {
        setError(res.error)
        return
      }
      // A full reload, not router.refresh(): middleware rewrote this response, so the
      // address bar already holds the real URL — including a QR's #load data — and
      // reloading it fetches that same URL fresh, same as refresh() intended. Unlike
      // refresh()'s RSC-only fetch, a plain reload is just an ordinary page request,
      // which behaves correctly behind reverse proxies that don't handle Next's RSC
      // response format cleanly (seen in production on Hostinger: refresh() surfaced
      // as "An unexpected response was received from the server").
      window.location.reload()
    })
  }

  // First visit ever: ask the language before showing anything else. Labels are
  // deliberately bilingual and untranslated — asking "which language?" in a language
  // the visitor may not read is the one question that cannot be localised.
  if (asking) {
    return (
      <main className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950 px-4">
        <div className="panel w-full max-w-sm p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-haul-500 to-good-500 text-[17px] font-bold">
              D
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-tight">{companyName || 'Dispatch'}</h1>
              <p className="text-[12px] text-white/65">Choose your language · Выберите язык</p>
            </div>
          </div>

          <div className="grid gap-2.5">
            <Button variant="primary" size="lg" block onClick={() => chooseFirstLocale('en')}>
              English
            </Button>
            <Button variant="secondary" size="lg" block onClick={() => chooseFirstLocale('ru')}>
              Русский
            </Button>
          </div>

          <p className="mt-3 text-center text-[11px] text-white/45">
            You can change it any time · Можно сменить в любой момент
          </p>
        </div>
      </main>
    )
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
            <h1 className="text-[15px] font-semibold leading-tight">{companyName || 'Dispatch'}</h1>
            <p className="text-[12px] text-white/65">
              {needsSchema
                ? t(locale, 'login.install_title')
                : bootstrap
                  ? t(locale, 'login.bootstrap_title')
                  : t(locale, 'login.subtitle')}
            </p>
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

        {bootstrap && (
          <p className="mb-3 rounded-lg border border-haul-500/25 bg-haul-500/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-haul-300">
            {needsSchema ? t(locale, 'login.install_subtitle') : t(locale, 'login.bootstrap_subtitle')}
          </p>
        )}

        {/* Компания — первым полем: на первом запуске отвечают на вопрос «что ставим»,
            а уже потом «кто я». Название обязательно (без него счёт не выставить),
            MC/DOT можно дописать позже в админке. */}
        {bootstrap && (
          <input
            type="text"
            value={coName}
            autoFocus
            autoComplete="organization"
            onChange={(e) => setCoName(e.target.value)}
            placeholder={t(locale, 'login.company')}
            className={`mb-2.5 ${input}`}
          />
        )}

        {bootstrap && (
          <input
            type="text"
            value={coMcdot}
            onChange={(e) => setCoMcdot(e.target.value)}
            placeholder={t(locale, 'login.mcdot')}
            className={`mb-2.5 ${input}`}
          />
        )}

        {bootstrap && (
          <input
            type="text"
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            placeholder={t(locale, 'login.name')}
            className={`mb-2.5 ${input}`}
          />
        )}

        <input
          type="email"
          value={email}
          autoFocus={!bootstrap}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t(locale, 'login.email')}
          className={`mb-2.5 ${input}`}
        />

        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            autoComplete={bootstrap ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t(locale, 'login.password')}
            className={`${input} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? t(locale, 'login.hidePassword') : t(locale, 'login.showPassword')}
            tabIndex={-1}
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-white/45 transition-colors hover:text-white/85"
          >
            <EyeIcon open={showPw} />
          </button>
        </div>

        {!bootstrap && (
          <>
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
          </>
        )}

        {/* loading, not just disabled: the old button only greyed out while the
            request was in flight, which looks identical to "you haven't filled the
            form in yet". The spinner says the click landed. */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          className="mt-4"
          loading={pending}
          disabled={!email || !password || (bootstrap && (!name || !coName))}
        >
          {pending
            ? needsSchema
              ? t(locale, 'login.installing')
              : t(locale, 'login.checking')
            : needsSchema
              ? t(locale, 'login.install_submit')
              : bootstrap
                ? t(locale, 'login.bootstrap_submit')
                : t(locale, 'login.submit')}
        </Button>

        {error && <p className="mt-2 text-[13px] text-bad-400">{error}</p>}

        {!bootstrap && (
          <Button href="/demo" external variant="secondary" size="lg" block className="mt-3">
            {t(locale, 'login.demo')}
          </Button>
        )}
      </form>
    </main>
  )
}
