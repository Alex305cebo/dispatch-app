// Telegram domain: app/telegram/**, lib/tg-intake.ts, lib/telegram.ts.

export const telegramDict = {
  // app/telegram/page.tsx
  'telegram.page.needLogin': { ru: 'Войди под своим аккаунтом, чтобы подключить личный Telegram.', en: 'Log in to your account to connect your personal Telegram.', es: 'Entra con tu cuenta para conectar tu Telegram personal.', uk: 'Увійди під своїм акаунтом, щоб підключити особистий Telegram.', ro: 'Autentifică-te în contul tău ca să conectezi Telegramul personal.', kk: 'Жеке Telegram-ды қосу үшін өз аккаунтыңызбен кіріңіз.' },
  'telegram.page.noAccess': { ru: 'Доступ к этому разделу пока даёт только администратор.', en: 'Only an admin can grant access to this section right now.', es: 'De momento solo un administrador puede dar acceso a esta sección.', uk: 'Доступ до цього розділу поки дає лише адміністратор.', ro: 'Deocamdată doar un administrator poate da acces la această secțiune.', kk: 'Бұл бөлімге қолжетімділікті әзірге тек әкімші береді.' },
  'telegram.page.tooltip': {
    ru: 'Переписка с водителями прямо в приложении через ТВОЙ Telegram-аккаунт (не бот) — водителям ничего ставить и нажимать не нужно. У каждого диспетчера свой аккаунт со своими диалогами. Отметь в настройках, какие чаты показывать, и привяжи их к тракам — фото POD/BOL от водителя ИИ сам прикрепит к грузу.',
    en: 'Message drivers right inside the app through YOUR Telegram account (not a bot) — drivers don\'t install or tap anything. Each dispatcher has their own account with their own chats. Pick which chats to show in settings, and link them to trucks — the AI will attach POD/BOL photos from the driver to the load automatically.',
  },
  'telegram.page.yourAccount': { ru: 'Твой аккаунт', en: 'Your account', es: 'Tu cuenta', uk: 'Твій акаунт', ro: 'Contul tău', kk: 'Сіздің аккаунт' },
  'telegram.page.noneShownYet': {
    ru: 'Пока ни один чат не отмечен для показа — открой «Настроить, какие чаты показывать» выше.',
    en: 'No chats are marked to show yet — open "Choose which chats to show" above.',
    es: 'Aún no hay ningún chat marcado para mostrar — abre «Elegir qué chats mostrar» arriba.',
    uk: 'Поки жоден чат не позначено для показу — відкрий «Налаштувати, які чати показувати» вище.',
    ro: 'Încă niciun chat nu e marcat pentru afișare — deschide „Alege ce chat-uri se afișează” mai sus.',
    kk: 'Әзірге бірде-бір чат көрсетуге белгіленбеген — жоғарыдағы «Қай чаттар көрсетілетінін баптау» бөлімін ашыңыз.',
  },
  'telegram.page.pickDialog': { ru: 'Выбери диалог слева.', en: 'Pick a conversation on the left.', es: 'Elige una conversación a la izquierda.', uk: 'Обери діалог зліва.', ro: 'Alege o conversație din stânga.', kk: 'Сол жақтан диалогты таңдаңыз.' },
  'telegram.page.pdfPreviewAlt': { ru: 'Превью PDF', en: 'PDF preview', es: 'Vista previa del PDF', uk: 'Превʼю PDF', ro: 'Previzualizare PDF', kk: 'PDF алдын ала қарау' },
  'telegram.page.defaultDocName': { ru: 'Документ.pdf', en: 'Document.pdf', es: 'Documento.pdf', uk: 'Документ.pdf', ro: 'Document.pdf', kk: 'Құжат.pdf' },
  'telegram.page.openPdf': { ru: 'Открыть PDF', en: 'Open PDF', es: 'Abrir el PDF', uk: 'Відкрити PDF', ro: 'Deschide PDF-ul', kk: 'PDF ашу' },
  'telegram.page.attachment': { ru: '[вложение]', en: '[attachment]', es: '[adjunto]', uk: '[вкладення]', ro: '[atașament]', kk: '[тіркеме]' },
  'telegram.page.bytesUnit': { ru: 'Б', en: 'B', es: 'B', uk: 'Б', ro: 'B', kk: 'Б' },
  'telegram.page.kbUnit': { ru: 'КБ', en: 'KB', es: 'KB', uk: 'КБ', ro: 'KB', kk: 'КБ' },
  'telegram.page.mbUnit': { ru: 'МБ', en: 'MB', es: 'MB', uk: 'МБ', ro: 'MB', kk: 'МБ' },

  // app/telegram/actions.ts
  'telegram.actions.needLogin': { ru: 'Нужно войти.', en: 'You need to log in.', es: 'Hay que iniciar sesión.', uk: 'Потрібно увійти.', ro: 'Trebuie să te autentifici.', kk: 'Кіру қажет.' },
  'telegram.actions.noAccess': { ru: 'Доступ к Telegram пока не открыт администратором.', en: 'Access to Telegram hasn\'t been granted by an admin yet.', es: 'El administrador aún no ha dado acceso a Telegram.', uk: 'Доступ до Telegram поки не відкрито адміністратором.', ro: 'Accesul la Telegram nu a fost încă acordat de administrator.', kk: 'Telegram-ға қолжетімділікті әкімші әлі ашпаған.' },
  'telegram.actions.needCreds': { ru: 'Нужны api_id, api_hash и телефон.', en: 'api_id, api_hash, and phone are required.', es: 'Hacen falta api_id, api_hash y el teléfono.', uk: 'Потрібні api_id, api_hash і телефон.', ro: 'Sunt necesare api_id, api_hash și telefonul.', kk: 'api_id, api_hash және телефон қажет.' },
  'telegram.actions.codeSendFailed': { ru: 'Не отправился код', en: 'Code failed to send', es: 'El código no se envió', uk: 'Код не надіслався', ro: 'Codul nu a fost trimis', kk: 'Код жіберілмеді' },
  'telegram.actions.loginFailed': { ru: 'Вход не удался', en: 'Login failed', es: 'No se pudo entrar', uk: 'Вхід не вдався', ro: 'Autentificarea a eșuat', kk: 'Кіру сәтсіз аяқталды' },
  'telegram.actions.noTruckLinked': {
    ru: 'Этот чат не привязан ни к одному траку — укажи телефон в паспорте трака или привяжи чат к траку.',
    en: 'This chat isn\'t linked to any truck — add the phone to the truck\'s passport, or link the chat to a truck.',
    es: 'Este chat no está vinculado a ningún camión — pon el teléfono en la ficha del camión o vincula el chat a un camión.',
    uk: 'Цей чат не прив\'язаний до жодного трака — вкажи телефон у картці трака або прив\'яжи чат до трака.',
    ro: 'Acest chat nu e legat de niciun camion — pune telefonul în fișa camionului sau leagă chatul de un camion.',
    kk: 'Бұл чат бірде-бір трактқа байланбаған — тракт картасында телефонды көрсетіңіз немесе чатты трактқа байлаңыз.',
  },
  'telegram.actions.noActiveLoad': { ru: 'У этого трака сейчас нет активного груза.', en: 'This truck has no active load right now.', es: 'Este camión no tiene carga activa ahora.', uk: 'У цього трака зараз немає активного вантажу.', ro: 'Acest camion nu are cursă activă acum.', kk: 'Бұл тракттың қазір белсенді жүгі жоқ.' },
  'telegram.actions.downloadFailed': { ru: 'Не удалось скачать файл из Telegram.', en: 'Couldn\'t download the file from Telegram.', es: 'No se pudo descargar el archivo de Telegram.', uk: 'Не вдалося завантажити файл із Telegram.', ro: 'Fișierul nu a putut fi descărcat din Telegram.', kk: 'Telegram-нан файлды жүктеу мүмкін болмады.' },
  'telegram.actions.emptyMessage': { ru: 'Пустое сообщение.', en: 'Empty message.', es: 'Mensaje vacío.', uk: 'Порожнє повідомлення.', ro: 'Mesaj gol.', kk: 'Бос хабарлама.' },
  'telegram.actions.sendFailed': { ru: 'Не отправилось', en: 'Failed to send', es: 'No se envió', uk: 'Не надіслалося', ro: 'Nu s-a trimis', kk: 'Жіберілмеді' },

  // app/telegram/tg-chat.tsx
  'telegram.chat.placeholder': { ru: 'Сообщение водителю…', en: 'Message to driver…', es: 'Mensaje al conductor…', uk: 'Повідомлення водієві…', ro: 'Mesaj pentru șofer…', kk: 'Жүргізушіге хабарлама…' },
  'telegram.chat.unlockedTitle': { ru: 'Отправка разблокирована ещё {n}с', en: 'Sending unlocked for {n}s more', es: 'Envío desbloqueado {n} s más', uk: 'Надсилання розблоковано ще {n}с', ro: 'Trimiterea e deblocată încă {n} s', kk: 'Жіберу тағы {n}с бойы ашық' },
  'telegram.chat.lockedTitle': { ru: 'Отправить — сначала подтверди своим паролем', en: 'Send — confirm with your password first', es: 'Enviar — antes confirma con tu contraseña', uk: 'Надіслати — спершу підтверди своїм паролем', ro: 'Trimite — mai întâi confirmă cu parola ta', kk: 'Жіберу — алдымен құпия сөзіңізбен растаңыз' },
  'telegram.chat.close': { ru: 'Закрыть', en: 'Close', es: 'Cerrar', uk: 'Закрити', ro: 'Închide', kk: 'Жабу' },
  'telegram.chat.confirmText': {
    ru: 'Сообщение уйдёт водителю — отменить будет нельзя. Введи свой пароль (тот, которым входишь), чтобы разблокировать отправку на 2 минуты:',
    en: 'This message will go to the driver — it can\'t be unsent. Enter your password (the one you log in with) to unlock sending for 2 minutes:',
  },
  'telegram.chat.passwordPlaceholder': { ru: 'Твой пароль', en: 'Your password', es: 'Tu contraseña', uk: 'Твій пароль', ro: 'Parola ta', kk: 'Құпия сөзіңіз' },
  'telegram.chat.unlock': { ru: 'Разблокировать', en: 'Unlock', es: 'Desbloquear', uk: 'Розблокувати', ro: 'Deblochează', kk: 'Ашу' },
  'telegram.chat.secondsSuffix': { ru: 'с', en: 's', es: 's', uk: 'с', ro: 's', kk: 'с' },

  // app/telegram/tg-chat-settings.tsx
  'telegram.settings.summary': { ru: 'Настроить, какие чаты показывать', en: 'Choose which chats to show', es: 'Elegir qué chats mostrar', uk: 'Налаштувати, які чати показувати', ro: 'Alege ce chat-uri se afișează', kk: 'Қай чаттар көрсетілетінін баптау' },
  'telegram.settings.marked': { ru: 'отмечено {a} из {b}', en: '{a} of {b} checked', es: '{a} de {b} marcados', uk: 'позначено {a} з {b}', ro: '{a} din {b} bifate', kk: '{b} ішінен {a} белгіленген' },
  'telegram.settings.explain': {
    ru: 'Отмеченные диалоги видны в списке слева. Всё остальное скрыто. Рядом можно привязать чат к траку — так фото POD/BOL от водителя сами прикрепятся к его грузу.',
    en: 'Checked conversations show up in the list on the left. Everything else is hidden. You can also link a chat to a truck — POD/BOL photos from that driver will then attach to their load automatically.',
  },
  'telegram.settings.noneVisible': { ru: 'Диалогов не видно на этом аккаунте.', en: 'No conversations visible on this account.', es: 'En esta cuenta no se ven conversaciones.', uk: 'Діалогів не видно на цьому акаунті.', ro: 'Pe acest cont nu se văd conversații.', kk: 'Бұл аккаунтта диалогтар көрінбейді.' },
  'telegram.settings.group': { ru: 'группа', en: 'group', es: 'grupo', uk: 'група', ro: 'grup', kk: 'топ' },
  'telegram.settings.pickTruck': { ru: '— трак —', en: '— truck —', es: '— camión —', uk: '— трак —', ro: '— camion —', kk: '— тракт —' },
  'telegram.settings.saving': { ru: 'Сохраняю…', en: 'Saving…', es: 'Guardando…', uk: 'Зберігаю…', ro: 'Se salvează…', kk: 'Сақталуда…' },
  'telegram.settings.save': { ru: 'Сохранить список', en: 'Save list', es: 'Guardar la lista', uk: 'Зберегти список', ro: 'Salvează lista', kk: 'Тізімді сақтау' },
  'telegram.settings.saved': { ru: 'Список чатов обновлён', en: 'Chat list updated', es: 'Lista de chats actualizada', uk: 'Список чатів оновлено', ro: 'Lista de chat-uri a fost actualizată', kk: 'Чаттар тізімі жаңартылды' },

  // app/telegram/tg-setup.tsx
  'telegram.setup.codeRequested': { ru: 'Код запрошен', en: 'Code requested', es: 'Código solicitado', uk: 'Код запитано', ro: 'Cod solicitat', kk: 'Код сұралды' },
  'telegram.setup.connected': { ru: 'Telegram подключён', en: 'Telegram connected', es: 'Telegram conectado', uk: 'Telegram підключено', ro: 'Telegram conectat', kk: 'Telegram қосылды' },
  'telegram.setup.title': { ru: 'Подключение Telegram', en: 'Connect Telegram', es: 'Conectar Telegram', uk: 'Підключення Telegram', ro: 'Conectarea Telegram', kk: 'Telegram қосу' },
  'telegram.setup.introPre': { ru: 'Подключается', en: 'This connects', es: 'Se conecta', uk: 'Підключається', ro: 'Se conectează', kk: 'Қосылады' },
  'telegram.setup.introBold': { ru: 'твой', en: 'your', es: 'tu', uk: 'твій', ro: 'contul tău', kk: 'сіздің' },
  'telegram.setup.introPost': { ru: 'аккаунт — водители ничего не устанавливают и не нажимают.', en: 'account — drivers don\'t install or tap anything.', es: 'cuenta — los conductores no instalan ni pulsan nada.', uk: 'акаунт — водії нічого не встановлюють і не натискають.', ro: '— șoferii nu instalează și nu apasă nimic.', kk: 'аккаунт — жүргізушілер ештеңе орнатпайды және баспайды.' },
  'telegram.setup.apiHint': { ru: 'api_id/api_hash —', en: 'api_id/api_hash —' },
  'telegram.setup.apiHintSuffix': { ru: '→ API development tools.', en: '→ API development tools.' },
  'telegram.setup.phonePlaceholder': { ru: 'Телефон (+1...)', en: 'Phone (+1...)', es: 'Teléfono (+1...)', uk: 'Телефон (+1...)', ro: 'Telefon (+1...)', kk: 'Телефон (+1...)' },
  'telegram.setup.sendingCode': { ru: 'Отправляю код…', en: 'Sending code…', es: 'Enviando el código…', uk: 'Надсилаю код…', ro: 'Se trimite codul…', kk: 'Код жіберілуде…' },
  'telegram.setup.getCode': { ru: 'Получить код в Telegram', en: 'Get code in Telegram', es: 'Recibir el código en Telegram', uk: 'Отримати код у Telegram', ro: 'Primește codul în Telegram', kk: 'Telegram-да код алу' },
  'telegram.setup.codePlaceholder': { ru: 'Код из Telegram', en: 'Code from Telegram', es: 'Código de Telegram', uk: 'Код із Telegram', ro: 'Codul din Telegram', kk: 'Telegram-дағы код' },
  'telegram.setup.checking': { ru: 'Проверяю…', en: 'Checking…', es: 'Comprobando…', uk: 'Перевіряю…', ro: 'Se verifică…', kk: 'Тексерілуде…' },
  'telegram.setup.logIn': { ru: 'Войти', en: 'Log in', es: 'Entrar', uk: 'Увійти', ro: 'Intră', kk: 'Кіру' },
  'telegram.setup.twoFaText': { ru: 'Включён облачный пароль (2FA) — введи его:', en: 'Cloud password (2FA) is enabled — enter it:', es: 'Está activada la contraseña en la nube (2FA) — escríbela:', uk: 'Увімкнено хмарний пароль (2FA) — введи його:', ro: 'Parola în cloud (2FA) e activată — introdu-o:', kk: 'Бұлттық құпия сөз (2FA) қосулы — оны енгізіңіз:' },
  'telegram.setup.cloudPasswordPlaceholder': { ru: 'Облачный пароль', en: 'Cloud password', es: 'Contraseña en la nube', uk: 'Хмарний пароль', ro: 'Parolă în cloud', kk: 'Бұлттық құпия сөз' },
  'telegram.setup.confirm': { ru: 'Подтвердить', en: 'Confirm', es: 'Confirmar', uk: 'Підтвердити', ro: 'Confirmă', kk: 'Растау' },
  'telegram.setup.footer': {
    ru: 'Вход — один раз, локально. Дальше сессия хранится на сервере и работает везде.',
    en: 'Log in once, locally. After that the session lives on the server and works everywhere.',
    es: 'Se entra una vez, en local. Después la sesión se guarda en el servidor y funciona en todas partes.',
    uk: 'Вхід — один раз, локально. Далі сесія зберігається на сервері й працює всюди.',
    ro: 'Te autentifici o dată, local. Apoi sesiunea se păstrează pe server și merge peste tot.',
    kk: 'Кіру — бір рет, жергілікті. Одан әрі сеанс серверде сақталып, бәрінде жұмыс істейді.',
  },

  // app/telegram/tg-image.tsx
  'telegram.image.alt': { ru: 'Вложение', en: 'Attachment', es: 'Adjunto', uk: 'Вкладення', ro: 'Atașament', kk: 'Тіркеме' },
  'telegram.image.download': { ru: 'Скачать', en: 'Download', es: 'Descargar', uk: 'Завантажити', ro: 'Descarcă', kk: 'Жүктеу' },
  'telegram.image.copyLink': { ru: 'Скопировать ссылку', en: 'Copy link', es: 'Copiar el enlace', uk: 'Скопіювати посилання', ro: 'Copiază linkul', kk: 'Сілтемені көшіру' },
  'telegram.image.linkCopied': { ru: 'Ссылка скопирована', en: 'Link copied', es: 'Enlace copiado', uk: 'Посилання скопійовано', ro: 'Link copiat', kk: 'Сілтеме көшірілді' },
  'telegram.image.close': { ru: 'Закрыть', en: 'Close', es: 'Cerrar', uk: 'Закрити', ro: 'Închide', kk: 'Жабу' },
  'telegram.image.hintZoomed': { ru: 'Тяните, чтобы двигать · нажмите, чтобы отдалить', en: 'Drag to move · tap to zoom out', es: 'Arrastra para mover · toca para alejar', uk: 'Тягніть, щоб рухати · натисніть, щоб віддалити', ro: 'Trage ca să muți · atinge ca să depărtezi', kk: 'Жылжыту үшін тартыңыз · алыстату үшін басыңыз' },
  'telegram.image.hintFit': { ru: 'Нажмите на фото, чтобы приблизить', en: 'Tap the photo to zoom in', es: 'Toca la foto para acercar', uk: 'Натисніть на фото, щоб наблизити', ro: 'Atinge poza ca să apropii', kk: 'Жақындату үшін суретті басыңыз' },
  'telegram.image.hintCloseSuffix': { ru: 'Escape или тап по фону — закрыть', en: 'Escape or tap the background to close', es: 'Escape o toca el fondo para cerrar', uk: 'Escape або тап по фону — закрити', ro: 'Escape sau atinge fundalul ca să închizi', kk: 'Escape немесе фонды басу — жабу' },

  // app/telegram/tg-attach-button.tsx
  'telegram.attach.inLoad': { ru: '✓ В грузе {route} →', en: '✓ On load {route} →', es: '✓ En la carga {route} →', uk: '✓ У вантажі {route} →', ro: '✓ În cursa {route} →', kk: '✓ {route} жүгінде →' },
  'telegram.attach.createdLoad': { ru: '✓ Создан груз {route} →', en: '✓ Load created: {route} →', es: '✓ Carga creada: {route} →', uk: '✓ Створено вантаж {route} →', ro: '✓ Cursă creată: {route} →', kk: '✓ {route} жүгі құрылды →' },
  'telegram.attach.created': { ru: 'Из рейт-кона создан груз {route}', en: 'Rate con turned into load {route}', es: 'El rate con se convirtió en la carga {route}', uk: 'З рейт-кона створено вантаж {route}', ro: 'Rate con-ul a devenit cursa {route}', kk: 'Рейт-коннан {route} жүгі құрылды' },
  'telegram.attach.added': { ru: 'Добавлено к грузу {route}', en: 'Added to load {route}', es: 'Añadido a la carga {route}', uk: 'Додано до вантажу {route}', ro: 'Adăugat la cursa {route}', kk: '{route} жүгіне қосылды' },
  'telegram.attach.adding': { ru: 'Добавляю…', en: 'Adding…', es: 'Añadiendo…', uk: 'Додаю…', ro: 'Se adaugă…', kk: 'Қосылуда…' },
  'telegram.attach.choose': { ru: 'Выбрать тип и место', en: 'Choose type and destination', es: 'Elegir tipo y destino', uk: 'Вибрати тип і місце', ro: 'Alege tipul și destinația', kk: 'Түрі мен орнын таңдау' },
  'telegram.attach.kindTitle': { ru: 'Что это за файл', en: 'What this file is', es: 'Qué archivo es', uk: 'Що це за файл', ro: 'Ce fel de fișier e', kk: 'Бұл қандай файл' },
  'telegram.attach.kindAuto': { ru: 'определить', en: 'detect', es: 'detectar', uk: 'визначити', ro: 'detectează', kk: 'анықтау' },
  'telegram.attach.whereTitle': { ru: 'Куда положить', en: 'Where it goes', es: 'Dónde ponerlo', uk: 'Куди покласти', ro: 'Unde se pune', kk: 'Қайда салу' },
  'telegram.attach.newLoad': { ru: 'Новый груз', en: 'New load', es: 'Nueva carga', uk: 'Новий вантаж', ro: 'Cursă nouă', kk: 'Жаңа жүк' },
  'telegram.attach.newLoadHint': { ru: 'завести рейс по этой бумаге', en: 'create a load from this paper', es: 'crear un viaje con este papel', uk: 'завести рейс за цією папером', ro: 'creează o cursă din această hârtie', kk: 'осы қағаз бойынша рейс ашу' },
  'telegram.attach.truckFiles': { ru: 'Файлы трака', en: 'Truck files', es: 'Archivos del camión', uk: 'Файли трака', ro: 'Fișierele camionului', kk: 'Тракт файлдары' },
  'telegram.attach.truckFilesHint': { ru: 'без привязки к грузу', en: 'not tied to a load', es: 'sin vincular a una carga', uk: 'без прив\'язки до вантажу', ro: 'fără legătură cu o cursă', kk: 'жүкке байланыссыз' },
  'telegram.attach.noLoads': { ru: 'У трака нет грузов', en: 'This truck has no loads', es: 'Este camión no tiene cargas', uk: 'У трака немає вантажів', ro: 'Acest camion nu are curse', kk: 'Тракттың жүгі жоқ' },
  'telegram.attach.savedToTruck': { ru: 'Сохранено в файлы трака', en: 'Saved to truck files', es: 'Guardado en los archivos del camión', uk: 'Збережено у файли трака', ro: 'Salvat în fișierele camionului', kk: 'Тракт файлдарына сақталды' },
  'telegram.attach.inTruckFiles': { ru: '✓ В файлах трака', en: '✓ In truck files', es: '✓ En los archivos del camión', uk: '✓ У файлах трака', ro: '✓ În fișierele camionului', kk: '✓ Тракт файлдарында' },
  'telegram.actions.rcSavedNotRead': {
    ru: 'Рейт-кон сохранён в файлах трака, но прочитать его не удалось. Откройте карточку трака и нажмите «Создать груз из рейт-кона».',
    en: 'The rate con is saved in the truck files, but could not be read. Open the truck and press "Create load from rate con".',
  },
  'telegram.attach.toDriverLoad': { ru: '📎 В груз водителя', en: '📎 To driver\'s load', es: '📎 A la carga del conductor', uk: '📎 У вантаж водія', ro: '📎 La cursa șoferului', kk: '📎 Жүргізушінің жүгіне' },

  // app/telegram/tg-disconnect-button.tsx
  'telegram.disconnect.wrongAccount': { ru: 'Не тот аккаунт?', en: 'Wrong account?', es: '¿Cuenta equivocada?', uk: 'Не той акаунт?', ro: 'Cont greșit?', kk: 'Аккаунт дұрыс емес пе?' },
  'telegram.disconnect.confirmText': { ru: 'Отключить и подключить заново?', en: 'Disconnect and reconnect?', es: '¿Desconectar y volver a conectar?', uk: 'Відключити і підключити заново?', ro: 'Deconectezi și reconectezi?', kk: 'Ажыратып, қайта қосу керек пе?' },
  'telegram.disconnect.done': { ru: 'Аккаунт отключён', en: 'Account disconnected', es: 'Cuenta desconectada', uk: 'Акаунт відключено', ro: 'Cont deconectat', kk: 'Аккаунт ажыратылды' },
  'telegram.disconnect.yes': { ru: 'Да, отключить', en: 'Yes, disconnect', es: 'Sí, desconectar', uk: 'Так, відключити', ro: 'Da, deconectează', kk: 'Иә, ажырату' },
  'telegram.disconnect.cancel': { ru: 'Отмена', en: 'Cancel', es: 'Cancelar', uk: 'Скасувати', ro: 'Anulează', kk: 'Болдырмау' },

  // app/telegram/tg-check-button.tsx
  'telegram.check.result': { ru: 'Прикреплено: {attached} · пропущено: {skipped} · напоминаний: {nudged}', en: 'Attached: {attached} · skipped: {skipped} · reminders: {nudged}', es: 'Adjuntados: {attached} · omitidos: {skipped} · recordatorios: {nudged}', uk: 'Прикріплено: {attached} · пропущено: {skipped} · нагадувань: {nudged}', ro: 'Atașate: {attached} · omise: {skipped} · memento-uri: {nudged}', kk: 'Тіркелді: {attached} · өткізілді: {skipped} · еске салулар: {nudged}' },
  'telegram.check.checking': { ru: 'Проверяю…', en: 'Checking…', es: 'Comprobando…', uk: 'Перевіряю…', ro: 'Se verifică…', kk: 'Тексерілуде…' },
  'telegram.check.checkNow': { ru: 'Проверить документы сейчас', en: 'Check documents now', es: 'Comprobar documentos ahora', uk: 'Перевірити документи зараз', ro: 'Verifică documentele acum', kk: 'Құжаттарды қазір тексеру' },

  // lib/telegram.ts
  'telegram.lib.notConnected': { ru: 'Telegram не подключён', en: 'Telegram isn\'t connected', es: 'Telegram no está conectado', uk: 'Telegram не підключено', ro: 'Telegram nu e conectat', kk: 'Telegram қосылмаған' },
  'telegram.lib.chatNotFound': { ru: 'Чат не найден среди последних диалогов.', en: 'Chat not found among recent conversations.', es: 'El chat no está entre las conversaciones recientes.', uk: 'Чат не знайдено серед останніх діалогів.', ro: 'Chatul nu e printre conversațiile recente.', kk: 'Чат соңғы диалогтар арасынан табылмады.' },
  'telegram.lib.loginExpired': { ru: 'Сессия логина истекла — начни заново.', en: 'Login session expired — start over.', es: 'La sesión de acceso caducó — empieza de nuevo.', uk: 'Сесія логіну минула — почни спочатку.', ro: 'Sesiunea de autentificare a expirat — ia-o de la capăt.', kk: 'Кіру сеансы бітті — қайтадан бастаңыз.' },
  'telegram.lib.noName': { ru: 'Без имени', en: 'No name', es: 'Sin nombre', uk: 'Без імені', ro: 'Fără nume', kk: 'Атсыз' },
  'telegram.lib.deliveryHintApp': {
    ru: 'Telegram отправил код СООБЩЕНИЕМ В САМ TELEGRAM — в чат «Telegram» аккаунта с номером {phone}. Не SMS.',
    en: 'Telegram sent the code AS A MESSAGE INSIDE TELEGRAM ITSELF — in the "Telegram" chat of the account with number {phone}. Not SMS.',
  },
  'telegram.lib.deliveryHintSms': { ru: 'Telegram отправил код SMS-кой на {phone}.', en: 'Telegram sent the code by SMS to {phone}.', es: 'Telegram envió el código por SMS al {phone}.', uk: 'Telegram надіслав код SMS-кою на {phone}.', ro: 'Telegram a trimis codul prin SMS la {phone}.', kk: 'Telegram кодты {phone} нөміріне SMS-пен жіберді.' },
} as const
