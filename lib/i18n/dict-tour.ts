// Вводная экскурсия (components/tour.tsx): первый рабочий день экран за экраном.

export const tourDict = {
  'tour.launcher': { ru: 'Как это работает', en: 'How it works' },
  'tour.next': { ru: 'Дальше', en: 'Next' },
  'tour.back': { ru: 'Назад', en: 'Back' },
  'tour.go': { ru: 'Открыть экран', en: 'Open this screen' },
  'tour.done': { ru: 'Готово', en: 'Done' },
  'tour.skip': { ru: 'Закрыть', en: 'Close' },
  'tour.stepOf': { ru: 'Шаг {n} из {total}', en: 'Step {n} of {total}' },
  'tour.doneMark': { ru: 'уже сделано', en: 'already done' },

  'tour.welcome.title': { ru: 'Обзор: что парк заработал и что везёт', en: 'Overview: what the fleet earned and hauls' },
  'tour.welcome.text': {
    ru: 'Главный экран. Сверху — то, что требует действия сегодня: документы с истекающим сроком, непрочитанные сообщения брокеров, неоплаченные счета. Ниже — рейт и чистыми за период, средняя ставка за милю, кто в работе. «Загрузка парка» показывает каждый трак по дням: где стоял, куда ехал, когда освободится. Дальше проведём по всем разделам — это займёт пару минут.',
    en: 'The home screen. At the top, what needs action today: expiring documents, unread broker messages, unpaid invoices. Below, gross and net for the period, average rate per mile, who is working. “Fleet load” shows each truck day by day: where it sat, where it went, when it frees up. We will walk through every section next — a couple of minutes.',
  },
  'tour.keys.title': { ru: 'Ключи: чтобы приложение читало документы', en: 'Keys: so the app can read documents' },
  'tour.keys.text': {
    ru: 'Меню аккаунта (кружок слева внизу) → Ключи. Google AI читает рейт-коны и сканы и сам заполняет груз; HERE считает платные дороги под трак; FMCSA проверяет брокера по MC. Все три бесплатные, выдаются за минуту по ссылкам рядом с полями. Ключи лежат в вашей базе — лимиты только ваши.',
    en: 'Account menu (the circle at the bottom left) → Keys. Google AI reads rate cons and scans and fills in the load by itself; HERE prices toll roads for a truck; FMCSA checks a broker by MC. All three are free and issued in a minute via the links next to the fields. The keys stay in your database — the quotas are yours alone.',
  },
  'tour.company.title': { ru: 'Реквизиты: что печатается в счетах', en: 'Company details: what goes on invoices' },
  'tour.company.text': {
    ru: 'Название, MC/DOT, адрес, телефон, email — всё это встаёт в шапку счёта брокеру. Поле «Кому платить» заполняется только если ваши счета выкупает факторинг; без факторинга оставьте пустым, и брокер заплатит вам напрямую.',
    en: 'Name, MC/DOT, address, phone, email — all of it goes on the invoice header to the broker. “Remit-To” is filled only if a factoring company buys your invoices; without factoring leave it blank and the broker pays you directly.',
  },
  'tour.users.title': { ru: 'Люди: у каждого свой вход', en: 'People: everyone gets their own login' },
  'tour.users.text': {
    ru: 'Заведите диспетчеров здесь или подтвердите заявки, которые они оставили сами на экране входа. У каждого свой пароль и свой след в журнале — видно, кто что сделал. Здесь же сбрасывается пароль и отключается ушедший сотрудник.',
    en: 'Add dispatchers here, or approve the requests they left themselves on the sign-in screen. Each has their own password and their own trail in the journal — you see who did what. Passwords are reset here too, and a departed employee is switched off.',
  },
  'tour.trucks.title': { ru: 'Трак: машина, водитель, экономика', en: 'Truck: the rig, the driver, the economics' },
  'tour.trucks.text': {
    ru: 'Траки → «Добавить трак». Номер, водитель и цифры, без которых прибыль по грузу — выдумка: расход топлива, ставка водителю за милю или процентом, платёж за трак, страховка, ELD и пермиты в день. Заполнили один раз — каждый груз дальше считается сам.',
    en: 'Trucks → “Add truck”. The number, the driver, and the numbers without which load profit is fiction: fuel mileage, driver pay per mile or percent, truck payment, insurance, ELD and permits per day. Fill it in once — every load is then costed automatically.',
  },
  'tour.truckCard.title': { ru: 'Карточка трака: всё о машине на одном экране', en: 'Truck card: the whole rig on one screen' },
  'tour.truckCard.text': {
    ru: 'Рейт за неделю и чистыми, когда менять масло, сколько топлива. Текущее задание или — если трак свободен — город, где он стоит и откуда искать груз. Водитель с телефоном, сроками CDL и медкарты. Ниже — карта, история пути, документы и обслуживание.',
    en: 'This week’s gross and net, when the oil is due, how much fuel is left. The current job — or, if the truck is free, the city where it sits and where to look for a load from. The driver with phone, CDL and medical card expiry. Below: the map, trip history, documents and maintenance.',
  },
  'tour.loads.title': { ru: 'Груз: перетащите рейт-кон', en: 'Load: drop the rate con' },
  'tour.loads.text': {
    ru: 'Грузы → «+ Груз». Перетащите PDF или фото рейт-кона — приложение само вытащит брокера, ставку, адреса, даты и мили. Проверьте, выберите трак (рядом с каждым написано, где он сейчас) — и справа уже посчитано: ставка за милю, расходы, чистыми.',
    en: 'Loads → “+ Load”. Drop a PDF or a photo of the rate con — the app pulls out the broker, the rate, the stops, the dates and the miles by itself. Check it, pick a truck (each one shows where it is right now) — and on the right it is already costed: rate per mile, expenses, net.',
  },
  'tour.loadCard.title': { ru: 'Карточка груза: от брони до оплаты', en: 'Load card: from booking to payment' },
  'tour.loadCard.text': {
    ru: 'Статус груза ведётся по шагам: забронирован → в пути → доставлен → выставлен счёт → оплачен. К грузу прикрепляются рейт-кон, BOL и POD; водителю отправляется адрес и контакты одним нажатием. Внизу — расчёт прибыли именно по этому грузу и этому траку.',
    en: 'The load status moves step by step: booked → in transit → delivered → invoiced → paid. The rate con, BOL and POD attach to the load; the driver gets the address and contacts in one tap. At the bottom — the profit calculation for this very load on this very truck.',
  },
  'tour.tracking.title': { ru: 'Трекинг: где траки прямо сейчас', en: 'Tracking: where the trucks are right now' },
  'tour.tracking.text': {
    ru: 'Карта всего парка по GPS из ELD: кто едет, кто на смене, кто стоит. Сколько миль до выгрузки, сколько траков под грузом, у кого нет сигнала. Нажмите трак — увидите его цифры. Ссылку на отдельный трак можно отправить брокеру — он увидит только этот трак.',
    en: 'The whole fleet on a map from ELD GPS: who is driving, who is on duty, who is parked. Miles left to delivery, how many trucks are loaded, who has no signal. Tap a truck to see its numbers. A link to a single truck can go to a broker — they see that truck only.',
  },
  'tour.docs.title': { ru: 'Файлы: все бумаги в одном месте', en: 'Files: every document in one place' },
  'tour.docs.text': {
    ru: 'Рейт-коны, BOL, POD, страховки, регистрации, фото — по тракам и по грузам. Загружаете с компьютера или с телефона; приложение само определяет, что за документ, и кладёт к нужному грузу. Отсюда же собирается пакет для счёта.',
    en: 'Rate cons, BOLs, PODs, insurance, registrations, photos — by truck and by load. Upload from a computer or a phone; the app recognises what kind of document it is and files it with the right load. The invoice package is assembled from here too.',
  },
  'tour.brokers.title': { ru: 'Брокеры: проверить до того, как везти', en: 'Brokers: check before you haul' },
  'tour.brokers.text': {
    ru: 'Введите MC — приложение спросит реестр FMCSA: действует ли авторити, есть ли страховка, давно ли на рынке. Здесь же копятся ваши заметки о брокере и история грузов с ним: платил ли вовремя, были ли задержки.',
    en: 'Enter an MC — the app asks the FMCSA registry: is the authority active, is there insurance, how long in business. Your own notes on the broker and the history of loads with them build up here too: did they pay on time, were there delays.',
  },
  'tour.tolls.title': { ru: 'Толлы: сколько стоит дорога', en: 'Tolls: what the road costs' },
  'tour.tolls.text': {
    ru: 'Откуда и куда — и приложение предлагает варианты маршрута с платными дорогами под 5-осный трак: где дороже, где дольше, где сколько. Толлы попадают в себестоимость груза, так что чистыми считаются честно, а не без дороги.',
    en: 'From and to — and the app offers route options with toll roads priced for a 5-axle truck: which is pricier, which is longer, how much where. Tolls go into the load cost, so net is counted honestly, not as if the road were free.',
  },
  'tour.invoices.title': { ru: 'Финансы: счета и кто должен', en: 'Finances: invoices and who owes' },
  'tour.invoices.text': {
    ru: 'По доставленному грузу счёт собирается одной кнопкой: ваши реквизиты, груз, ставка, приложенные BOL и POD — в один PDF. Список показывает, что выставлено, что оплачено, что просрочено и на сколько. Это последний шаг — дальше первый день повторяется с новым грузом.',
    en: 'For a delivered load the invoice is assembled with one button: your details, the load, the rate, the attached BOL and POD — in one PDF. The list shows what is invoiced, what is paid, what is overdue and by how much. This is the last step — from here the first day repeats with the next load.',
  },
} as const
