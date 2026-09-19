'use client'

import { Button } from '@/components/button'
import { useEffect, useState, useTransition } from 'react'
import { bootstrapAdmin, registerRequest, resetWithRecovery, signIn } from './actions'
import { LOCALE_COOKIE, LOCALES, t, type Locale } from '@/lib/i18n'
import { GoogleButton } from './google-button'
import { ThemePicker } from '@/components/theme-picker'
import { LocaleFlag } from '@/components/locale-flags'

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
  'w-full rounded-xl border border-white/8 bg-ink-900/80 px-3 py-2.5 text-lg text-white outline-none transition-all placeholder:text-t3 focus:border-haul-500 focus:ring-4 focus:ring-haul-500/15'

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
  saveLocale = false,
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
  /** Куки языка ещё нет: записать язык, показанный по браузеру, чтобы он остался после входа. */
  saveLocale?: boolean
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

  useEffect(() => {
    if (saveLocale) writeLocaleCookie(initialLocale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-haul-500 to-good-500 text-xl font-bold">
              D
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">{companyName || 'Dispatch'}</h1>
              <p className="text-sm text-t2">Choose your language · Выберите язык</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => chooseFirstLocale(l.code)}
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-md font-semibold text-t1 transition-colors hover:border-haul-500/60 hover:bg-haul-500/10"
              >
                <LocaleFlag code={l.code} />
                {l.native}
              </button>
            ))}
          </div>

          <p className="mt-3 text-center text-xs text-t3">
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
          <h1 className="text-lg font-semibold">{t(locale, 'login.sent.title')}</h1>
          <p className="mt-1.5 text-base leading-relaxed text-t2">{t(locale, 'login.sent.text')}</p>
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
    // Лицо TMS: мягкая подсветка фона (фиолет сверху, зелень снизу) и карточка с тенью —
    // первое, что видит каждый новый человек, и чаще всего по дороге в демо.
    <main
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink-950 px-4 py-8"
      style={{
        backgroundImage:
          'radial-gradient(60rem 30rem at 50% -10%, rgb(124 106 255 / 0.22), transparent 70%), radial-gradient(40rem 24rem at 90% 110%, rgb(34 197 94 / 0.12), transparent 70%)',
      }}
    >
      <form
        onSubmit={submit}
        className="panel my-auto w-full max-w-sm p-6 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.45)] ring-1 ring-haul-500/10 sm:p-7"
      >
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-haul-500 to-good-500 text-xl font-bold text-[#fff] shadow-lg shadow-haul-500/30">
            D
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{companyName || 'Dispatch'}</h1>
            <p className="text-sm text-t2">{title}</p>
          </div>
        </div>

        {/* Языки флагами — сразу видно, на каких языках приложение; текущий подсвечен. */}
        <div role="group" aria-label="Language" className="mb-2 grid grid-cols-6 gap-1">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => chooseLocale(l.code)}
              title={l.native}
              aria-label={l.native}
              aria-pressed={locale === l.code}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-2xs font-bold transition-colors ${
                locale === l.code
                  ? 'border-haul-500 bg-haul-500/15 text-haul-300'
                  : 'border-white/8 text-t3 hover:border-white/25 hover:text-t1'
              }`}
            >
              <LocaleFlag code={l.code} className="h-4 w-6" />
              {l.short}
            </button>
          ))}
        </div>
        {/* Тема — сразу под языком: оформление выбирают до входа. */}
        <ThemePicker locale={locale} className="mb-4" />

        {bootstrap && (
          <p className="mb-3 rounded-lg border border-haul-500/25 bg-haul-500/[0.07] px-3 py-2 text-sm leading-relaxed text-haul-300">
            {needsSchema ? t(locale, 'login.install_subtitle') : t(locale, 'login.bootstrap_subtitle')}
          </p>
        )}
        {!bootstrap && mode === 'register' && (
          <p className="mb-3 rounded-lg border border-haul-500/25 bg-haul-500/[0.07] px-3 py-2 text-sm leading-relaxed text-haul-300">
            {t(locale, 'login.register_subtitle')}
          </p>
        )}
        {!bootstrap && mode === 'forgot' && (
          <p className="mb-3 rounded-lg border border-haul-500/25 bg-haul-500/[0.07] px-3 py-2 text-sm leading-relaxed text-haul-300">
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
            <span className="mb-1 block text-xs text-t2 font-medium">
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
            <span className="mt-1 block text-xs leading-relaxed text-t3">
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
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-t3 transition-colors hover:text-t1"
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
            <span className="text-sm leading-relaxed text-t2">{t(locale, 'login.consent')}</span>
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
              <span className="text-base text-t2">{t(locale, 'login.remember')}</span>
            </label>
            <p className="mt-1 text-xs leading-relaxed text-t3">
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

        {error && <p className="mt-2 text-base text-bad-400">{error}</p>}

        {/* Две дороги: забыл пароль и нет аккаунта. Ссылками под кнопкой, а не
            отдельными кнопками — вход остаётся главным. */}
        {!bootstrap && (
          <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
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
              <button type="button" onClick={() => switchMode('signin')} className="text-t2 hover:text-t1">
                ← {t(locale, 'login.backToSignIn')}
              </button>
            )}
          </div>
        )}

        {(bootstrap || mode === 'signin') && googleClientId && (
          <>
            <div className="mt-4 flex items-center gap-3 text-xs text-t3 font-medium">
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
          // Демо — самая частая дорога с этой страницы, поэтому не серая кнопка, а
          // заметный блок: что внутри и что регистрации нет. Ведёт туда же, что и раньше.
          <a
            href={demoUrl || '/demo'}
            className="group mt-4 flex items-center gap-3 rounded-2xl border border-haul-500/40 bg-gradient-to-br from-haul-500/20 via-haul-500/10 to-good-500/15 p-3.5 text-left shadow-[0_10px_30px_-12px_rgb(124_106_255/0.55)] transition-all hover:-translate-y-0.5 hover:border-haul-400/70 hover:shadow-[0_16px_36px_-12px_rgb(124_106_255/0.7)]"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-haul-500 to-good-500 text-[#fff] shadow-md shadow-haul-500/40">
              <svg viewBox="0 0 24 24" className="ml-0.5 size-5" fill="currentColor" aria-hidden>
                <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-lg font-bold whitespace-nowrap text-white">
                {t(locale, 'login.demoTitle')}
                <span className="rounded-full bg-good-500/20 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide whitespace-nowrap text-good-500">
                  {t(locale, 'login.demoBadge')}
                </span>
              </span>
              <span className="mt-0.5 block text-sm leading-snug text-t2">{t(locale, 'login.demoSub')}</span>
            </span>
            <span className="text-[20px] text-haul-300 transition-transform group-hover:translate-x-1" aria-hidden>
              →
            </span>
          </a>
        )}
      </form>
    </main>
  )
}
