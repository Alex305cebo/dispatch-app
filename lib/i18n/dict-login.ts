// The /login screen — the one page that already had ru/en parity before this pass.

export const loginDict = {
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
  'login.hidePassword': { ru: 'Скрыть пароль', en: 'Hide password' },
  'login.showPassword': { ru: 'Показать пароль', en: 'Show password' },

  // app/login/actions.ts — bootstrap/sign-in error strings.
  'login.error.enterName': { ru: 'Впиши имя.', en: 'Enter your name.' },
  'login.error.badEmail': { ru: 'Некорректный email.', en: 'Invalid email.' },
  'login.error.passwordMin': { ru: 'Пароль — минимум 8 символов.', en: 'Password must be at least 8 characters.' },
  'login.error.accountExists': {
    ru: 'Аккаунт уже создан — используй форму входа.',
    en: 'An account already exists — use the sign-in form.',
  },
  'login.error.emailTaken': { ru: 'Этот email уже занят.', en: 'This email is already taken.' },
  'login.error.createFailed': { ru: 'Не вышло создать аккаунт.', en: 'Could not create the account.' },
  'login.error.badCredentials': { ru: 'Неверный email или пароль.', en: 'Wrong email or password.' },
} as const
