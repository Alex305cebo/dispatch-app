// Shared chrome: the nav sidebar/tab-bar, account popover, notifications bell, the
// (i) info tooltip, theme toggle, the guarded delete confirm, the demo banner, and
// the password-confirm error strings from lib/session.ts + lib/msg.ts (shown by the
// same chrome, so they live here rather than in a domain shard).

export const navDict = {
  'nav.overview': { ru: 'Обзор', en: 'Overview', es: 'Resumen', uk: 'Огляд', ro: 'Prezentare' },
  'nav.loads': { ru: 'Грузы', en: 'Loads', es: 'Cargas', uk: 'Вантажі', ro: 'Curse' },
  'nav.trucks': { ru: 'Траки', en: 'Trucks', es: 'Camiones', uk: 'Траки', ro: 'Camioane' },
  'nav.tracking': { ru: 'Трекинг', en: 'Track', es: 'Rastreo', uk: 'Трекінг', ro: 'Urmărire' },
  'nav.docs': { ru: 'Файлы', en: 'Docs', es: 'Archivos', uk: 'Файли', ro: 'Fișiere' },
  'nav.brokers': { ru: 'Брокеры', en: 'Brokers', es: 'Brókers', uk: 'Брокери', ro: 'Brokeri' },
  // В боковом меню «Платные дороги» переносилось на две строки и толкало соседей.
  // «Толлы» — то самое слово, которым это и называют вслух в диспетчерской, и оно
  // втрое короче. Полное название осталось заголовком самого раздела.
  'nav.tolls': { ru: 'Толлы', en: 'Tolls', es: 'Peajes', uk: 'Толи', ro: 'Taxe drum' },
  'nav.telegram': { ru: 'Telegram', en: 'Telegram', es: 'Telegram', uk: 'Telegram', ro: 'Telegram' },
  'nav.finances': { ru: 'Финансы', en: 'Finances', es: 'Finanzas', uk: 'Фінанси', ro: 'Finanțe' },
  'nav.journal': { ru: 'Журнал', en: 'Log', es: 'Registro', uk: 'Журнал', ro: 'Jurnal' },
  'nav.soon': { ru: 'скоро', en: 'soon', es: 'pronto', uk: 'скоро', ro: 'în curând' },
  'nav.collapse': { ru: 'Свернуть меню', en: 'Collapse menu', es: 'Contraer menú', uk: 'Згорнути меню', ro: 'Restrânge meniul' },
  'nav.expand': { ru: 'Развернуть меню', en: 'Expand menu', es: 'Expandir menú', uk: 'Розгорнути меню', ro: 'Extinde meniul' },
  'nav.notDoneYet': { ru: 'Ещё не сделано', en: 'Not built yet', es: 'Aún no está hecho', uk: 'Ще не зроблено', ro: 'Încă nu este gata' },
  'nav.urgentDocs': { ru: 'Просрочено/истекает документов', en: 'Overdue/expiring documents', es: 'Documentos vencidos o por vencer', uk: 'Прострочено/спливає документів', ro: 'Documente expirate sau care expiră' },
  'nav.switchToEnglish': { ru: 'Переключить на английский', en: 'Switch to English', es: 'Cambiar a inglés', uk: 'Перемкнути на англійську', ro: 'Comută la engleză' },
  'nav.switchToRussian': { ru: 'Переключить на русский', en: 'Switch to Russian', es: 'Cambiar a ruso', uk: 'Перемкнути на російську', ro: 'Comută la rusă' },

  'userPanel.roleAdmin': { ru: 'Админ', en: 'Admin', es: 'Admin', uk: 'Адмін', ro: 'Admin' },
  'userPanel.roleDispatcher': { ru: 'Диспетчер', en: 'Dispatcher', es: 'Despachador', uk: 'Диспетчер', ro: 'Dispecer' },
  'userPanel.close': { ru: 'Закрыть', en: 'Close', es: 'Cerrar', uk: 'Закрити', ro: 'Închide' },
  'userPanel.changePassword': { ru: 'Сменить пароль', en: 'Change password', es: 'Cambiar contraseña', uk: 'Змінити пароль', ro: 'Schimbă parola' },
  'userPanel.newPasswordPlaceholder': { ru: 'Новый пароль, минимум 8 символов', en: 'New password, min 8 characters', es: 'Nueva contraseña, mínimo 8 caracteres', uk: 'Новий пароль, щонайменше 8 символів', ro: 'Parolă nouă, minimum 8 caractere' },
  'userPanel.passwordChanged': { ru: 'Пароль изменён', en: 'Password changed', es: 'Contraseña cambiada', uk: 'Пароль змінено', ro: 'Parola a fost schimbată' },
  'userPanel.quickSettings': { ru: 'Настройки', en: 'Settings', es: 'Ajustes', uk: 'Налаштування', ro: 'Setări' },
  'userPanel.adminSection': { ru: 'Администратор', en: 'Administrator', es: 'Administrador', uk: 'Адміністратор', ro: 'Administrator' },
  // Подписи плиток. Держим в одно слово: они стоят НАД кружком шириной 36px и
  // обрезаются, если не влезли, — двухсловная подпись тут превращается в многоточие.
  'userPanel.tileLang': { ru: 'Язык', en: 'Language', es: 'Idioma', uk: 'Мова', ro: 'Limbă' },
  'userPanel.tileTheme': { ru: 'Тема', en: 'Theme', es: 'Tema', uk: 'Тема', ro: 'Temă' },
  'userPanel.tileJournal': { ru: 'Журнал', en: 'Journal', es: 'Registro', uk: 'Журнал', ro: 'Jurnal' },
  'userPanel.tileRecovery': { ru: 'Дата восст.', en: 'Recovery', es: 'Recuperación', uk: 'Дата віднов.', ro: 'Recuperare' },
  'userPanel.recoveryHint': {
    ru: 'Дата рождения для «Забыли пароль?» на экране входа. Задайте или замените — прежняя перестанет действовать.',
    en: 'The birth date for "Forgot password?" on the sign-in screen. Set or replace it — the previous one stops working.',
    es: 'La fecha de nacimiento para «¿Olvidó la contraseña?» en la pantalla de acceso. Ponla o cámbiala — la anterior deja de servir.',
    uk: 'Дата народження для «Забули пароль?» на екрані входу. Задайте або замініть — попередня перестане діяти.',
    ro: 'Data nașterii pentru „Ai uitat parola?” pe ecranul de autentificare. Setează-o sau înlocuiește-o — cea veche nu mai funcționează.',
  },
  'userPanel.recoverySaved': { ru: 'Дата сохранена', en: 'Date saved', es: 'Fecha de recuperación guardada', uk: 'Дату відновлення збережено', ro: 'Data de recuperare a fost salvată' },
  'userPanel.tilePassword': { ru: 'Пароль', en: 'Password', es: 'Contraseña', uk: 'Пароль', ro: 'Parolă' },
  'userPanel.tileAdminPanel': { ru: 'Админ-панель', en: 'Admin panel', es: 'Panel de administración', uk: 'Адмін-панель', ro: 'Panou de administrare' },
  'userPanel.sectionsGroup': { ru: 'Разделы', en: 'Sections', es: 'Secciones', uk: 'Розділи', ro: 'Secțiuni' },
  'userPanel.tileUsers': { ru: 'Люди', en: 'People', es: 'Personas', uk: 'Люди', ro: 'Persoane' },
  'userPanel.tileImport': { ru: 'Импорт', en: 'Import', es: 'Importar', uk: 'Імпорт', ro: 'Import' },
  'userPanel.tileKeys': { ru: 'Ключи', en: 'Keys', es: 'Claves', uk: 'Ключі', ro: 'Chei' },
  'userPanel.actionsSection': { ru: 'Действия', en: 'Actions', es: 'Acciones', uk: 'Дії', ro: 'Acțiuni' },
  'userPanel.tileNewLoad': { ru: '+ Груз', en: '+ Load', es: '+ Carga', uk: '+ Вантаж', ro: '+ Cursă' },
  'userPanel.tileNewTruck': { ru: '+ Трак', en: '+ Truck', es: '+ Camión', uk: '+ Трак', ro: '+ Camion' },
  'userPanel.tileBrokers': { ru: 'Брокеры', en: 'Brokers', es: 'Brókers', uk: 'Брокери', ro: 'Brokeri' },
  'userPanel.tileFinances': { ru: 'Финансы', en: 'Finance', es: 'Finanzas', uk: 'Фінанси', ro: 'Finanțe' },
  'userPanel.tileTelegram': { ru: 'Телеграм', en: 'Telegram', es: 'Telegram', uk: 'Telegram', ro: 'Telegram' },
  'userPanel.tileRefresh': { ru: 'Обновить', en: 'Refresh', es: 'Actualizar', uk: 'Оновити', ro: 'Reîmprospătează' },
  'userPanel.admin': { ru: '🛡 Админ', en: '🛡 Admin', es: 'Administración', uk: 'Адміністрування', ro: 'Administrare' },
  'userPanel.logout': { ru: '⏻ Выйти', en: '⏻ Log out', es: 'Cerrar sesión', uk: 'Вийти', ro: 'Deconectare' },

  'notifier.title': { ru: 'Уведомления', en: 'Notifications', es: 'Notificaciones', uk: 'Сповіщення', ro: 'Notificări' },
  'notifier.clear': { ru: 'очистить', en: 'clear', es: 'Borrar', uk: 'Очистити', ro: 'Golește' },
  'notifier.quiet': { ru: 'Пока тихо', en: 'Nothing yet', es: 'Todo tranquilo', uk: 'Усе спокійно', ro: 'Totul e liniștit' },
  'notifier.ariaWithCount': { ru: 'Уведомления: {n} новых', en: '{n} unread notifications', es: 'Notificaciones: {n}', uk: 'Сповіщення: {n}', ro: 'Notificări: {n}' },
  'notifier.aria': { ru: 'Уведомления', en: 'Notifications', es: 'Notificaciones', uk: 'Сповіщення', ro: 'Notificări' },

  'info.ariaLabel': { ru: 'Что это и как работает', en: 'What this is and how it works', es: 'Explicación', uk: 'Пояснення', ro: 'Explicație' },

  'theme.light': { ru: 'Светлая тема', en: 'Light theme', es: 'Tema claro', uk: 'Світла тема', ro: 'Temă deschisă' },
  'theme.dark': { ru: 'Тёмная тема', en: 'Dark theme', es: 'Tema oscuro', uk: 'Темна тема', ro: 'Temă întunecată' },

  'demo.banner': {
    ru: 'ДЕМО-режим — все данные ненастоящие, изменения не сохранятся навсегда.',
    en: 'DEMO mode — all data is fake, changes will not be saved permanently.',
  },
  'demo.signIn': { ru: 'Войти в свой аккаунт →', en: 'Sign in to your account →' },

  'ai.err.quota': {
    ru: 'Кончился дневной бесплатный лимит ИИ — все модели исчерпаны. Обновится в 10:00 МСК (полночь по тихоокеанскому времени). До этого тип и данные документа можно задать вручную.',
    en: 'The free daily AI quota is used up on every model. It resets at midnight Pacific time. Until then set the document type and fields by hand.',
  },
  'ai.err.revoked': {
    ru: 'Google отозвал ключ ИИ (обычно — ключ попал в открытый доступ). Нужен новый ключ: Админ → Ключи.',
    en: 'Google revoked the AI key (usually because it leaked publicly). Create a new one: Admin → Keys.',
  },
  'ai.err.disabled': {
    ru: 'Ключ настоящий, но в проекте Google не включён Generative Language API. Проще всего создать ключ прямо в AI Studio (aistudio.google.com/apikey) — там он включается сам.',
    en: 'The key is real, but the Generative Language API is not enabled in that Google project. Easiest fix: create the key in AI Studio (aistudio.google.com/apikey), which enables it for you.',
  },
  'ai.err.restricted': {
    ru: 'У ключа стоят ограничения (по сайту-источнику, IP или списку API) — сервер под них не подходит. Снимите ограничения либо создайте ключ без них.',
    en: 'The key has restrictions (HTTP referrer, IP, or API list) the server does not satisfy. Remove them or create an unrestricted key.',
  },
  'ai.err.badkey': {
    ru: 'Ключ ИИ не принят. Проверьте его в разделе Админ → Ключи.',
    en: 'The AI key was rejected. Check it under Admin → Keys.',
  },
  'ai.err.busy': {
    ru: 'ИИ сейчас перегружен. Попробуйте ещё раз через минуту.',
    en: 'The AI is overloaded right now. Try again in a minute.',
  },
  'ai.err.other': { ru: 'ИИ не ответил', en: 'The AI did not answer' },
  'ai.err.kindUnknown': {
    ru: 'Не удалось определить тип файла (ИИ недоступен). Выберите тип и место стрелкой рядом с кнопкой.',
    en: 'Could not determine the file type (AI unavailable). Pick type and destination with the arrow next to the button.',
  },
  'error.heading': { ru: 'Страница не открылась', en: 'This page did not open', es: 'Algo se rompió', uk: 'Щось зламалося', ro: 'Ceva s-a stricat' },
  'error.body': {
    ru: 'Сбой на этой странице — остальное приложение работает. Чаще всего виновата чужая служба (карты, ELD, ИИ), и повторная попытка помогает сразу. Если повторяется — скажите, что делали, и я посмотрю по метке ниже.',
    en: 'This page failed — the rest of the app is fine. Usually it is an outside service (maps, ELD, AI) and a retry fixes it. If it keeps happening, say what you were doing and quote the code below.',
  },
  'error.retry': { ru: 'Попробовать снова', en: 'Try again', es: 'Reintentar', uk: 'Спробувати ще раз', ro: 'Încearcă din nou' },
  'error.toOverview': { ru: 'На обзор', en: 'To overview', es: 'Al resumen', uk: 'До огляду', ro: 'La prezentare' },
  'error.code': { ru: 'метка ошибки:', en: 'error code:', es: 'Código del error', uk: 'Код помилки', ro: 'Codul erorii' },
  'deleteButton.title': { ru: 'Удалить', en: 'Delete', es: 'Eliminar', uk: 'Видалити', ro: 'Șterge' },
  'deleteButton.heading': { ru: 'Удалить', en: 'Delete' },
  'deleteButton.defaultNote': { ru: 'удалится насовсем.', en: 'will be permanently deleted.' },
  'deleteButton.body': {
    ru: 'Напечатай DELETE заглавными буквами, чтобы подтвердить. Запись, кто удалил, останется в Журнале.',
    en: 'Type DELETE in capital letters to confirm. A record of who deleted it stays in the Log.',
  },
  'deleteButton.deleted': { ru: 'Удалено', en: 'Deleted', es: 'Eliminado', uk: 'Видалено', ro: 'Șters' },

  'session.expired': { ru: 'Сессия истекла — войди заново.', en: 'Your session expired — sign in again.', es: 'La sesión ha expirado. Vuelve a entrar.', uk: 'Сесія завершилася. Увійдіть знову.', ro: 'Sesiunea a expirat. Autentifică-te din nou.' },
  'session.enterPassword': { ru: 'Введи пароль.', en: 'Enter your password.', es: 'Escribe tu contraseña', uk: 'Введіть свій пароль', ro: 'Introdu parola ta' },
  'session.wrongPassword': { ru: 'Неверный пароль.', en: 'Wrong password.', es: 'Contraseña incorrecta', uk: 'Невірний пароль', ro: 'Parolă greșită' },
  'session.typeDelete': {
    ru: 'Чтобы удалить, напечатай DELETE заглавными буквами.',
    en: 'To delete, type DELETE in capital letters.',
  },

  'msg.needMiles': { ru: 'Укажи мили — без них расчёта нет.', en: 'Enter miles — the calc needs them.' },
  'msg.transitDaysPositive': { ru: 'Дней в пути должно быть больше нуля.', en: 'Transit days must be more than zero.' },
  'msg.deadheadNegative': { ru: 'Deadhead не может быть отрицательным.', en: 'Deadhead cannot be negative.' },
  'msg.mpgPositive': { ru: 'MPG должен быть больше нуля — проверь настройки трака.', en: 'MPG must be more than zero — check the truck settings.' },
  'msg.rateNegative': { ru: 'Ставка не может быть отрицательной.', en: 'Rate cannot be negative.' },
  'msg.cutsOver100': {
    ru: 'Водитель, факторинг и диспетч вместе должны забирать меньше 100% гросса.',
    en: 'Driver pay, factoring, and dispatch together must add up to less than 100% of gross.',
  },
} as const
