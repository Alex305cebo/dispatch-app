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
  // Заявка на аккаунт с экрана входа
  'login.register_title': { ru: 'Новый аккаунт', en: 'New account' },
  'login.register_subtitle': {
    ru: 'Аккаунт создастся сразу, но войти можно будет после того, как администратор компании подтвердит заявку в разделе «Люди».',
    en: 'The account is created right away, but you can sign in once a company administrator approves the request under People.',
  },
  'login.register_submit': { ru: 'Отправить заявку', en: 'Send request' },
  'login.registerLink': { ru: 'Создать аккаунт', en: 'Create an account' },
  // Забыл пароль
  'login.forgot_title': { ru: 'Сброс пароля', en: 'Reset password' },
  'login.forgot_subtitle': {
    ru: 'Введите email, код восстановления (его выдали при создании аккаунта) и новый пароль. Кода нет — попросите администратора сбросить пароль в разделе «Люди».',
    en: 'Enter your email, the recovery code you were given when the account was created, and a new password. No code — ask an administrator to reset it under People.',
  },
  'login.forgot_submit': { ru: 'Сменить пароль', en: 'Change password' },
  'login.forgotLink': { ru: 'Забыли пароль?', en: 'Forgot password?' },
  'login.backToSignIn': { ru: 'К входу', en: 'Back to sign in' },
  'login.recoveryCode': { ru: 'Код восстановления', en: 'Recovery code' },
  'login.newPassword': { ru: 'Новый пароль', en: 'New password' },
  // Экран с выданным кодом
  'login.code.title': { ru: 'Сохраните код восстановления', en: 'Save your recovery code' },
  'login.code.text': {
    ru: 'Если забудете пароль, этот код — единственный способ его сменить самому. Запишите его или сохраните в менеджере паролей.',
    en: 'If you forget your password, this code is the only way to change it yourself. Write it down or keep it in a password manager.',
  },
  'login.code.hint': {
    ru: 'Показывается один раз. Новый можно выпустить в меню аккаунта — прежний тогда перестанет действовать.',
    en: 'Shown once. A new one can be issued from the account menu — the old one stops working then.',
  },
  'login.code.waitAdmin': {
    ru: 'Заявка отправлена. Войти получится после подтверждения администратором.',
    en: 'Request sent. You can sign in once an administrator approves it.',
  },
  'login.code.saved': { ru: 'Записал — войти', en: 'Saved it — sign in' },
  'login.code.backToSignIn': { ru: 'Понятно', en: 'Got it' },
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
  'login.error.pending': {
    ru: 'Пароль верный, но заявку ещё не подтвердил администратор. Попросите его зайти в «Люди».',
    en: 'The password is right, but an administrator has not approved the request yet. Ask them to check People.',
  },
  'login.error.useSetup': {
    ru: 'Аккаунтов ещё нет — первый создаётся через установку, обновите страницу.',
    en: 'There are no accounts yet — the first one is created through setup; reload the page.',
  },
  'login.error.badRecovery': {
    ru: 'Email или код восстановления не подходят.',
    en: 'The email or recovery code does not match.',
  },
  'login.error.emailTaken': { ru: 'Этот email уже занят.', en: 'This email is already taken.' },
  'login.error.createFailed': { ru: 'Не вышло создать аккаунт.', en: 'Could not create the account.' },
  'login.error.badCredentials': { ru: 'Неверный email или пароль.', en: 'Wrong email or password.' },
} as const
