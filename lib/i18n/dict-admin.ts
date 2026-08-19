// Admin domain: app/admin/**, app/logins/**, app/account/actions.ts,
// lib/capabilities.ts.

export const adminDict = {
  'admin.title': { ru: 'Админ-панель', en: 'Admin panel' },
  'admin.subtitle': {
    ru: 'Пользователи, права, настройки компании и журнал действий — видно только администраторам.',
    en: 'Users, permissions, company settings, and the activity log — visible to admins only.',
  },

  'admin.usersHeading': { ru: 'Пользователи и права', en: 'Users and permissions' },
  'admin.usersInfo': {
    ru: 'Кто может войти в приложение. У каждого диспетчера под «Права диспетчера» — переключатели доступа к функциям (отчёты, Telegram, финансы и т.д.). Отключить пользователя — сразу гасит все его текущие входы.',
    en: 'Who can sign in to the app. Each dispatcher has "Dispatcher permissions" toggles for feature access (reports, Telegram, finances, etc). Disabling a user immediately kills all of their active sessions.',
  },

  // Админ → Ключи. Приложение ставится отдельно каждой компании, поэтому у каждой
  // установки свои ключи, и заводит их администратор, а не тот, кто её ставил.
  'admin.keysHeading': { ru: 'Ключи', en: 'Keys' },
  'admin.keysInfo': {
    ru: 'Ключи этой установки к внешним сервисам. Заводятся бесплатно и принадлежат вашей компании: лимиты ваши, счёт ваш. Ключ никогда не показывается обратно — только «задан» или «не задан», заменить можно в любой момент.',
    en: "This installation's own keys to outside services. They are free to obtain and belong to your company: your limits, your bill. A key is never shown back — only 'set' or 'not set' — and can be replaced at any time.",
  },
  'admin.keys.set': { ru: 'задан', en: 'set' },
  'admin.keys.notSet': { ru: 'не задан', en: 'not set' },
  'admin.keys.where': { ru: 'где взять →', en: 'where to get it →' },
  'admin.keys.newPlaceholder': { ru: 'Вставьте ключ', en: 'Paste the key' },
  'admin.keys.replacePlaceholder': { ru: 'Оставьте пустым, чтобы не менять', en: 'Leave empty to keep the current one' },
  'admin.keys.saved': { ru: 'Ключи сохранены', en: 'Keys saved' },
  'admin.keys.gemini': { ru: 'Искусственный интеллект', en: 'Artificial intelligence' },
  'admin.keys.geminiHint': {
    ru: 'Распознавание rate confirmation и фото документов. Ключ бесплатный, выдаётся сразу на ваш Google-аккаунт. Если позже подключите там оплату, тот же ключ получит платные лимиты — в приложении менять ничего не нужно. Чтобы стереть ключ, введите один дефис.',
    en: 'Rate-confirmation and document-photo recognition. The key is free and issued instantly to your Google account. If you later enable billing there, the same key gets the paid limits — nothing changes in the app. To erase a key, enter a single dash.',
  },
  'admin.keys.fmcsa': { ru: 'Проверка брокеров (FMCSA)', en: 'Broker checks (FMCSA)' },
  'admin.keys.fmcsaHint': {
    ru: 'Проверка полномочий и страховки брокера по базе FMCSA. Ключ бесплатный, выдаётся сразу.',
    en: "Broker authority and insurance lookups against the FMCSA database. The key is free and issued instantly.",
  },
  'admin.keys.here': { ru: 'Ключ HERE (платные дороги)', en: 'HERE key (tolls)' },
  'admin.keys.hereHint': {
    ru: 'Считает стоимость платных дорог для трака по осям и весу. Бесплатный уровень HERE покрывает парк с запасом; без ключа раздел «Платные дороги» просто скажет, что считать нечем.',
    en: 'Prices toll roads for a truck by axles and weight. HERE’s free tier covers a fleet this size with room to spare; without a key the Tolls section simply says it has nothing to calculate with.',
  },
  'admin.keys.modelPref': { ru: 'Что важнее при распознавании', en: 'Recognition priority' },
  'admin.keys.modelSaving': { ru: 'Экономия', en: 'Economy' },
  'admin.keys.modelQuality': { ru: 'Качество', en: 'Quality' },
  'admin.keys.modelSavingHint': {
    ru: 'Сначала пробуется модель с большим суточным лимитом. Это правильный выбор на бесплатном тарифе, где заканчиваются не токены, а количество запросов за день.',
    en: 'The model with the larger daily allowance is tried first. This is the right choice on the free tier, where what runs out is the number of requests per day, not tokens.',
  },
  'admin.keys.modelQualityHint': {
    ru: 'Сначала пробуется более сильная модель. Имеет смысл, только если в Google-аккаунте подключена оплата: на бесплатном тарифе её суточный лимит закончится после двух десятков документов.',
    en: 'The stronger model is tried first. Worth choosing only if billing is enabled on the Google account: on the free tier its daily allowance runs out after a couple of dozen documents.',
  },

  'admin.openAccessHeading': { ru: 'Открытый доступ', en: 'Open access' },
  'admin.openAccessInfo': {
    ru: 'Временно убрать вход для всех — например, чтобы кто-то посмотрел живые данные без своего аккаунта. Эта панель всегда остаётся под входом, чтобы можно было выключить обратно.',
    en: 'Temporarily remove the login requirement for everyone — e.g. so someone can view live data without their own account. This panel always stays behind login, so it can always be switched back off.',
  },

  'admin.companyHeading': { ru: 'Настройки компании', en: 'Company settings' },
  'admin.companyInfo': {
    ru: 'Название, MC/DOT, реквизиты — то, что попадает в счета брокерам.',
    en: 'Name, MC/DOT, and billing details — what goes on invoices sent to brokers.',
  },

  'admin.upNextHeading': { ru: 'На очереди', en: 'Coming up' },
  'admin.upNextInfo': {
    ru: 'Реально можно построить, но нужны детали от тебя, прежде чем начинать — без них это просто макет, а не рабочая функция.',
    en: "Genuinely buildable, but needs details from you before starting — without them it's just a mockup, not a working feature.",
  },
  'admin.factoringTitle': { ru: 'Факторинг в 1 клик', en: 'One-click factoring' },
  'admin.factoringDesc': {
    ru: 'Автоматическая отправка собранного инвойса твоей факторинговой компании. Нужно от тебя: с какой компанией работаешь (Apex Capital, Triumph, RTS и т.п.) и доступ к их API/порталу — обычно выдают клиенту по запросу.',
    en: 'Automatically send the assembled invoice to your factoring company. Needed from you: which company you work with (Apex Capital, Triumph, RTS, etc) and access to their API/portal — usually issued to clients on request.',
  },
  'admin.iftaTitle': { ru: 'IFTA-отчёт в 1 клик', en: 'One-click IFTA report' },
  'admin.iftaDesc': {
    ru: 'Автоматический расчёт квартального топливного налога по штатам. Нужно от тебя: базовый штат регистрации IFTA и источник миль/топлива по штатам (ELD, если провайдер их отдаёт, или квитанции вручную).',
    en: 'Automatic calculation of the quarterly fuel tax by state. Needed from you: your IFTA base registration state and a source for miles/fuel by state (ELD if your provider exposes it, or manual receipts).',
  },

  'admin.journalHeading': { ru: 'Журнал действий', en: 'Activity log' },
  'admin.journalInfo': {
    ru: 'Кто и когда заходил, с какого устройства и откуда — плюс удаления документов. Полная версия — по ссылке.',
    en: 'Who signed in and when, from what device and where — plus document deletions. Full version at the link.',
  },
  'admin.journalOpen': { ru: 'Открыть →', en: 'Open →' },

  // Capability labels/descriptions (lib/capabilities.ts → capabilityMeta())
  'admin.cap.dispatcherReport.label': { ru: 'Отчёт «По диспетчерам»', en: '"By dispatcher" report' },
  'admin.cap.dispatcherReport.desc': {
    ru: 'Видеть вкладку «Финансы → По диспетчерам» — заработок ВСЕХ диспетчеров по неделям.',
    en: 'See the "Finances → By dispatcher" tab — weekly earnings for ALL dispatchers.',
  },
  'admin.cap.telegram.label': { ru: 'Telegram', en: 'Telegram' },
  'admin.cap.telegram.desc': {
    ru: 'Подключить свой Telegram и переписываться с водителями прямо в приложении.',
    en: 'Connect your own Telegram and message drivers right inside the app.',
  },
  'admin.cap.finances.label': { ru: 'Финансы (оплаты, инвойсы)', en: 'Finances (payments, invoices)' },
  'admin.cap.finances.desc': {
    ru: 'Открывать раздел «Финансы», собирать инвойсы и отмечать грузы оплаченными.',
    en: 'Open the Finances section, assemble invoices, and mark loads as paid.',
  },
  'admin.cap.editTrucks.label': { ru: 'Редактирование траков и расходов', en: 'Edit trucks and expenses' },
  'admin.cap.editTrucks.desc': {
    ru: 'Менять экономику трака (MPG, ставка водителя, фиксы) — влияет на все расчёты.',
    en: "Change a truck's economics (MPG, driver pay, fixed costs) — affects every calculation.",
  },

  // User list (app/admin/user-list.tsx)
  'admin.users.addedOk': { ru: 'Пользователь добавлен', en: 'User added' },
  'admin.users.you': { ru: 'это ты', en: 'you' },
  'admin.users.disabledBadge': { ru: 'отключён', en: 'disabled' },
  'admin.users.password': { ru: 'Пароль', en: 'Password' },
  'admin.users.enable': { ru: 'Включить', en: 'Enable' },
  'admin.users.disable': { ru: 'Отключить', en: 'Disable' },
  'admin.users.accessEnabled': { ru: 'Доступ включён', en: 'Access enabled' },
  'admin.users.accessDisabled': { ru: 'Доступ отключён', en: 'Access disabled' },
  'admin.users.save': { ru: 'Сохранить', en: 'Save' },
  'admin.users.dispatcherPerms': { ru: 'Права диспетчера', en: 'Dispatcher permissions' },
  'admin.users.passwordReset': {
    ru: 'Пароль сброшен — прежние сессии этого пользователя завершены',
    en: "Password reset — this user's previous sessions were ended",
  },
  'admin.users.permsUpdated': { ru: 'Права обновлены', en: 'Permissions updated' },
  'admin.users.namePlaceholder': { ru: 'Имя', en: 'Name' },
  'admin.users.emailPlaceholder': { ru: 'Email', en: 'Email' },
  'admin.users.passwordPlaceholder': { ru: 'Пароль, минимум 8 символов', en: 'Password, min 8 characters' },
  'admin.users.add': { ru: 'Добавить', en: 'Add' },
  'admin.users.cancel': { ru: 'Отмена', en: 'Cancel' },
  'admin.users.addUser': { ru: '+ Добавить пользователя', en: '+ Add user' },

  // Open access toggle (app/admin/open-access-toggle.tsx)
  'admin.openAccess.turnedOff': { ru: 'Вход снова обязателен', en: 'Login is required again' },
  'admin.openAccess.turnedOn': { ru: 'Открытый доступ включён', en: 'Open access enabled' },
  'admin.openAccess.currentlyOn': {
    ru: 'Сейчас приложение открыто для всех, без входа — кроме этой панели.',
    en: 'The app is currently open to everyone, no login — except this panel.',
  },
  'admin.openAccess.currentlyOff': {
    ru: 'Сейчас нужен вход. Включи, чтобы приложение открылось всем без пароля.',
    en: 'Login is currently required. Turn on to open the app to everyone without a password.',
  },
  'admin.openAccess.turnOff': { ru: 'Выключить', en: 'Turn off' },
  'admin.openAccess.turnOn': { ru: 'Включить', en: 'Turn on' },

  // Server action errors (app/admin/actions.ts, app/account/actions.ts)
  'admin.err.adminOnly': { ru: 'Только для администратора.', en: 'Admins only.' },
  'admin.err.unknownCapability': { ru: 'Неизвестное право.', en: 'Unknown permission.' },
  'admin.err.enterName': { ru: 'Впиши имя.', en: 'Enter a name.' },
  'admin.err.invalidEmail': { ru: 'Некорректный email.', en: 'Invalid email.' },
  'admin.err.demoReadOnly': {
    ru: 'Демо-аккаунт общий для всех — пароль в нём менять нельзя.',
    en: 'The demo account is shared by everyone — its password cannot be changed.',
  },
  'admin.err.passwordMin8': { ru: 'Пароль — минимум 8 символов.', en: 'Password — minimum 8 characters.' },
  'admin.err.emailTaken': { ru: 'Этот email уже занят.', en: 'This email is already taken.' },
  'admin.err.notAuthorized': { ru: 'Не авторизован.', en: 'Not signed in.' },

  // Journal / log page (app/logins/page.tsx)
  'admin.logins.pc': { ru: 'ПК', en: 'PC' },
  'admin.logins.title': { ru: 'Журнал', en: 'Log' },
  'admin.logins.subtitle': {
    ru: 'Кто, что и откуда: входы и действия с документами · последние {n}',
    en: 'Who, what, and from where: logins and document actions · last {n}',
  },
  'admin.logins.geminiSpend': { ru: 'Расход ИИ', en: 'AI spend' },
  // Единственное место, где поставщик ещё назван, и намеренно: это админ-панель за
  // логином, и без адреса консоли цифра расхода не даёт владельцу ничего — свериться
  // с настоящим лимитом будет негде.
  'admin.logins.geminiInfo': {
    ru: 'Сколько токенов приложение потратило на распознавание rate con. Это наш счётчик — считает с момента добавления. Полный и точный расход (и лимиты) — в консоли поставщика ИИ (aistudio.google.com) по твоему API-ключу.',
    en: 'How many tokens the app has spent recognizing rate cons. This is our own counter, tracking since it was added. The full, exact spend (and limits) is in the AI provider console (aistudio.google.com) under your API key.',
  },
  'admin.logins.tokens': { ru: 'токенов', en: 'tokens' },
  'admin.logins.calls': { ru: 'запросов', en: 'requests' },
  'admin.logins.since': { ru: 'с ', en: 'since ' },
  'admin.logins.emptyTitle': { ru: 'Пока пусто', en: 'Nothing yet' },
  'admin.logins.emptyBody': {
    ru: 'Здесь появятся входы и действия: кто, что, откуда (город по IP) и когда.',
    en: 'Logins and actions will show up here: who, what, from where (city by IP), and when.',
  },
  'admin.logins.colWho': { ru: 'Кто', en: 'Who' },
  'admin.logins.colWhat': { ru: 'Что', en: 'What' },
  'admin.logins.colWhere': { ru: 'Откуда', en: 'Where' },
  'admin.logins.colWhen': { ru: 'Когда', en: 'When' },
  'admin.logins.noName': { ru: 'Без имени', en: 'No name' },
  'admin.logins.loggedIn': { ru: 'Вход', en: 'Logged in' },
  'admin.logins.local': { ru: 'локально', en: 'local' },
  'admin.logins.docFallback': { ru: 'документ', en: 'document' },
  'admin.logins.deletedLoad': { ru: 'Удалил груз «{target}»', en: 'Deleted load "{target}"' },
  'admin.logins.purgedDoc': {
    ru: 'Удалил из корзины насовсем {doc} «{target}»',
    en: 'Permanently deleted {doc} "{target}" from trash',
  },
  'admin.logins.deletedTodo': { ru: 'Удалил задачу «{target}»', en: 'Deleted task "{target}"' },
  'admin.logins.deletedMaintenance': {
    ru: 'Удалил запись ремонта «{target}»',
    en: 'Deleted maintenance record "{target}"',
  },
  'admin.logins.trashedDoc': { ru: 'Удалил (в корзину) {doc} «{target}»', en: 'Deleted (to trash) {doc} "{target}"' },
} as const
