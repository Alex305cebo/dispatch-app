// Two-language UI (Russian / English). No dependency — a flat dictionary + a t()
// lookup. Pure module: safe to import from server AND client components. The chosen
// locale lives in the `locale` cookie (picked on the login screen), default Russian.

export type Locale = 'ru' | 'en'
export const LOCALES: Locale[] = ['ru', 'en']
export const LOCALE_COOKIE = 'locale'

/** Cookie value → Locale, defaulting to English. Russian only when explicitly chosen. */
export function resolveLocale(v: string | undefined | null): Locale {
  return v === 'ru' ? 'ru' : 'en'
}

// key → { ru, en }. Grows as screens get translated; keys are dot-namespaced by area.
const DICT = {
  'login.subtitle': { ru: 'Вход', en: 'Sign in' },
  'login.name': { ru: 'Ваше имя', en: 'Your name' },
  'login.email': { ru: 'Email', en: 'Email' },
  'login.password': { ru: 'Пароль', en: 'Password' },
  'login.bootstrap_title': { ru: 'Первый запуск', en: 'First run' },
  'login.bootstrap_subtitle': {
    ru: 'Аккаунтов ещё нет — создай первый, он станет администратором.',
    en: 'No accounts yet — create the first one, it becomes the administrator.',
  },
  'login.bootstrap_submit': { ru: 'Создать аккаунт', en: 'Create account' },
  'login.remember': { ru: 'Запомнить этот компьютер', en: 'Remember this computer' },
  'login.remember_on': {
    ru: 'Войдёшь один раз — устройство запомнит вход надолго. Не включай на чужом компьютере.',
    en: 'Sign in once and this device stays signed in. Do not enable it on a shared computer.',
  },
  'login.remember_off': {
    ru: 'Вход только до закрытия браузера — при следующем заходе спросим пароль снова.',
    en: 'Signed in only until you close the browser — we will ask for your password again next time.',
  },
  'login.submit': { ru: 'Войти', en: 'Sign in' },
  'login.checking': { ru: 'Проверяю…', en: 'Checking…' },
  'login.demo': {
    ru: '🧪 Посмотреть живое демо — без регистрации',
    en: '🧪 View live demo — no sign-up',
  },
  'login.language': { ru: 'Язык', en: 'Language' },
} as const

export type MsgKey = keyof typeof DICT

export function t(locale: Locale, key: MsgKey): string {
  const entry = DICT[key]
  return entry ? entry[locale] : key
}
