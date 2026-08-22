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

  // Переменная окружения не вписана — приложение стоит на хостинге, но базы у него нет.
  'login.nodb_title': { ru: 'База не подключена', en: 'No database connected' },
  'login.nodb_text': {
    ru: 'В панели хостинга (Environment variables) добавьте переменную DATABASE_URL — прямую (direct) строку подключения к Postgres — и перезапустите приложение. После этого здесь появится форма установки.',
    en: 'In the hosting panel (Environment variables) add DATABASE_URL — the direct Postgres connection string — and restart the app. The setup form will appear here once it is set.',
  },

  // Первый запуск на пустой базе — установка, а не просто создание аккаунта.
  'login.install_title': { ru: 'Установка', en: 'Setup' },
  'login.install_subtitle': {
    ru: 'База пустая. Заполни форму — приложение создаст таблицы, профиль компании и твой аккаунт администратора.',
    en: 'The database is empty. Fill this in — the app will create its tables, the company profile and your admin account.',
  },
  'login.install_submit': { ru: 'Установить', en: 'Install' },
  'login.installing': { ru: 'Устанавливаю базу…', en: 'Setting up the database…' },
  'login.company': { ru: 'Название компании', en: 'Company name' },
  'login.mcdot': { ru: 'MC / DOT (можно позже)', en: 'MC / DOT (optional for now)' },
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
  'login.error.enterCompany': { ru: 'Впиши название компании.', en: 'Enter the company name.' },
  'login.error.schemaFailed': {
    ru: 'Не вышло создать таблицы. Частая причина — строка подключения не прямая (нужна direct, не pooled). Точная ошибка — в логах приложения на хостинге.',
    en: 'Could not create the tables. The usual cause is a pooled connection string — the direct one is required. The exact error is in the app logs on the hosting panel.',
  },
  'login.error.emailTaken': { ru: 'Этот email уже занят.', en: 'This email is already taken.' },
  'login.error.createFailed': { ru: 'Не вышло создать аккаунт.', en: 'Could not create the account.' },
  'login.error.badCredentials': { ru: 'Неверный email или пароль.', en: 'Wrong email or password.' },
} as const
