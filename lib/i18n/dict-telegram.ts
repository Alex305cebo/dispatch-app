// Telegram domain: app/telegram/**, lib/tg-intake.ts, lib/telegram.ts.

export const telegramDict = {
  // app/telegram/page.tsx
  'telegram.page.needLogin': { ru: 'Войди под своим аккаунтом, чтобы подключить личный Telegram.', en: 'Log in to your account to connect your personal Telegram.' },
  'telegram.page.noAccess': { ru: 'Доступ к этому разделу пока даёт только администратор.', en: 'Only an admin can grant access to this section right now.' },
  'telegram.page.tooltip': {
    ru: 'Переписка с водителями прямо в приложении через ТВОЙ Telegram-аккаунт (не бот) — водителям ничего ставить и нажимать не нужно. У каждого диспетчера свой аккаунт со своими диалогами. Отметь в настройках, какие чаты показывать, и привяжи их к тракам — фото POD/BOL от водителя ИИ сам прикрепит к грузу.',
    en: 'Message drivers right inside the app through YOUR Telegram account (not a bot) — drivers don\'t install or tap anything. Each dispatcher has their own account with their own chats. Pick which chats to show in settings, and link them to trucks — the AI will attach POD/BOL photos from the driver to the load automatically.',
  },
  'telegram.page.yourAccount': { ru: 'Твой аккаунт', en: 'Your account' },
  'telegram.page.noneShownYet': {
    ru: 'Пока ни один чат не отмечен для показа — открой «Настроить, какие чаты показывать» выше.',
    en: 'No chats are marked to show yet — open "Choose which chats to show" above.',
  },
  'telegram.page.pickDialog': { ru: 'Выбери диалог слева.', en: 'Pick a conversation on the left.' },
  'telegram.page.pdfPreviewAlt': { ru: 'Превью PDF', en: 'PDF preview' },
  'telegram.page.defaultDocName': { ru: 'Документ.pdf', en: 'Document.pdf' },
  'telegram.page.openPdf': { ru: 'Открыть PDF', en: 'Open PDF' },
  'telegram.page.attachment': { ru: '[вложение]', en: '[attachment]' },
  'telegram.page.bytesUnit': { ru: 'Б', en: 'B' },
  'telegram.page.kbUnit': { ru: 'КБ', en: 'KB' },
  'telegram.page.mbUnit': { ru: 'МБ', en: 'MB' },

  // app/telegram/actions.ts
  'telegram.actions.needLogin': { ru: 'Нужно войти.', en: 'You need to log in.' },
  'telegram.actions.noAccess': { ru: 'Доступ к Telegram пока не открыт администратором.', en: 'Access to Telegram hasn\'t been granted by an admin yet.' },
  'telegram.actions.needCreds': { ru: 'Нужны api_id, api_hash и телефон.', en: 'api_id, api_hash, and phone are required.' },
  'telegram.actions.codeSendFailed': { ru: 'Не отправился код', en: 'Code failed to send' },
  'telegram.actions.loginFailed': { ru: 'Вход не удался', en: 'Login failed' },
  'telegram.actions.noTruckLinked': {
    ru: 'Этот чат не привязан ни к одному траку — укажи телефон в паспорте трака или привяжи чат к траку.',
    en: 'This chat isn\'t linked to any truck — add the phone to the truck\'s passport, or link the chat to a truck.',
  },
  'telegram.actions.noActiveLoad': { ru: 'У этого трака сейчас нет активного груза.', en: 'This truck has no active load right now.' },
  'telegram.actions.downloadFailed': { ru: 'Не удалось скачать файл из Telegram.', en: 'Couldn\'t download the file from Telegram.' },
  'telegram.actions.emptyMessage': { ru: 'Пустое сообщение.', en: 'Empty message.' },
  'telegram.actions.sendFailed': { ru: 'Не отправилось', en: 'Failed to send' },

  // app/telegram/tg-chat.tsx
  'telegram.chat.placeholder': { ru: 'Сообщение водителю…', en: 'Message to driver…' },
  'telegram.chat.unlockedTitle': { ru: 'Отправка разблокирована ещё {n}с', en: 'Sending unlocked for {n}s more' },
  'telegram.chat.lockedTitle': { ru: 'Отправить — сначала подтверди своим паролем', en: 'Send — confirm with your password first' },
  'telegram.chat.close': { ru: 'Закрыть', en: 'Close' },
  'telegram.chat.confirmText': {
    ru: 'Сообщение уйдёт водителю — отменить будет нельзя. Введи свой пароль (тот, которым входишь), чтобы разблокировать отправку на 2 минуты:',
    en: 'This message will go to the driver — it can\'t be unsent. Enter your password (the one you log in with) to unlock sending for 2 minutes:',
  },
  'telegram.chat.passwordPlaceholder': { ru: 'Твой пароль', en: 'Your password' },
  'telegram.chat.unlock': { ru: 'Разблокировать', en: 'Unlock' },
  'telegram.chat.secondsSuffix': { ru: 'с', en: 's' },

  // app/telegram/tg-chat-settings.tsx
  'telegram.settings.summary': { ru: 'Настроить, какие чаты показывать', en: 'Choose which chats to show' },
  'telegram.settings.marked': { ru: 'отмечено {a} из {b}', en: '{a} of {b} checked' },
  'telegram.settings.explain': {
    ru: 'Отмеченные диалоги видны в списке слева. Всё остальное скрыто. Рядом можно привязать чат к траку — так фото POD/BOL от водителя сами прикрепятся к его грузу.',
    en: 'Checked conversations show up in the list on the left. Everything else is hidden. You can also link a chat to a truck — POD/BOL photos from that driver will then attach to their load automatically.',
  },
  'telegram.settings.noneVisible': { ru: 'Диалогов не видно на этом аккаунте.', en: 'No conversations visible on this account.' },
  'telegram.settings.group': { ru: 'группа', en: 'group' },
  'telegram.settings.pickTruck': { ru: '— трак —', en: '— truck —' },
  'telegram.settings.saving': { ru: 'Сохраняю…', en: 'Saving…' },
  'telegram.settings.save': { ru: 'Сохранить список', en: 'Save list' },
  'telegram.settings.saved': { ru: 'Список чатов обновлён', en: 'Chat list updated' },

  // app/telegram/tg-setup.tsx
  'telegram.setup.codeRequested': { ru: 'Код запрошен', en: 'Code requested' },
  'telegram.setup.connected': { ru: 'Telegram подключён', en: 'Telegram connected' },
  'telegram.setup.title': { ru: 'Подключение Telegram', en: 'Connect Telegram' },
  'telegram.setup.introPre': { ru: 'Подключается', en: 'This connects' },
  'telegram.setup.introBold': { ru: 'твой', en: 'your' },
  'telegram.setup.introPost': { ru: 'аккаунт — водители ничего не устанавливают и не нажимают.', en: 'account — drivers don\'t install or tap anything.' },
  'telegram.setup.apiHint': { ru: 'api_id/api_hash —', en: 'api_id/api_hash —' },
  'telegram.setup.apiHintSuffix': { ru: '→ API development tools.', en: '→ API development tools.' },
  'telegram.setup.phonePlaceholder': { ru: 'Телефон (+1...)', en: 'Phone (+1...)' },
  'telegram.setup.sendingCode': { ru: 'Отправляю код…', en: 'Sending code…' },
  'telegram.setup.getCode': { ru: 'Получить код в Telegram', en: 'Get code in Telegram' },
  'telegram.setup.codePlaceholder': { ru: 'Код из Telegram', en: 'Code from Telegram' },
  'telegram.setup.checking': { ru: 'Проверяю…', en: 'Checking…' },
  'telegram.setup.logIn': { ru: 'Войти', en: 'Log in' },
  'telegram.setup.twoFaText': { ru: 'Включён облачный пароль (2FA) — введи его:', en: 'Cloud password (2FA) is enabled — enter it:' },
  'telegram.setup.cloudPasswordPlaceholder': { ru: 'Облачный пароль', en: 'Cloud password' },
  'telegram.setup.confirm': { ru: 'Подтвердить', en: 'Confirm' },
  'telegram.setup.footer': {
    ru: 'Вход — один раз, локально. Дальше сессия хранится на сервере и работает везде.',
    en: 'Log in once, locally. After that the session lives on the server and works everywhere.',
  },

  // app/telegram/tg-image.tsx
  'telegram.image.alt': { ru: 'Вложение', en: 'Attachment' },
  'telegram.image.download': { ru: 'Скачать', en: 'Download' },
  'telegram.image.copyLink': { ru: 'Скопировать ссылку', en: 'Copy link' },
  'telegram.image.linkCopied': { ru: 'Ссылка скопирована', en: 'Link copied' },
  'telegram.image.close': { ru: 'Закрыть', en: 'Close' },
  'telegram.image.hintZoomed': { ru: 'Тяните, чтобы двигать · нажмите, чтобы отдалить', en: 'Drag to move · tap to zoom out' },
  'telegram.image.hintFit': { ru: 'Нажмите на фото, чтобы приблизить', en: 'Tap the photo to zoom in' },
  'telegram.image.hintCloseSuffix': { ru: 'Escape или тап по фону — закрыть', en: 'Escape or tap the background to close' },

  // app/telegram/tg-attach-button.tsx
  'telegram.attach.inLoad': { ru: '✓ В грузе {route} →', en: '✓ On load {route} →' },
  'telegram.attach.createdLoad': { ru: '✓ Создан груз {route} →', en: '✓ Load created: {route} →' },
  'telegram.attach.created': { ru: 'Из рейт-кона создан груз {route}', en: 'Rate con turned into load {route}' },
  'telegram.attach.added': { ru: 'Добавлено к грузу {route}', en: 'Added to load {route}' },
  'telegram.attach.adding': { ru: 'Добавляю…', en: 'Adding…' },
  'telegram.actions.rcSavedNotRead': {
    ru: 'Рейт-кон сохранён в файлах трака, но прочитать его не удалось. Откройте карточку трака и нажмите «Создать груз из рейт-кона».',
    en: 'The rate con is saved in the truck files, but could not be read. Open the truck and press "Create load from rate con".',
  },
  'telegram.attach.toDriverLoad': { ru: '📎 В груз водителя', en: '📎 To driver\'s load' },

  // app/telegram/tg-disconnect-button.tsx
  'telegram.disconnect.wrongAccount': { ru: 'Не тот аккаунт?', en: 'Wrong account?' },
  'telegram.disconnect.confirmText': { ru: 'Отключить и подключить заново?', en: 'Disconnect and reconnect?' },
  'telegram.disconnect.done': { ru: 'Аккаунт отключён', en: 'Account disconnected' },
  'telegram.disconnect.yes': { ru: 'Да, отключить', en: 'Yes, disconnect' },
  'telegram.disconnect.cancel': { ru: 'Отмена', en: 'Cancel' },

  // app/telegram/tg-check-button.tsx
  'telegram.check.result': { ru: 'Прикреплено: {attached} · пропущено: {skipped} · напоминаний: {nudged}', en: 'Attached: {attached} · skipped: {skipped} · reminders: {nudged}' },
  'telegram.check.checking': { ru: 'Проверяю…', en: 'Checking…' },
  'telegram.check.checkNow': { ru: 'Проверить документы сейчас', en: 'Check documents now' },

  // lib/telegram.ts
  'telegram.lib.notConnected': { ru: 'Telegram не подключён', en: 'Telegram isn\'t connected' },
  'telegram.lib.chatNotFound': { ru: 'Чат не найден среди последних диалогов.', en: 'Chat not found among recent conversations.' },
  'telegram.lib.loginExpired': { ru: 'Сессия логина истекла — начни заново.', en: 'Login session expired — start over.' },
  'telegram.lib.noName': { ru: 'Без имени', en: 'No name' },
  'telegram.lib.deliveryHintApp': {
    ru: 'Telegram отправил код СООБЩЕНИЕМ В САМ TELEGRAM — в чат «Telegram» аккаунта с номером {phone}. Не SMS.',
    en: 'Telegram sent the code AS A MESSAGE INSIDE TELEGRAM ITSELF — in the "Telegram" chat of the account with number {phone}. Not SMS.',
  },
  'telegram.lib.deliveryHintSms': { ru: 'Telegram отправил код SMS-кой на {phone}.', en: 'Telegram sent the code by SMS to {phone}.' },
} as const
