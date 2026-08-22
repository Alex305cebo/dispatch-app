// Finances domain: app/invoices/**, invoice-actions, lib/invoice.ts.

export const financesDict = {
  'finances.title': { ru: 'Финансы', en: 'Finances' },
  'finances.info.main': {
    ru: 'Не оплачено — выставленные, но ещё не оплаченные счета, по возрасту долга. Оплачено — уже пришедшие деньги, с разбивкой прибыли по каждому грузу.',
    en: 'Unpaid — invoices already sent but not yet paid, sorted by how overdue they are. Paid — money already received, with the profit breakdown for each load.',
  },
  'finances.info.dispatchers': {
    ru: ' По диспетчерам — кто из диспетчеров сколько заработал по неделям вместе со своими водителями.',
    en: ' By dispatcher — how much each dispatcher earned by week, together with their drivers.',
  },
  'finances.info.tail': {
    ru: ' Водители — недельная ведомость зарплаты по каждому водителю (мили и ставка из экономики трака). Инвойс собирается на странице груза после загрузки POD.',
    en: " Drivers — a weekly pay statement for each driver (miles and rate from the truck's economics). Invoices are built on the load page after the POD is uploaded.",
  },

  'finances.tabDesc.unpaid': {
    ru: 'Кто ещё не заплатил. Инвойс собирается на странице груза после загрузки POD.',
    en: 'Who still owes you. Invoices are built on the load page after the POD is uploaded.',
  },
  'finances.tabDesc.paid': {
    ru: 'Уже оплаченные грузы и что каждый из них принёс.',
    en: 'Loads already paid, and what each one brought in.',
  },
  'finances.tabDesc.dispatchers': {
    ru: 'Кто из диспетчеров сколько заработал по неделям, в разбивке по своим водителям.',
    en: 'How much each dispatcher earned by week, broken down by their drivers.',
  },
  'finances.tabDesc.drivers': {
    ru: 'Зарплата водителей по неделям: грузы, мили и ставка по каждому — итог к выплате.',
    en: 'Driver pay by week: loads, miles, and rate for each — the total due.',
  },

  'finances.tab.dispatchers': { ru: 'По диспетчерам', en: 'By dispatcher' },
  'finances.tab.unpaid': { ru: 'Не оплачено', en: 'Unpaid' },
  'finances.tab.paid': { ru: 'Оплачено', en: 'Paid' },
  'finances.tab.drivers': { ru: 'Водители', en: 'Drivers' },

  'finances.stat.waitingTotal': { ru: 'Ждём всего', en: 'Total waiting' },
  'finances.stat.waitingInfo': {
    ru: 'Включая {amt} без выставленного счёта',
    en: 'Including {amt} with no invoice yet',
  },
  'finances.group.overdue': { ru: 'Просрочено', en: 'Overdue' },
  'finances.stat.bucket030': { ru: '0–30 дн.', en: '0–30 days' },
  'finances.stat.bucket3145': { ru: '31–45 дн.', en: '31–45 days' },
  'finances.stat.bucket45plus': { ru: '45+ / просрочка', en: '45+ / overdue' },
  'finances.stat.paidTotal': { ru: 'Оплачено всего', en: 'Total paid' },
  'finances.stat.net': { ru: 'Чистыми', en: 'Net' },
  'finances.stat.loadsCount': { ru: 'Грузов', en: 'Loads' },
  'finances.stat.avgRpm': { ru: 'Средний RPM', en: 'Avg RPM' },

  'finances.uninvoiced.heading': { ru: 'Доставлено, счёт не выставлен', en: 'Delivered, not invoiced' },
  'finances.uninvoiced.info': {
    ru: 'Груз довезли, но инвойс ещё не собран (это делается на странице груза) — эти деньги не попадают в возрастные корзины выше, пока инвойс не выставлен.',
    en: "The load was delivered but the invoice hasn't been built yet (do that on the load page) — this money isn't counted in the aging buckets above until it is invoiced.",
  },
  'finances.uninvoiced.cta': { ru: 'собери инвойс на странице груза', en: 'build the invoice on the load page' },

  'finances.unpaid.empty': {
    ru: 'Нет неоплаченных инвойсов. Собери инвойс на странице доставленного груза.',
    en: "No unpaid invoices. Build one on a delivered load's page.",
  },
  'finances.unpaid.daysOut': { ru: '{d} дн. (Net {n})', en: '{d} days (Net {n})' },
  'finances.unpaid.overdue': { ru: ' — просрочка', en: ' — overdue' },

  'finances.paid.empty': { ru: 'Пока ни один груз не отмечен оплаченным.', en: 'No loads marked paid yet.' },
  'finances.netInline': { ru: 'чистыми', en: 'net' },

  'finances.dispatcher.none': { ru: 'Без диспетчера', en: 'No dispatcher' },
  'finances.openAccessWarning': {
    ru: 'Сейчас включён «Открытый доступ» (Админка) — пока он включён, новые грузы создаются без привязки к диспетчеру и попадут в «Без диспетчера». Выключи его в админке, чтобы отчёт снова считал верно.',
    en: 'Open Access (Admin) is currently on — while it is on, new loads are created with no dispatcher and land under "No dispatcher". Turn it off in Admin so the report counts correctly again.',
  },
  'finances.noLoads': { ru: 'Пока нет грузов.', en: 'No loads yet.' },
  'finances.loadsCountSuffix': { ru: '{n} груз(ов)', en: '{n} load(s)' },

  'finances.driver.noCommitted': {
    ru: 'Пока нет подтверждённых грузов — нечего выплачивать.',
    en: 'No committed loads yet — nothing to pay out.',
  },
  'finances.payDue': { ru: 'к выплате', en: 'due' },

  'finances.company.heading': { ru: 'Данные компании для инвойса', en: 'Company details for invoicing' },
  'finances.company.notFilled': { ru: 'не заполнено', en: 'not filled in' },
  'finances.company.info': {
    ru: 'Реквизиты твоей компании, которые печатаются в счёте брокеру. MC/DOT — номер твоей перевозочной авторизации из бумаг FMCSA (тот же, что в договоре с брокером); по нему брокер понимает, кому платит. Remit-to — если работаешь с факторингом, туда пишется их адрес получения платежа (Notice of Assignment). Заполняется один раз.',
    en: 'Your company details, printed on the invoice sent to the broker. MC/DOT is your carrier authority number from FMCSA paperwork (the same one in your broker agreement) — it tells the broker who to pay. Remit-to — if you factor, this is where their payment address (Notice of Assignment) goes. Fill it in once.',
  },

  'finances.ifta.title': { ru: '⛽ IFTA — топливный налог по штатам', en: '⛽ IFTA — per-state fuel tax' },
  'finances.ifta.soon': { ru: 'Скоро', en: 'Soon' },
  'finances.ifta.body': {
    ru: 'Автоматический расчёт квартального топливного налога: мили по каждому штату из GPS-истории траков × ставка штата, минус уплаченное на заправках — готовый отчёт для подачи. В разработке — нужна полная история пробега по штатам. Появится здесь.',
    en: 'Automatic quarterly fuel tax calculation: miles per state from truck GPS history × the state rate, minus tax already paid at the pump — a ready-to-file report. In development — needs full per-state mileage history. It will show up here.',
  },

  // components/invoice-actions.tsx
  'finances.invoiceBox.built': { ru: 'Инвойс {n} собран', en: 'Invoice {n} built' },
  'finances.invoiceBox.marked': { ru: 'Отмечено оплаченным', en: 'Marked paid' },
  'finances.invoiceBox.unmarked': { ru: 'Снята отметка оплаты', en: 'Payment mark removed' },
  'finances.gate.title': { ru: 'Сначала заполни данные своей компании', en: 'Fill in your company details first' },
  'finances.gate.body1': {
    ru: 'Они печатаются в счёте, который уходит брокеру: ',
    en: 'They print on the invoice that goes to the broker: ',
  },
  'finances.gate.companyName': { ru: 'название компании', en: 'company name' },
  'finances.gate.and': { ru: ' и ', en: ' and ' },
  'finances.gate.mcdot': { ru: 'MC/DOT', en: 'MC/DOT' },
  'finances.gate.body2': {
    ru: ' — это номер твоей перевозочной авторизации (из бумаг FMCSA, тот же, что в договоре с брокером). Без них брокеру некуда и некому платить.',
    en: " — your carrier authority number (from FMCSA paperwork, the same one in your broker agreement). Without them the broker has no one and nowhere to pay.",
  },
  'finances.gate.cta': { ru: 'Заполнить данные компании →', en: 'Fill in company details →' },
  'finances.invoiceBox.building': { ru: 'Собираю пакет…', en: 'Building packet…' },
  'finances.invoiceBox.generate': { ru: 'Сгенерировать инвойс + пакет', en: 'Generate invoice + packet' },
  'finances.invoiceBox.open': { ru: 'Открыть пакет', en: 'Open packet' },
  'finances.invoiceBox.paidBadge': { ru: '✓ Оплачено', en: '✓ Paid' },
  'finances.invoiceBox.markPaid': { ru: 'Отметить оплаченным', en: 'Mark paid' },
  'finances.invoiceBox.rebuild': { ru: 'пересобрать', en: 'rebuild' },

  'finances.paidToggle.unmarked': { ru: 'Отметка снята', en: 'Mark removed' },
  'finances.paidToggle.marked': { ru: 'Оплачено', en: 'Paid' },
  'finances.paidToggle.remove': { ru: 'Снять отметку', en: 'Remove mark' },

  // CompanyForm
  'finances.form.name': { ru: 'Название компании', en: 'Company name' },
  'finances.form.owner': { ru: 'Владелец (босс)', en: 'Owner (boss)' },
  'finances.form.mcdot': { ru: 'MC / DOT #', en: 'MC / DOT #' },
  'finances.form.address': { ru: 'Адрес', en: 'Address' },
  'finances.form.phone': { ru: 'Телефон', en: 'Phone' },
  'finances.form.email': { ru: 'Email', en: 'Email' },
  'finances.form.remitTo': {
    ru: 'Кому платить по этому счёту (Remit-To)',
    en: 'Where this invoice gets paid (Remit-To)',
  },
  // Подпись под полем, а не в его названии: строчка «если возит факторинг — их
  // адрес» помещалась, но не объясняла НИЧЕГО тому, кто про факторинг слышит
  // впервые, — а поле при этом решает, кому брокер отправит деньги.
  'finances.form.remitToHint': {
    ru: 'Заполняйте, только если ваши счета выкупает факторинговая компания: впишите её название, адрес и реквизиты — брокер заплатит ей. Работаете без факторинга — оставьте пустым, в счёте встанет адрес вашей компании и брокер заплатит вам напрямую.',
    en: 'Fill this in only if a factoring company buys your invoices: put their name, address and payment details here and the broker pays them. No factoring — leave it blank, the invoice carries your own address and the broker pays you directly.',
  },
  'finances.form.saved': { ru: 'Данные компании сохранены', en: 'Company details saved' },
  'finances.form.save': { ru: 'Сохранить компанию', en: 'Save company' },

  // lib/invoice.ts
  'finances.err.noCompany': {
    ru: 'Сначала заполни данные своей компании: раздел «Оплаты» → блок «Данные компании для инвойса».',
    en: 'First fill in your company details: "Finances" section → "Company details for invoicing" block.',
  },
  'finances.err.noPod': {
    ru: 'Нет POD у этого груза — брокер не заплатит без него. Загрузи POD и повтори.',
    en: "This load has no POD — the broker won't pay without one. Upload the POD and try again.",
  },
} as const
