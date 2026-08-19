// Shared chrome: the nav sidebar/tab-bar, account popover, notifications bell, the
// (i) info tooltip, theme toggle, the guarded delete confirm, the demo banner, and
// the password-confirm error strings from lib/session.ts + lib/msg.ts (shown by the
// same chrome, so they live here rather than in a domain shard).

export const navDict = {
  'nav.overview': { ru: 'Обзор', en: 'Overview' },
  'nav.loads': { ru: 'Грузы', en: 'Loads' },
  'nav.trucks': { ru: 'Траки', en: 'Trucks' },
  'nav.tracking': { ru: 'Трекинг', en: 'Track' },
  'nav.docs': { ru: 'Файлы', en: 'Docs' },
  'nav.brokers': { ru: 'Брокеры', en: 'Brokers' },
  'nav.tolls': { ru: 'Платные дороги', en: 'Tolls' },
  'nav.telegram': { ru: 'Telegram', en: 'Telegram' },
  'nav.finances': { ru: 'Финансы', en: 'Finances' },
  'nav.journal': { ru: 'Журнал', en: 'Log' },
  'nav.soon': { ru: 'скоро', en: 'soon' },
  'nav.collapse': { ru: 'Свернуть меню', en: 'Collapse menu' },
  'nav.expand': { ru: 'Развернуть меню', en: 'Expand menu' },
  'nav.notDoneYet': { ru: 'Ещё не сделано', en: 'Not built yet' },
  'nav.urgentDocs': { ru: 'Просрочено/истекает документов', en: 'Overdue/expiring documents' },
  'nav.switchToEnglish': { ru: 'Переключить на английский', en: 'Switch to English' },
  'nav.switchToRussian': { ru: 'Переключить на русский', en: 'Switch to Russian' },

  'userPanel.roleAdmin': { ru: 'Админ', en: 'Admin' },
  'userPanel.roleDispatcher': { ru: 'Диспетчер', en: 'Dispatcher' },
  'userPanel.close': { ru: 'Закрыть', en: 'Close' },
  'userPanel.changePassword': { ru: 'Сменить пароль', en: 'Change password' },
  'userPanel.newPasswordPlaceholder': { ru: 'Новый пароль, минимум 8 символов', en: 'New password, min 8 characters' },
  'userPanel.passwordChanged': { ru: 'Пароль изменён', en: 'Password changed' },
  'userPanel.quickSettings': { ru: 'Настройки', en: 'Settings' },
  'userPanel.adminSection': { ru: 'Администратор', en: 'Administrator' },
  // Подписи плиток. Держим в одно слово: они стоят НАД кружком шириной 36px и
  // обрезаются, если не влезли, — двухсловная подпись тут превращается в многоточие.
  'userPanel.tileLang': { ru: 'Язык', en: 'Language' },
  'userPanel.tileTheme': { ru: 'Тема', en: 'Theme' },
  'userPanel.tileJournal': { ru: 'Журнал', en: 'Journal' },
  'userPanel.tilePassword': { ru: 'Пароль', en: 'Password' },
  'userPanel.tileUsers': { ru: 'Люди', en: 'People' },
  'userPanel.tileImport': { ru: 'Импорт', en: 'Import' },
  'userPanel.tileKeys': { ru: 'Ключи', en: 'Keys' },
  'userPanel.actionsSection': { ru: 'Действия', en: 'Actions' },
  'userPanel.tileNewLoad': { ru: '+ Груз', en: '+ Load' },
  'userPanel.tileNewTruck': { ru: '+ Трак', en: '+ Truck' },
  'userPanel.tileBrokers': { ru: 'Брокеры', en: 'Brokers' },
  'userPanel.tileFinances': { ru: 'Финансы', en: 'Finance' },
  'userPanel.tileTelegram': { ru: 'Телеграм', en: 'Telegram' },
  'userPanel.tileRefresh': { ru: 'Обновить', en: 'Refresh' },
  'userPanel.admin': { ru: '🛡 Админ', en: '🛡 Admin' },
  'userPanel.logout': { ru: '⏻ Выйти', en: '⏻ Log out' },

  'notifier.title': { ru: 'Уведомления', en: 'Notifications' },
  'notifier.clear': { ru: 'очистить', en: 'clear' },
  'notifier.quiet': { ru: 'Пока тихо', en: 'Nothing yet' },
  'notifier.ariaWithCount': { ru: 'Уведомления: {n} новых', en: '{n} unread notifications' },
  'notifier.aria': { ru: 'Уведомления', en: 'Notifications' },

  'info.ariaLabel': { ru: 'Что это и как работает', en: 'What this is and how it works' },

  'theme.light': { ru: 'Светлая тема', en: 'Light theme' },
  'theme.dark': { ru: 'Тёмная тема', en: 'Dark theme' },

  'demo.banner': {
    ru: 'ДЕМО-режим — все данные ненастоящие, изменения не сохранятся навсегда.',
    en: 'DEMO mode — all data is fake, changes will not be saved permanently.',
  },
  'demo.signIn': { ru: 'Войти в свой аккаунт →', en: 'Sign in to your account →' },

  'deleteButton.title': { ru: 'Удалить', en: 'Delete' },
  'deleteButton.heading': { ru: 'Удалить', en: 'Delete' },
  'deleteButton.defaultNote': { ru: 'удалится насовсем.', en: 'will be permanently deleted.' },
  'deleteButton.body': {
    ru: 'Введи свой пароль — тот, которым входишь. Запись, кто удалил, останется в Журнале.',
    en: 'Enter your own login password. A record of who deleted it stays in the Log.',
  },
  'deleteButton.passwordPlaceholder': { ru: 'Твой пароль', en: 'Your password' },
  'deleteButton.deleted': { ru: 'Удалено', en: 'Deleted' },

  'session.expired': { ru: 'Сессия истекла — войди заново.', en: 'Your session expired — sign in again.' },
  'session.enterPassword': { ru: 'Введи пароль.', en: 'Enter your password.' },
  'session.wrongPassword': { ru: 'Неверный пароль.', en: 'Wrong password.' },

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
