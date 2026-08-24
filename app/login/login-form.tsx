'use client'

import { Button } from '@/components/button'
import { useState, useTransition } from 'react'
import { bootstrapAdmin, registerRequest, resetWithRecovery, signIn } from './actions'
import { LOCALE_COOKIE, LOCALES, t, type Locale } from '@/lib/i18n'
import { GoogleButton } from './google-button'

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

/** Что показывает карточка. 'signin' — обычный вход; 'register' — заявка на аккаунт;
 * 'forgot' — сброс пароля по дате рождения; 'sent' — заявка отправлена, ждём
 * подтверждения администратором. */
type Mode = 'signin' | 'register' | 'forgot' | 'sent'

/** Same form for both first-run (create the admin) and every login after — the
 * chrome (logo, language picker, password field, submit) is identical either way. */
export function LoginForm({
  bootstrap,
  needsSchema,
  companyName,
  showDemo,
  demoUrl,
  googleClientId,
  askLocale,
  initialLocale,
}: {
  bootstrap: boolean
  /** Таблиц в базе ещё нет — это установка, а не просто первый аккаунт. Отдельно
   * от bootstrap, потому что заголовок и надпись на кнопке разные: «Установить»
   * занимает секунды, и молчащая кнопка «Создать аккаунт» выглядит зависшей. */
  needsSchema: boolean
  /** Название компании из базы — заголовок карточки входа. Пусто на первом
   * запуске (в базе его ещё нет) и в установке. */
  companyName: string
  /** Показывать ли кнопку публичного демо ЭТОЙ установки. */
  showDemo: boolean
  /** Адрес отдельной установки-витрины. Указан — кнопка ведёт туда. */
  demoUrl: string
  /** Client ID Google для этой установки. Пусто — кнопки «Войти через Google» нет,
   * вход только паролем. */
  googleClientId: string
  /** No locale cookie yet — greet with the language choice before anything else. */
  askLocale: boolean
  initialLocale: Locale
}) {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [coName, setCoName] = useState('')
  const [coMcdot, setCoMcdot] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [birthday, setBirthday] = useState('')
  const [consent, setConsent] = useState(false)
  const [remember, setRemember] = useState(true)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [asking] = useState(askLocale)
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

  function switchMode(m: Mode) {
    setMode(m)
    setError(null)
    setPassword('')
  }

  /** A full reload, not router.refresh(): middleware rewrote this response, so the
   * address bar already holds the real URL — including a QR's #load data — and
   * reloading it fetches that same URL fresh. Unlike refresh()'s RSC-only fetch, a
   * plain reload behaves correctly behind reverse proxies that don't handle Next's
   * RSC response format cleanly (seen in production on Hostinger). */
  function enter() {
    window.location.reload()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      if (bootstrap) {
        const res = await bootstrapAdmin(name, email, password, coName, coMcdot, birthday, consent)
        if (res?.error) setError(res.error)
        else enter()
        return
      }
      if (mode === 'register') {
        const res = await registerRequest(name, email, password, birthday, consent)
        if (res?.error) setError(res.error)
        else switchMode('sent')
        return
      }
      if (mode === 'forgot') {
        const res = await resetWithRecovery(email, birthday, password)
        if (res?.error) setError(res.error)
        else enter()
        return
      }
      const res = await signIn(email, password, remember)
      if (res?.error) setError(res.error)
      else enter()
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

  // Заявка ушла — сказать, что дальше, а не молча вернуть форму входа.
  if (mode === 'sent') {
    return (
      <main className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950 px-4">
        <div className="panel w-full max-w-sm p-6">
          <h1 className="text-[15px] font-semibold">{t(locale, 'login.sent.title')}</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{t(locale, 'login.sent.text')}</p>
          <Button variant="primary" size="lg" block className="mt-4" onClick={() => switchMode('signin')}>
            {t(locale, 'login.backToSignIn')}
          </Button>
        </div>
      </main>
    )
  }

  const title = needsSchema
    ? t(locale, 'login.install_title')
    : bootstrap
      ? t(locale, 'login.bootstrap_title')
      : mode === 'register'
        ? t(locale, 'login.register_title')
        : mode === 'forgot'
          ? t(locale, 'login.forgot_title')
          : t(locale, 'login.subtitle')

  const submitLabel = pending
    ? needsSchema
      ? t(locale, 'login.installing')
      : t(locale, 'login.checking')
    : needsSchema
      ? t(locale, 'login.install_submit')
      : bootstrap
        ? t(locale, 'login.bootstrap_submit')
        : mode === 'register'
          ? t(locale, 'login.register_submit')
          : mode === 'forgot'
            ? t(locale, 'login.forgot_submit')
            : t(locale, 'login.submit')

  const askName = bootstrap || mode === 'register'
  const askBirthday = bootstrap || mode === 'register' || mode === 'forgot'
  const askConsent = bootstrap || mode === 'register'
  const canSubmit =
    !!email &&
    !!password &&
    (!askName || !!name) &&
    (!bootstrap || !!coName) &&
    (!askBirthday || !!birthday) &&
    (!askConsent || consent)

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
            <p className="text-[12px] text-white/65">{title}</p>
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
        {!bootstrap && mode === 'register' && (
          <p className="mb-3 rounded-lg border border-haul-500/25 bg-haul-500/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-haul-300">
            {t(locale, 'login.register_subtitle')}
          </p>
        )}
        {!bootstrap && mode === 'forgot' && (
          <p className="mb-3 rounded-lg border border-haul-500/25 bg-haul-500/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-haul-300">
            {t(locale, 'login.forgot_subtitle')}
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

        {askName && (
          <input
            type="text"
            value={name}
            autoFocus={!bootstrap}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            placeholder={t(locale, 'login.name')}
            className={`mb-2.5 ${input}`}
          />
        )}

        <input
          type="email"
          value={email}
          autoFocus={!askName && mode === 'signin'}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t(locale, 'login.email')}
          className={`mb-2.5 ${input}`}
        />

        {askBirthday && (
          <label className="mb-2.5 block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/55">
              {t(locale, 'login.birthday')}
            </span>
            {/* Родной календарь браузера: щёлкнул — выбрал — подтвердил. Никакой
                своей библиотеки дат: телефон покажет своё колесо, компьютер — свой
                календарь, и оба заполнят поле одним форматом. */}
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              min="1920-01-01"
              max={`${new Date().getFullYear() - 10}-12-31`}
              className={input}
            />
            <span className="mt-1 block text-[11px] leading-relaxed text-white/45">
              {t(locale, mode === 'forgot' ? 'login.birthdayForgotHint' : 'login.birthdayHint')}
            </span>
          </label>
        )}

        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            autoComplete={mode === 'signin' && !bootstrap ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'forgot' ? t(locale, 'login.newPassword') : t(locale, 'login.password')}
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

        {askConsent && (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 select-none">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-haul-500"
            />
            <span className="text-[12px] leading-relaxed text-white/65">{t(locale, 'login.consent')}</span>
          </label>
        )}

        {!bootstrap && mode === 'signin' && (
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
        <Button type="submit" variant="primary" size="lg" block className="mt-4" loading={pending} disabled={!canSubmit}>
          {submitLabel}
        </Button>

        {error && <p className="mt-2 text-[13px] text-bad-400">{error}</p>}

        {/* Две дороги: забыл пароль и нет аккаунта. Ссылками под кнопкой, а не
            отдельными кнопками — вход остаётся главным. */}
        {!bootstrap && (
          <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12.5px]">
            {mode === 'signin' ? (
              <>
                <button type="button" onClick={() => switchMode('forgot')} className="text-haul-300 hover:underline">
                  {t(locale, 'login.forgotLink')}
                </button>
                <button type="button" onClick={() => switchMode('register')} className="text-haul-300 hover:underline">
                  {t(locale, 'login.registerLink')}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => switchMode('signin')} className="text-white/60 hover:text-white/90">
                ← {t(locale, 'login.backToSignIn')}
              </button>
            )}
          </div>
        )}

        {(bootstrap || mode === 'signin') && googleClientId && (
          <>
            <div className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-white/35">
              <span className="h-px flex-1 bg-white/10" />
              {t(locale, 'login.google.or')}
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <GoogleButton
              clientId={googleClientId}
              locale={locale}
              onWait={() => switchMode('sent')}
              onError={setError}
            />
          </>
        )}

        {!bootstrap && mode === 'signin' && (demoUrl || showDemo) && (
          <Button href={demoUrl || '/demo'} external variant="secondary" size="lg" block className="mt-3">
            {t(locale, 'login.demo')}
          </Button>
        )}
      </form>
    </main>
  )
}
