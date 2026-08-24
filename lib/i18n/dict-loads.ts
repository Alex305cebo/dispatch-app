// Loads domain: app/loads/**, app/load/**, app/view/[id]/**, app/import/**,
// load-form/new-load-client/load-edit-numbers/ratecon-button/orphan-ratecons/
// truck-rc-drop/broker-notes/analysis/broker-check, lib/loads.ts, lib/rc-warnings.ts,
// lib/fmcsa.ts, lib/ratecon-ai*.ts.

export const loadsDict = {
  // "Груз #" / "Load #" prefix used by the status-picker toast (components/status.tsx
  // callers) — seeded here by the i18n foundation pass; add the rest of this
  // domain's strings alongside it.
  'loads.loadHash': { ru: 'Груз #', en: 'Load #' },

  // app/loads/page.tsx
  'loads.page.title': { ru: 'Грузы', en: 'Loads' },
  'loads.page.tooltip': {
    ru: '«По водителю» — грузы сгруппированы по траку. «По статусу» — цветная доска: одна колонка на каждый статус груза, чтобы видеть всё сразу, а не открывать каждого водителя по очереди. «Календарь» — вся история грузов по неделям, листается назад и вперёд. «Чистыми» — что остаётся после всех расходов трака; число после точки — доход на милю (RPM).',
    en: '"By driver" groups loads by truck. "By status" is a color-coded board — one column per load status, so you can see everything at a glance instead of opening each driver in turn. "Calendar" is the full load history by week, paged back and forward. "Net" is what\'s left after all truck expenses; the number after the dot is revenue per mile (RPM).',
  },
  'loads.page.countSuffix': { ru: '{n} шт.', en: '{n} load(s)' },
  'loads.page.new': { ru: 'Новый', en: 'New' },
  'loads.page.tabByDriver': { ru: 'По водителю', en: 'By driver' },
  'loads.page.tabByStatus': { ru: 'По статусу', en: 'By status' },
  'loads.page.showMore': { ru: 'ещё {n}', en: '{n} more' },
  'loads.page.tabCalendar': { ru: 'Календарь', en: 'Calendar' },
  'loads.page.emptyTitle': { ru: 'Пока пусто', en: 'Nothing here yet' },
  'loads.page.emptyText': {
    ru: 'Добавь груз вручную или сними QR-код с DAT камерой айфона — груз приедет сюда вместе с аналитикой.',
    en: 'Add a load manually, or scan the QR code with the DAT iPhone camera — it will land here with its analytics already attached.',
  },
  'loads.page.net': { ru: 'чистыми', en: 'net' },
  'loads.page.countLoads': { ru: '{n} груз(ов)', en: '{n} load(s)' },
  'loads.page.moreLoads': { ru: 'Ещё {n} груз(ов)', en: '{n} more load(s)' },
  'loads.page.prevWeek': { ru: '← Раньше', en: '← Earlier' },
  'loads.page.nextWeek': { ru: 'Позже →', en: 'Later →' },
  'loads.page.today': { ru: 'Сегодня', en: 'Today' },
  'loads.page.emptyDayTitle': { ru: 'В этот день грузов не было', en: 'No loads that day' },
  'loads.page.emptyDayText': {
    ru: 'Выбери другой день или листай недели стрелками выше.',
    en: 'Pick another day, or page through weeks with the arrows above.',
  },
  'loads.page.weekdayMon': { ru: 'Пн', en: 'Mon' },
  'loads.page.weekdayTue': { ru: 'Вт', en: 'Tue' },
  'loads.page.weekdayWed': { ru: 'Ср', en: 'Wed' },
  'loads.page.weekdayThu': { ru: 'Чт', en: 'Thu' },
  'loads.page.weekdayFri': { ru: 'Пт', en: 'Fri' },
  'loads.page.weekdaySat': { ru: 'Сб', en: 'Sat' },
  'loads.page.weekdaySun': { ru: 'Вс', en: 'Sun' },
  'loads.page.deleteNote': { ru: 'и его расчёты удалятся насовсем.', en: 'and its calculations will be permanently deleted.' },

  // app/loads/new/page.tsx
  'loads.new.title': { ru: 'Новый груз', en: 'New load' },
  'loads.new.subtitle': {
    ru: 'Отсканируй rate con — поля заполнятся сами. Или выбери трак и введи вручную.',
    en: 'Scan a rate con and the fields fill themselves in. Or pick a truck and enter it manually.',
  },

  // components/new-load-client.tsx
  'newLoad.needPdfOrPhoto': { ru: 'Нужен PDF или фото rate confirmation.', en: 'A PDF or photo of the rate confirmation is required.' },
  'newLoad.aiReading': { ru: 'ИИ читает…', en: 'AI reading…' },
  'newLoad.aiRecognized': { ru: '✓ Распознано ИИ', en: '✓ AI recognized' },
  'newLoad.readingRateCon': { ru: 'Читаю rate con…', en: 'Reading rate con…' },
  'newLoad.scanCta': { ru: 'Сканировать rate con — заполнить автоматически', en: 'Scan rate con — fill in automatically' },
  'newLoad.scanHint': {
    ru: 'Перетащи или выбери PDF/фото от брокера — ИИ распознает и заполнит поля ниже. Сканы тоже читаются.',
    en: "Drop or pick a PDF/photo from the broker — AI reads it and fills in the fields below. Scans work too.",
  },
  'newLoad.scanInfo': {
    ru: 'Тот же распознаватель, что на странице «Rate con»: документ читает искусственный интеллект и заполняет форму. Работает с любым шаблоном и со сканами.',
    en: 'The same recognizer as the "Rate con" page: AI reads the document and fills in the form. Works with any template and with scans.',
  },
  'newLoad.retry': { ru: '↻ Повторить', en: '↻ Retry' },
  'newLoad.formFilled': { ru: 'Форма заполнена из rate con — проверь и сохрани.', en: 'Form filled from the rate con — check it and save.' },
  'newLoad.clearOtherFile': { ru: 'очистить / другой файл', en: 'clear / different file' },
  'newLoad.recognizedToast': { ru: 'Rate con распознан — проверь поля', en: 'Rate con recognized — check the fields' },
  // Не «временно недоступен»: это единственная причина, по которой сюда попадают, —
  // ключ не вставлен, и сам он не появится. Прежний текст отсылал к администратору,
  // хотя на новой установке администратор — тот самый человек, который это читает.
  // Поэтому здесь дорога до нужного экрана целиком.
  'newLoad.aiUnavailable': {
    ru: 'Ключ Google AI не вставлен — без него распознавание не работает. Меню аккаунта (кружок слева внизу) → Ключи → вставить ключ. Он бесплатный, выдаётся в Google AI Studio за минуту.',
    en: 'The Google AI key is not set — recognition cannot work without it. Account menu (the circle at the bottom left) → Keys → paste the key. It is free and Google AI Studio issues it in a minute.',
  },
  'newLoad.aiUnavailableShort': { ru: 'ключ Google AI не вставлен', en: 'the Google AI key is not set' },
  'newLoad.notRecognized': { ru: 'Не распознался: {detail}. Попробуй ещё раз.', en: 'Could not recognize: {detail}. Try again.' },
  'newLoad.notReadToast': { ru: 'Не прочитался: {msg}', en: "Couldn't read it: {msg}" },

  // app/loads/[id]/page.tsx
  'loadDetail.sourceQr': { ru: 'Пришёл с DAT по QR', en: 'Came in from DAT via QR' },
  'loadDetail.sourceManual': { ru: 'Добавлен вручную', en: 'Added manually' },
  'loadDetail.docsMissingTitle': { ru: 'Не загружены {missing}', en: '{missing} not uploaded' },
  'loadDetail.docsMissingHint': {
    ru: 'Статус можно ставить и без них, но груз не закрыт, пока бумаги не пришли от водителя.',
    en: 'The status moves without them, but the load is not closed until the driver sends the paperwork.',
  },
  'loadDetail.docsMissingBlocksPaid': {
    ru: 'Отметить «Оплачен» без них не выйдет: пакет для счёта брокеру собирается именно из них.',
    en: 'Marking Paid needs them: the broker invoice packet is built from these documents.',
  },
  'loadDetail.driverTime': { ru: 'время у водителя', en: 'driver time' },
  'loadDetail.distanceLeft': { ru: 'осталось ехать', en: 'distance left' },
  'loadDetail.etaLeft': { ru: 'до выгрузки', en: 'to delivery' },
  'loadDetail.trailerShort': { ru: 'прицеп', en: 'trailer' },
  'loadDetail.noRateCon': { ru: 'Rate con не прикреплён — загрузи его ниже, в документах груза.', en: "No rate con attached — upload it below, in the load's documents." },
  'loadDetail.openDoc': { ru: 'Открыть {label}', en: 'Open {label}' },
  'loadDetail.uploadDoc': { ru: 'Загрузить {label}', en: 'Upload {label}' },
  'loadDetail.docUploaded': { ru: '{label} загружен', en: '{label} uploaded' },
  'loadDetail.rateHeading': { ru: 'Ставка за груз', en: 'Load rate' },
  'loadDetail.rateInfo': {
    ru: 'Сверху — общая ставка за груз. Ниже строкой — что остаётся чистыми и минимальная ставка. Все расходы (топливо по MPG и цене дизеля, водитель, платёж за трак, страховка, ELD/пермиты, обслуживание, факторинг, диспетч) спрятаны под «Нажмите, чтобы увидеть все расходы».',
    en: 'At the top is the total rate for the load. The line below shows net profit and the minimum acceptable rate. All costs (fuel by MPG and diesel price, driver, truck payment, insurance, ELD/permits, maintenance, factoring, dispatch) are hidden under "Click to see all expenses".',
  },
  'loadDetail.mapHeading': { ru: 'На карте', en: 'On the map' },
  'loadDetail.mapInfo': {
    ru: 'Где сейчас трак и куда ему ехать по этому грузу: пикап (пока груз не забран) и доставка, маршрут по дорогам между ними.',
    en: "Where the truck is now and where it's headed for this load: pickup (while not yet picked up) and delivery, with the road route between them.",
  },
  'loadDetail.detailsHeading': { ru: 'Детали', en: 'Details' },
  'loadDetail.truckCostsHeading': { ru: 'Расходы трака — из чего считаются строки выше', en: 'Truck costs — what the numbers above are calculated from' },
  'loadDetail.truckCostsInfo': {
    ru: 'Топливо, водитель, обслуживание, фикс и факторинг у каждого груза этого трака считаются из этих настроек × мили и дни. Меняешь — все расчёты пересчитываются. Это настройки трака, они действуют на все его грузы.',
    en: "Fuel, driver, maintenance, fixed costs, and factoring for every load on this truck are calculated from these settings × miles and days. Change them and every calculation updates. These are truck-level settings — they apply to all of its loads.",
  },
  'loadDetail.invoiceHeading': { ru: 'Инвойс брокеру', en: 'Invoice to broker' },
  'loadDetail.invoiceInfo': {
    ru: 'Собирает счёт брокеру: инвойс + rate con + POD в один PDF-пакет, готовый к отправке или факторингу. Нужен загруженный POD (без него брокер не платит). После — отметь «Оплачено», когда деньги пришли; неоплаченные видны в разделе Финансы.',
    en: 'Assembles the broker invoice: invoice + rate con + POD into one PDF package, ready to send or factor. Requires an uploaded POD (the broker won\'t pay without it). Afterward, mark "Paid" once the money arrives — unpaid loads show up in the Finances section.',
  },
  'loadDetail.paidOn': { ru: 'оплачен {date}', en: 'paid {date}' },
  'loadDetail.invoicePackageNote': {
    ru: 'Пакет = инвойс + rate con + POD одним PDF. Нужен загруженный POD.',
    en: 'The package = invoice + rate con + POD as one PDF. Requires an uploaded POD.',
  },
  'loadDetail.docsHeading': { ru: 'Документы груза', en: 'Load documents' },
  'loadDetail.docsInfo': {
    ru: 'Все бумаги по этому грузу: rate con, BOL, POD, инвойс. Загружай PDF или фото. POD, присланный водителем в Telegram, прилетает сюда автоматически. Клик по документу — открыть/скачать.',
    en: 'All paperwork for this load: rate con, BOL, POD, invoice. Upload a PDF or photo. A POD sent by the driver via Telegram lands here automatically. Click a document to open/download it.',
  },

  // app/load/page.tsx
  'loadQr.title': { ru: 'Груз с DAT', en: 'Load from DAT' },
  'loadQr.subtitle': { ru: 'Аналитика считается на телефоне, офлайн.', en: 'Analytics are calculated on the phone, offline.' },

  // app/load/qr-client.tsx
  'loadQr.emptyTitle': { ru: 'В ссылке нет груза', en: 'No load in this link' },
  'loadQr.emptyText': {
    ru: 'Эта страница открывается по QR-коду с DAT. Наведи камеру айфона на код в панели расширения — груз и аналитика появятся здесь.',
    en: 'This page opens from a QR code on DAT. Point your iPhone camera at the code in the extension panel — the load and its analytics will appear here.',
  },
  'loadQr.bannerText': {
    ru: 'Груз с DAT. Проверь поля в янтарной рамке — их load board не знает.',
    en: "Load from DAT. Check the fields in the amber box — the load board doesn't know these.",
  },

  // app/view/[id]/page.tsx
  'docView.back': { ru: 'Назад', en: 'Back' },
  'docView.saveToComputer': { ru: 'Сохранить на компьютер', en: 'Save to computer' },

  // app/import/page.tsx
  'import.titleSuffix': { ru: '· подтверждение ставки от брокера', en: "· broker's rate confirmation" },
  'import.subtitle': {
    ru: 'Мгновенный черновик собирается прямо в браузере, затем документ проверяет искусственный интеллект — он читает любой шаблон брокера и сканы. Ничего не выдумывается: чего нет в документе, то остаётся пустым.',
    en: "An instant draft is assembled right in the browser, then AI checks the document — it reads any broker template and scans. Nothing is made up: whatever isn't in the document stays blank.",
  },

  // app/import/import-client.tsx — LABELS (found-field names)
  'import.label.rate': { ru: 'Ставка', en: 'Rate' },
  'import.label.loadedMiles': { ru: 'Мили', en: 'Miles' },
  'import.label.origin': { ru: 'Откуда', en: 'Origin' },
  'import.label.destination': { ru: 'Куда', en: 'Destination' },
  'import.label.mcNumber': { ru: 'MC в документе', en: 'MC on document' },
  'import.label.brokerName': { ru: 'Брокер', en: 'Broker' },
  'import.label.brokerPhone': { ru: 'Телефон', en: 'Phone' },
  'import.label.brokerEmail': { ru: 'Email', en: 'Email' },
  'import.label.referenceId': { ru: 'Номер груза', en: 'Load number' },
  'import.label.pickupDate': { ru: 'Дата загрузки', en: 'Pickup date' },
  'import.label.deliveryDate': { ru: 'Дата выгрузки', en: 'Delivery date' },
  'import.label.commodity': { ru: 'Груз', en: 'Commodity' },
  'import.label.weight': { ru: 'Вес', en: 'Weight' },

  'import.driverInfoCopied': { ru: 'Driver Information скопирован — можно слать водителю', en: 'Driver Information copied — ready to send to the driver' },
  'import.clipboardDenied': {
    ru: 'Браузер не дал доступ к буферу — выдели текст и скопируй вручную',
    en: "Browser denied clipboard access — select the text and copy it manually",
  },
  'import.recognizedToast': { ru: 'Rate con распознан ИИ — проверь глазами и отправляй', en: 'Rate con recognized by AI — give it a look and send it' },
  'import.rateConLabel': { ru: 'Rate confirmation:', en: 'Rate confirmation:' },
  'import.open': { ru: 'Открыть', en: 'Open' },
  'import.driverInfoInfo': {
    ru: 'Готовый текст для отправки водителю: адреса загрузки/выгрузки, время, номера, ставка, вес. Собирается автоматически из распознанного rate con. Кнопка «Копировать» — и сразу в чат водителю.',
    en: 'A ready-to-send message for the driver: pickup/delivery addresses, times, phone numbers, rate, weight. Assembled automatically from the recognized rate con. Hit "Copy" and paste straight into the chat.',
  },
  'import.aiChecked': { ru: '✓ Проверено ИИ', en: '✓ Checked by AI' },
  'import.copied': { ru: '✓ Скопировано', en: '✓ Copied' },
  'import.copy': { ru: 'Копировать', en: 'Copy' },
  'import.readyToSend': {
    ru: 'Готово к отправке водителю. Проверь глазами — что не нашлось в документе, помечено прочерком.',
    en: "Ready to send to the driver. Give it a check — anything not found in the document is marked with a dash.",
  },
  'import.whatWasRead': { ru: 'Что прочитано в документе', en: 'What was read from the document' },
  'import.whatWasReadInfo': {
    ru: 'Поля, которые ИИ (или базовый разбор) вытащил из PDF: ставка, мили, адреса, номер груза, брокер, вес. Под каждым — строка-источник из документа, чтобы можно было сверить глазами. Что не нашлось — помечено янтарным.',
    en: 'The fields AI (or the basic parser) pulled from the PDF: rate, miles, addresses, load number, broker, weight. Under each is the source line from the document, so it can be double-checked. Anything not found is marked amber.',
  },
  'import.differentFile': { ru: 'другой файл', en: 'different file' },
  'import.notFound': { ru: 'не найдено', en: 'not found' },
  'import.nothingGuessed': {
    ru: 'Ничего не угадывалось: если метки в документе нет, поле остаётся пустым. Deadhead и дни в пути rate con не содержит — они зависят от трака и плана.',
    en: "Nothing is guessed: if a field isn't in the document, it stays blank. The rate con doesn't include deadhead or transit days — those depend on the truck and the dispatch plan.",
  },
  'import.readingDocument': { ru: 'Читаю документ…', en: 'Reading document…' },
  'import.dropRateCon': { ru: 'Перетащи rate confirmation', en: 'Drop a rate confirmation' },
  'import.dropInfo': {
    ru: 'Перетащи или выбери PDF/фото rate confirmation от брокера. Документ читает искусственный интеллект — работает с любым шаблоном брокера и со сканами-фото.',
    en: "Drop or pick a PDF/photo of the broker's rate confirmation. AI reads the document — works with any broker template and with scanned photos.",
  },
  'import.dropSubtext': {
    ru: 'PDF или фото от брокера. Сканы тоже читаются. Документ распознаёт искусственный интеллект.',
    en: 'A PDF or photo from the broker. Scans work too. The document is recognised by AI.',
  },
  'import.retryScan': { ru: '↻ Повторить сканирование', en: '↻ Retry scan' },

  // components/load-form.tsx
  'loadForm.noTrucks': { ru: 'Нет ни одного трака — добавь трак в разделе «Траки».', en: 'No trucks yet — add one in the Trucks section.' },
  'loadForm.addTruckFirst': { ru: 'Сначала добавь трак.', en: 'Add a truck first.' },
  'loadForm.saveFailedToast': { ru: 'Груз не сохранился: {error}', en: "Load didn't save: {error}" },
  'loadForm.heading': { ru: 'Груз', en: 'Load' },
  'loadForm.truckLabel': { ru: 'Трак', en: 'Truck' },
  'loadForm.brokerRateLabel': { ru: 'Ставка брокера', en: 'Broker rate' },
  'loadForm.loadedMilesLabel': { ru: 'Loaded miles · гружёные мили', en: 'Loaded miles' },
  'loadForm.milesByMapToast': { ru: 'Мили по карте: {miles}', en: 'Miles from the map: {miles}' },
  'loadForm.routeDisabled': { ru: 'Маршрут отключён — нет ключа ORS', en: 'Route lookup disabled — no ORS key' },
  'loadForm.routeFailedToast': { ru: 'Не вышло: {error}', en: "Didn't work: {error}" },
  'loadForm.calculating': { ru: 'считаю…', en: 'calculating…' },
  'loadForm.milesByMapButton': { ru: 'мили по карте (трак-маршрут)', en: 'miles from map (truck route)' },
  'loadForm.milesByMapInfo': {
    ru: 'Считает реальные мили ПО ДОРОГАМ между городами загрузки и выгрузки (OpenStreetMap), а не по прямой «по воздуху». Точные мили = точная прибыль на милю. Бесплатно, ключ не нужен.',
    en: "Calculates real road miles between the pickup and delivery cities (OpenStreetMap), not a straight line \"as the crow flies\". Accurate miles mean accurate profit per mile. Free, no key required.",
  },
  'loadForm.deadheadLabel': { ru: 'Deadhead · порожний пробег', en: 'Deadhead miles' },
  'loadForm.transitDaysLabel': { ru: 'Дней в пути (загрузка → пусто)', en: 'Transit days (pickup → empty)' },
  'loadForm.daysSuffix': { ru: 'дн', en: 'd' },
  'loadForm.originLabel': { ru: 'Откуда', en: 'Origin' },
  'loadForm.destinationLabel': { ru: 'Куда', en: 'Destination' },
  'loadForm.phoneChipLabel': { ru: 'Тел', en: 'Ph' },
  'loadForm.truckChipLabel': { ru: 'Трак', en: 'Truck' },
  'loadForm.saving': { ru: 'Сохраняю…', en: 'Saving…' },
  'loadForm.saveLoad': { ru: 'Сохранить груз', en: 'Save load' },

  // components/load-edit-numbers.tsx
  'loadEdit.updatedToast': { ru: 'Детали обновлены', en: 'Details updated' },
  'loadEdit.rate': { ru: 'Ставка', en: 'Rate' },
  'loadEdit.loadedMiles': { ru: 'Loaded miles · гружёные', en: 'Loaded miles' },
  'loadEdit.deadheadMiles': { ru: 'Пустые мили (deadhead)', en: 'Deadhead miles' },
  'loadEdit.transitDays': { ru: 'Дней в пути', en: 'Transit days' },
  'loadEdit.spotRate': { ru: 'Spot rate (рынок)', en: 'Spot rate (market)' },
  'loadEdit.ourLaneAvg': { ru: 'наш средний по направлению', en: 'our lane average' },
  'loadEdit.noMarketData': { ru: 'рынок не подключён', en: 'no market feed' },
  'loadEdit.truckWasAt': { ru: 'Трак был в', en: 'Truck was at' },
  'loadEdit.brokerName': { ru: 'Брокер', en: 'Broker' },
  'loadEdit.noMcForCompany': {
    ru: 'У этой компании в FMCSA нет номера MC — только DOT. Впишите MC вручную, если он есть на бумаге.',
    en: 'FMCSA lists no MC for that company — only a DOT. Enter the MC by hand if the paperwork shows one.',
  },
  'loadEdit.findMc': { ru: 'Найти MC по названию', en: 'Find MC by name' },
  'loadEdit.findingMc': { ru: 'Ищу в FMCSA…', en: 'Searching FMCSA…' },
  'loadEdit.pickCompany': { ru: 'Выберите компанию — MC подставится', en: 'Pick the company — MC will fill in' },
  'loadEdit.notAllowed': { ru: 'не работает', en: 'not authorised' },
  'loadEdit.fromHistory': { ru: 'Подставить из прошлых грузов', en: 'Fill from earlier loads' },
  'loadEdit.nothingInHistory': { ru: 'В прошлых грузах этого брокера контактов нет', en: 'No contacts on earlier loads from this broker' },
  'loadEdit.invoiceTo': { ru: 'Счёт отправлять на', en: 'Send the invoice to' },
  'loadEdit.invoiceNoEmail': {
    ru: 'Почта для счёта не заполнена — впишите её здесь, и она подставится во все следующие грузы этого брокера.',
    en: 'No billing email yet — enter it here and it will fill in on every later load from this broker.',
  },
  'loadEdit.brokerMc': { ru: 'Брокер MC', en: 'Broker MC' },
  'loadEdit.phone': { ru: 'Телефон', en: 'Phone' },
  'loadEdit.pickup': { ru: 'Пикап', en: 'Pickup' },
  'loadEdit.delivery': { ru: 'Выгрузка', en: 'Delivery' },
  'loadEdit.edit': { ru: 'Изменить', en: 'Edit' },
  'loadEdit.rateDollar': { ru: 'Ставка $', en: 'Rate $' },
  'loadEdit.saving': { ru: 'Сохраняю…', en: 'Saving…' },
  'loadEdit.save': { ru: 'Сохранить', en: 'Save' },
  'loadEdit.cancel': { ru: 'Отмена', en: 'Cancel' },

  // components/ratecon-button.tsx
  'rateconButton.openTitle': { ru: 'Открыть rate confirmation', en: 'Open rate confirmation' },
  'rateconButton.openLabel': { ru: 'Открыть rate con', en: 'Open rate con' },

  // components/orphan-ratecons.tsx
  'orphanRc.createdToast': { ru: 'Груз создан из рейткона', en: 'Load created from the rate con' },
  'orphanRc.title': { ru: 'Рейткон загружен, но груз из него не создан', en: 'Rate con uploaded, but no load was created from it' },
  'orphanRc.subtitle': {
    ru: 'Разбор идёт на сервере (скан — до полутора минут). Страницу можно не держать открытой.',
    en: "Parsing runs on the server (a scan takes up to a minute and a half). You don't need to keep the page open.",
  },
  'orphanRc.aiReading': { ru: 'Читаю ИИ…', en: 'AI reading…' },
  'orphanRc.createLoad': { ru: 'Создать груз', en: 'Create load' },
  'orphanRc.deleteNote': {
    ru: 'лишний рейткон — переместится в корзину, груз из него уже не создать.',
    en: 'an extra rate con — it will move to trash and can no longer be turned into a load.',
  },

  // components/truck-rc-drop.tsx
  'rcDrop.stageReading': { ru: 'Читаю файл…', en: 'Reading file…' },
  'rcDrop.stageSaving': { ru: 'Сохраняю документ…', en: 'Saving document…' },
  'rcDrop.stageRecognizing': { ru: 'Распознаю ИИ…', en: 'AI recognizing…' },
  'rcDrop.stageRecognizingScan': { ru: 'Распознаю скан через ИИ — это до полутора минут…', en: 'AI recognizing the scan — this can take up to a minute and a half…' },
  'rcDrop.stageRetrying': { ru: 'Не получилось с первого раза — пробую ещё раз…', en: "Didn't work the first time — trying again…" },
  'rcDrop.stageCreating': { ru: 'Создаю груз…', en: 'Creating load…' },
  'rcDrop.createdToast': { ru: 'Груз создан из rate con', en: 'Load created from the rate con' },
  'rcDrop.savedAsKind': { ru: 'Распознано как {kind} — сохранено в трак', en: 'Recognized as {kind} — saved to the truck' },
  'rcDrop.createdBadge': { ru: '✓ Груз создан · проверено ИИ', en: '✓ Load created · AI checked' },
  'rcDrop.openLoad': { ru: 'Открыть груз', en: 'Open load' },
  'rcDrop.anotherRc': { ru: 'ещё RC', en: 'another RC' },
  'rcDrop.checkOnLoad': { ru: 'Проверь по грузу', en: 'Double-check on the load' },
  'rcDrop.copiedToast': { ru: 'Скопировано — можно слать водителю', en: 'Copied — ready to send to the driver' },
  'rcDrop.clipboardDenied': { ru: 'Браузер не дал буфер — выдели вручную', en: 'Browser denied clipboard access — select it manually' },
  'rcDrop.doNotClose': { ru: 'Не закрывай и не обновляй страницу — груз создастся в конце.', en: "Don't close or refresh the page — the load will be created at the end." },
  'rcDrop.dropCta': { ru: '＋ Rate con → сразу груз на этот трак', en: '＋ Rate con → an instant load on this truck' },
  'rcDrop.dropSubtext': { ru: 'PDF или фото. ИИ распознает, создаст груз и покажет, что проверить.', en: 'PDF or photo. AI reads it, creates the load, and shows what to check.' },
  'rcDrop.secondsSuffix': { ru: 'с', en: 's' },

  // components/broker-notes.tsx — NOTE: the "🌐 На русский" / "Оригинал (EN)" /
  // "Перевожу…" content-language toggle is deliberately NOT in this dictionary —
  // it always translates the broker's own rate-con text to Russian regardless of
  // the app's UI locale, so its own button text stays fixed/hardcoded in the
  // component. Everything else in the file goes through these keys.
  'brokerNotes.tagSafety': { ru: 'Безопасность', en: 'Safety' },
  'brokerNotes.tagLoad': { ru: 'Погрузка', en: 'Loading' },
  'brokerNotes.tagSchedule': { ru: 'График', en: 'Schedule' },
  'brokerNotes.tagContact': { ru: 'Контакт', en: 'Contact' },
  'brokerNotes.tagRef': { ru: 'Номера', en: 'Reference #s' },
  'brokerNotes.tagDocs': { ru: 'Документы', en: 'Documents' },
  'brokerNotes.tagInsurance': { ru: 'Страховка', en: 'Insurance' },
  'brokerNotes.tagPenalty': { ru: 'Штрафы', en: 'Penalties' },
  'brokerNotes.tagWarning': { ru: 'Важно', en: 'Important' },
  'brokerNotes.editHeading': { ru: 'Заметка от брокера', en: 'Note from broker' },
  'brokerNotes.placeholder': {
    ru: 'Особые условия брокера: детеншн, аппойнтмент, требования к POD, лампер и т.д.',
    en: "Broker's special conditions: detention, appointment, POD requirements, lumper, etc.",
  },
  'brokerNotes.parsing': { ru: 'Читаю рейткон…', en: 'Reading rate con…' },
  'brokerNotes.parseRc': { ru: '✨ Разобрать рейткон (ИИ)', en: '✨ Parse rate con (AI)' },
  'brokerNotes.orTypeManually': { ru: 'или вписать вручную', en: 'or type it in manually' },
  'brokerNotes.addNote': { ru: '＋ Добавить важную заметку от брокера', en: "＋ Add an important note from the broker" },
  'brokerNotes.parsedFound': { ru: 'Рейткон разобран — проверь важное', en: 'Rate con parsed — check what matters' },
  'brokerNotes.parsedNotFound': { ru: 'В рейтконе не нашлось особых заметок', en: 'No special notes found in the rate con' },
  'brokerNotes.savedToast': { ru: 'Заметка сохранена', en: 'Note saved' },
  'brokerNotes.heading': { ru: 'Важное от брокера', en: 'Important from broker' },
  'brokerNotes.new': { ru: 'новое', en: 'new' },
  'brokerNotes.readOn': { ru: 'прочитано {date}', en: 'read {date}' },
  'brokerNotes.collapse': { ru: 'Свернуть', en: 'Collapse' },
  'brokerNotes.expand': { ru: 'Развернуть', en: 'Expand' },
  'brokerNotes.acknowledge': { ru: 'Прочитано', en: 'Read' },
  'brokerNotes.updateFromRc': { ru: 'обновить из рейткона', en: 'update from rate con' },

  // components/analysis.tsx
  'analysis.tollsLabel': { ru: 'Платные дороги', en: 'Tolls' },
  'analysis.tollsHint': {
    ru: 'Проезд по платным дорогам на этом маршруте. Считается в разделе «Толлы» и записывается на груз кнопкой; пока не посчитан — ноль, и прибыль показывается так, будто дороги бесплатные.',
    en: 'Toll roads on this route. Calculated in the Tolls section and written onto the load with a button; until then it is zero and profit is shown as if the roads were free.',
  },
  'analysis.notConfigured': {
    ru: 'Прибыль не посчитана: у трака не заданы расходы. Откройте Траки → нужный трак → «Экономика трака» и впишите расход топлива, оплату водителя, платёж за трак, страховку и обслуживание. До этого любая цифра прибыли была бы выдумкой.',
    en: 'Profit not calculated: this truck has no costs set. Open Trucks → the truck → “Truck economics” and fill in fuel burn, driver pay, truck payment, insurance and maintenance. Until then any profit figure would be made up.',
  },
  'analysis.net': { ru: 'Чистыми', en: 'Net' },
  'analysis.marginLine': {
    ru: ' · маржа {pct}% · себестоимость груза (за вычетом всех расходов) ',
    en: ' · {pct}% margin · break-even rate (after all costs) ',
  },
  'analysis.belowLoss': { ru: ' — ниже неё в убыток', en: " — below that, it's a loss" },
  'analysis.datMarket': { ru: 'Рынок DAT', en: 'DAT market' },
  'analysis.aboveMarketBy': { ru: ' — предложение выше рынка на ', en: ' — offer is above market by ' },
  'analysis.belowMarketBy': { ru: ' — предложение ниже рынка на ', en: ' — offer is below market by ' },
  'analysis.roomToNegotiate': { ru: '. Есть на что давить в торге.', en: ". There's room to negotiate." },
  'analysis.clickToSeeExpenses': { ru: 'Нажмите, чтобы увидеть все расходы', en: 'Click to see all expenses' },
  'analysis.allInRpmInfo': {
    ru: 'Доход на милю с учётом всех расходов по этому грузу: чистыми ÷ мили (гружёные + порожние). Ниже нуля — груз в убыток.',
    en: 'Revenue per mile after all costs on this load: net ÷ miles (loaded + deadhead). Below zero means the load is a loss.',
  },
  'analysis.spotRateInfo': {
    ru: 'Рыночная ставка за милю по DAT для похожего маршрута — ориентир, есть ли смысл торговаться по цене. Прочерк — не указана.',
    en: "DAT's market rate per mile for a similar lane — a benchmark for whether it's worth negotiating on price. A dash means it wasn't provided.",
  },
  'analysis.netPerDay': { ru: 'Чистыми / день', en: 'Net / day' },
  'analysis.netPerDayInfo': {
    ru: 'Чистыми, поделённые на дни в пути — сколько груз приносит в день, чтобы сравнивать грузы разной длины между собой.',
    en: 'Net profit divided by transit days — how much the load earns per day, so loads of different lengths can be compared.',
  },
  'analysis.gross': { ru: 'Гросс', en: 'Gross' },
  // Short forms for the rate-split bar's legend, where the full labels
  // ("Топливо · 960 mi @ 6.5 mpg") would wrap the whole row.
  'analysis.fuelShort': { ru: 'Топливо', en: 'Fuel' },
  'analysis.netShort': { ru: 'Чистыми', en: 'Net' },
  'analysis.fuelLabel': { ru: 'Топливо · {miles} mi @ {mpg} mpg', en: 'Fuel · {miles} mi @ {mpg} mpg' },
  'analysis.fuelHint': {
    ru: 'Топливо на этот груз: мили ÷ расход (MPG) × цена дизеля. MPG и цену дизеля меняешь ниже, в «Расходы трака».',
    en: 'Fuel for this load: miles ÷ fuel economy (MPG) × diesel price. Change MPG and diesel price below, under "Truck costs".',
  },
  'analysis.driverLabel': { ru: 'Водитель', en: 'Driver' },
  'analysis.driverHint': {
    ru: 'Оплата водителя за этот груз: мили × ставку за милю (или % от гросса). Настройка — в «Расходы трака».',
    en: 'Driver pay for this load: miles × rate per mile (or % of gross). Configure it under "Truck costs".',
  },
  'analysis.maintenanceLabel': { ru: 'Обслуживание', en: 'Maintenance' },
  'analysis.maintenanceHint': {
    ru: 'Износ по пробегу: мили × стоимость обслуживания за милю (шины, ТО). Настройка — в «Расходы трака».',
    en: 'Wear by mileage: miles × maintenance cost per mile (tires, service). Configure it under "Truck costs".',
  },
  'analysis.truckPaymentLabel': { ru: 'Платёж за трак', en: 'Truck payment' },
  'analysis.truckPaymentHint': {
    ru: 'Кредит/лизинг за трак, за день × дни в пути. Тратится, даже когда трак стоит. Сумму за день меняешь в «Расходы трака», число дней — в Деталях.',
    en: 'Truck loan/lease, per day × transit days. It accrues even while the truck is idle. Change the daily amount under "Truck costs", and the day count under Details.',
  },
  'analysis.insuranceLabel': { ru: 'Страховка', en: 'Insurance' },
  'analysis.insuranceHint': {
    ru: 'Страховка трака (liability + cargo + physical damage), за день × дни в пути. Настройка — в «Расходы трака».',
    en: 'Truck insurance (liability + cargo + physical damage), per day × transit days. Configure it under "Truck costs".',
  },
  'analysis.eldLabel': { ru: 'ELD, пермиты, плейты', en: 'ELD, permits, plates' },
  'analysis.eldHint': {
    ru: 'ELD-подписка + IRP/IFTA пермиты и плейты, за день × дни в пути. Настройка — в «Расходы трака».',
    en: 'ELD subscription + IRP/IFTA permits and plates, per day × transit days. Configure it under "Truck costs".',
  },
  'analysis.factoringLabel': { ru: 'Факторинг', en: 'Factoring' },
  'analysis.factoringHint': {
    ru: 'Комиссия факторинга — процент от гросса за быструю оплату. Настройка — в «Расходы трака».',
    en: 'Factoring fee — a percentage of gross for fast payment. Configure it under "Truck costs".',
  },
  'analysis.dispatchLabel': { ru: 'Диспетч', en: 'Dispatch' },
  'analysis.dispatchHint': {
    ru: 'Комиссия диспетчера — процент от гросса. Настройка — в «Расходы трака».',
    en: "Dispatcher's commission — a percentage of gross. Configure it under \"Truck costs\".",
  },
  'analysis.netMarginLine': { ru: 'Чистыми · {pct}% маржа', en: 'Net · {pct}% margin' },

  // components/broker-check.tsx
  'brokerCheck.heading': { ru: 'Проверка брокера · MC {mc}', en: 'Broker check · MC {mc}' },
  'brokerCheck.info': {
    ru: 'По номеру MC проверяем брокера в базе FMCSA: активны ли его полномочия, есть ли страховой бонд, сколько лет MC. Плюс автоматические красные флаги мошенничества (нет бонда, молодой MC, публичный email, несовпадение телефона). Красный ⛔ — не бери груз.',
    en: "Checks the broker in the FMCSA database by MC number: whether their authority is active, whether they have a surety bond, and how old the MC is. Plus automatic fraud red flags (no bond, young MC, public email, mismatched phone). A red ⛔ means don't take the load.",
  },
  'brokerCheck.checking': { ru: 'проверяю в FMCSA…', en: 'checking FMCSA…' },
  // Раньше здесь советовали задать переменную окружения FMCSA_WEBKEY — диспетчеру
  // это ни о чём не говорит и сделать он этого не может. Теперь ключ вводится в
  // приложении, и текст указывает туда же.
  'brokerCheck.noKey': {
    ru: 'Проверка брокеров не подключена. Администратор может добавить бесплатный ключ FMCSA в разделе Админ → Ключи.',
    en: 'Broker checks are not connected. An admin can add a free FMCSA key in Admin → Keys.',
  },
  'brokerCheck.bondYes': { ru: 'Бонд: есть', en: 'Bond: yes' },
  'brokerCheck.bondNo': { ru: 'Бонд: НЕТ', en: 'Bond: NO' },
  'brokerCheck.grantedOn': { ru: 'выдана {date}', en: 'granted {date}' },
  'brokerCheck.noRedFlags': { ru: '✓ Красных флагов нет.', en: '✓ No red flags.' },

  // lib/rc-warnings.ts
  'rcWarn.team': { ru: 'Требуется team (два водителя) — проверь, потянет ли один.', en: 'Team required (two drivers) — check whether a solo driver can cover it.' },
  'rcWarn.hazmat': { ru: 'Hazmat / опасный груз — нужен эндорсмент и допуск.', en: 'Hazmat / dangerous goods — an endorsement and clearance are required.' },
  'rcWarn.reefer': { ru: 'Рефрижератор / температурный режим — проверь настройку и pre-cool.', en: 'Reefer / temperature-controlled — check the setpoint and pre-cool.' },
  'rcWarn.detention': { ru: 'Указан detention — зафиксируй время in/out, уточни ставку ожидания.', en: 'Detention is mentioned — log the in/out times and confirm the waiting rate.' },
  'rcWarn.lumper': { ru: 'Lumper (платная разгрузка) — сохрани чек, добавь в инвойс возмещением.', en: 'Lumper (paid unloading) — keep the receipt and add it to the invoice as a reimbursement.' },
  'rcWarn.tonu': { ru: 'Есть условие TONU — если груз отменят, потребуй оплату за подачу.', en: 'A TONU clause is present — if the load is cancelled, demand payment for the trip.' },
  'rcWarn.appointment': { ru: 'Загрузка/выгрузка строго по записи (appointment) — опоздание = проблемы.', en: 'Pickup/delivery is a strict appointment — being late means trouble.' },
  'rcWarn.fcfs': { ru: 'FCFS (живая очередь) — заложи время на ожидание.', en: 'FCFS (first come, first served) — budget in wait time.' },
  'rcWarn.driverAssist': { ru: 'Возможна разгрузка/погрузка силами водителя — уточни заранее.', en: 'The driver may need to help load/unload — confirm ahead of time.' },
  'rcWarn.palletExchange': { ru: 'Обмен паллет / pallet jack — уточни условия.', en: 'Pallet exchange / pallet jack — confirm the terms.' },
  'rcWarn.liftgate': { ru: 'Нужен liftgate — проверь, есть ли на трейлере.', en: 'A liftgate is required — check the trailer has one.' },
  'rcWarn.flatbed': { ru: 'Флэтбед / тент (tarp) — проверь оснащение.', en: 'Flatbed / tarp — check the equipment.' },
  'rcWarn.residential': { ru: 'Доставка в жилую зону (residential) — часто медленно и тесно.', en: 'Residential delivery — often slow and tight on space.' },
  'rcWarn.penalty': { ru: 'В договоре есть штрафы/chargeback — прочитай условия внимательно.', en: 'The agreement includes penalties/chargebacks — read the terms carefully.' },
  'rcWarn.scaleTicket': { ru: 'Нужен scale ticket / взвешивание — не забудь.', en: "A scale ticket / weigh-in is required — don't forget it." },
  'rcWarn.rateNotParsed': { ru: 'Ставка не распозналась — впиши вручную, иначе расчёт неверный.', en: "Rate wasn't recognized — enter it manually, or the calculation will be wrong." },
  'rcWarn.milesNotParsed': { ru: 'Мили не распознались — уточни («мили по карте» в грузе).', en: 'Miles were not recognized — check ("miles from map" on the load).' },
  'rcWarn.lowRate': { ru: 'Низкая ставка: {rpm}/милю — на грани убытка, проверь.', en: 'Low rate: {rpm}/mile — right at the edge of a loss, double-check.' },
  'rcWarn.belowMarketRate': { ru: 'Ставка {rpm}/милю — ниже рынка, взвесь.', en: '{rpm}/mile rate — below market, weigh it carefully.' },
  'rcWarn.heavyLoad': { ru: 'Тяжёлый груз ({weight}) — проверь развес по осям и scale.', en: 'Heavy load ({weight}) — check axle weight distribution and scale.' },

  // lib/fmcsa.ts
  'fmcsa.authorityInactive': { ru: 'Полномочия брокера НЕ активны (FMCSA)', en: "Broker's authority is NOT active (FMCSA)" },
  'fmcsa.noBond': { ru: 'Нет бонда BMC-84 на файле — брокер не имеет права работать', en: 'No BMC-84 bond on file — the broker is not authorized to operate' },
  'fmcsa.mcYoungerThan3': { ru: 'MC моложе 3 месяцев ({months} мес.) — частый признак мошенника', en: 'MC is younger than 3 months ({months} mo.) — a common scam signal' },
  'fmcsa.mcYoungerThan6': { ru: 'MC моложе 6 месяцев ({months} мес.)', en: 'MC is younger than 6 months ({months} mo.)' },
  'fmcsa.nameMismatch': {
    ru: 'Имя в rate con («{rcName}») не совпадает с FMCSA («{fmcsaName}»)',
    en: 'Name in the rate con ("{rcName}") doesn\'t match FMCSA ("{fmcsaName}")',
  },
  'fmcsa.phoneMismatch': { ru: 'Телефон в rate con не совпадает с телефоном в FMCSA', en: "Phone in the rate con doesn't match the phone in FMCSA" },
  'fmcsa.publicEmailDomain': { ru: 'Публичный email-домен ({domain}) у «компании»', en: 'Public email domain ({domain}) for a "company"' },
  'fmcsa.noMcToCheck': { ru: 'Нет номера MC для проверки.', en: 'No MC number to check.' },
  'fmcsa.nameTooShort': { ru: 'Введите хотя бы три буквы названия.', en: 'Type at least three letters of the name.' },
  'fmcsa.nameNotFound': { ru: 'В FMCSA нет компании с названием «{name}».', en: 'FMCSA has no company named "{name}".' },
  'fmcsa.mcNotFound': { ru: 'FMCSA не нашла MC {mc}.', en: "FMCSA couldn't find MC {mc}." },
  'fmcsa.dotNotFound': { ru: 'FMCSA не нашла DOT {dot}.', en: "FMCSA couldn't find DOT {dot}." },
  'fmcsa.outOfService': { ru: 'Брокер помечен OUT OF SERVICE в FMCSA', en: 'Broker is flagged OUT OF SERVICE in FMCSA' },
  'fmcsa.mcs150Outdated': { ru: 'Регистрация MCS-150 просрочена — компания давно не обновляла данные', en: 'MCS-150 registration is outdated — the company has not updated its filing' },

  // lib/ratecon-ai.ts
  'rateconAi.slowServer': {
    ru: 'Сервер долго отвечал (обычно так со сканами). Документ уже сохранён — собери груз кнопкой «Создать груз» ниже, либо попробуй ещё раз.',
    en: 'The server took too long to respond (usually happens with scans). The document is already saved — assemble the load with the "Create load" button below, or try again.',
  },

  // lib/ratecon-ai-contract.ts
  'rateconAiContract.recognizedByAi': { ru: 'Распознано ИИ ({model})', en: 'Recognized by AI ({model})' },

  // app/load/card — разбор из Telegram-бота: всё по грузу на одном экране
  'loadCard.title': { ru: 'Разбор груза', en: 'Load breakdown' },
  'loadCard.subtitle': {
    ru: 'Всё по этому грузу: расчёт, маршрут, текст водителю и письмо брокеру. Данные пришли из ссылки и на сервер не попадают.',
    en: 'Everything about this load: the numbers, the route, the driver text and the broker email. The data comes from the link and never reaches a server.',
  },
  'loadCard.analysis': { ru: 'Расчёт', en: 'Analysis' },
  'loadCard.rate': { ru: 'Ставка', en: 'Rate' },
  'loadCard.miles': { ru: 'Мили', en: 'Miles' },
  'loadCard.rpm': { ru: 'За милю', en: 'Per mile' },
  'loadCard.afterFuel': { ru: 'После топлива', en: 'After fuel' },
  'loadCard.fuelNote': { ru: 'Топливо оценочно:', en: 'Fuel estimate:' },
  'loadCard.deadheadNote': {
    ru: 'Порожний пробег и ваши расходы не учтены — их знает только диспетчер.',
    en: 'Deadhead and your own costs are not included — only the dispatcher knows those.',
  },
  'loadCard.openCalculator': { ru: 'Посчитать точнее в калькуляторе', en: 'Refine in the calculator' },
  'loadCard.noNumbers': {
    ru: 'Ставки или миль в ссылке нет — расчёт не построить.',
    en: 'The link carries no rate or mileage, so there is nothing to calculate.',
  },
  'loadCard.map': { ru: 'Маршрут', en: 'Route' },
  'loadCard.mapNoPoints': {
    ru: 'Карту строить не по чему: в ссылке нет {what}. Обычно это значит, что в рейт-коне адрес напечатан не так, как ожидает разбор.',
    en: 'Nothing to draw the route from: the link has no {what}. Usually that means the rate confirmation prints the address in a way the parser did not expect.',
  },
  'loadCard.mapPickup': { ru: 'адреса погрузки', en: 'pickup address' },
  'loadCard.mapDelivery': { ru: 'адреса доставки', en: 'delivery address' },
  'loadCard.mapBoth': { ru: 'ни одного адреса', en: 'either address' },
  'loadCard.mapFailed': {
    ru: 'Не удалось построить маршрут по этим адресам — геокодер их не узнал.',
    en: 'Could not build a route for these addresses — the geocoder did not recognise them.',
  },
  'loadCard.driverInfo': { ru: 'Текст водителю', en: 'Driver information' },
  'loadCard.brokerEmail': { ru: 'Письмо брокеру', en: 'Broker email' },
  'loadCard.openInMail': { ru: 'Открыть в почте', en: 'Open in mail' },
  'loadCard.copy': { ru: 'Скопировать', en: 'Copy' },
  'loadCard.copied': { ru: 'Скопировано', en: 'Copied' },
  'loadCard.copyFailed': { ru: 'Не удалось скопировать', en: 'Copy failed' },
  'loadCard.baselineFor': { ru: 'Ориентир по {equip}', en: 'Baseline for {equip}' },
  'loadCard.brokerCheck': { ru: '🔎 Проверка брокера', en: '🔎 Broker check' },
  'loadCard.brokerCheckDisclaimer': {
    ru: 'Это проверка юридического статуса по FMCSA — она НЕ проверяет платёжеспособность и НЕ заменяет факторинг. Проверьте этот MC/DOT ещё и в личном кабинете вашей факторинговой компании.',
    en: "This is an FMCSA legal-status check — it does NOT verify creditworthiness and does NOT replace factoring. Also check this MC/DOT in your factoring company's own portal.",
  },
  'loadCard.noMc': { ru: 'MC брокера не указан — проверить не получится.', en: "Broker MC not provided — can't check it." },

  // app/loads/page.tsx — недельная сводка и «требуют внимания». Показатели выбраны
  // не на глаз: выручка на трак, ставка-миля и доля порожних миль — то, что
  // отраслевые руководства называют ежедневным минимумом диспетчера.
  'loads.week.title': { ru: 'Эта неделя', en: 'This week' },
  'loads.week.gross': { ru: 'выручка', en: 'revenue' },
  'loads.week.net': { ru: 'чистыми', en: 'net' },
  'loads.week.rpm': { ru: 'ставка-миля', en: 'per mile' },
  'loads.week.deadhead': { ru: 'порожние', en: 'deadhead' },
  'loads.week.perTruck': { ru: 'на трак', en: 'per truck' },
  'loads.week.empty': { ru: 'На этой неделе грузов пока нет', en: 'No loads this week yet' },
  'import.label.payVia': { ru: 'Платит через', en: 'Pays via' },
  'loads.attention.title': { ru: 'Требуют внимания', en: 'Needs attention' },
  'loads.attention.uninvoiced': { ru: 'счёт не выставлен', en: 'not invoiced' },
  'loads.attention.overdue': { ru: 'оплата просрочена', en: 'payment overdue' },
  'loads.attention.noRc': { ru: 'нет рейт-кона', en: 'no rate con' },
  'loads.attention.losing': { ru: 'в минус', en: 'losing money' },
  'loads.attention.more': { ru: 'ещё {n}', en: '{n} more' },
} as const
