// The Overview dashboard: app/page.tsx.

export const overviewDict = {
  'overview.title': { ru: 'Обзор', en: 'Overview' },
  'overview.truckCount': { ru: '{n} трак(ов) — что парк заработал и что везёт сейчас.', en: '{n} truck(s) — what the fleet earned and what it is hauling right now.' },
  'overview.addLoad': { ru: 'Груз', en: 'Load' },
  'overview.addLoadInfo': {
    ru: 'Добавить груз вручную. Выберешь трак, введёшь ставку и мили — приложение сразу посчитает, что груз оставит на траке чистыми.',
    en: "Add a load manually. Pick a truck, enter the rate and miles — the app immediately calculates what the load nets the truck.",
  },

  'overview.docDeadlines': { ru: 'Сроки документов', en: 'Document deadlines' },
  'overview.docDeadlinesInfo': {
    ru: 'Регистрация, инспекция, страховка трака и CDL/медкарта водителя. Даты вносятся в паспорте трака (вкладка Обслуживание). Подсвечиваем за 60 дней (жёлтый) и 30 дней (красный), чтобы трак не встал out-of-service.',
    en: "Registration, inspection, truck insurance, and driver CDL/medical card. Dates are entered on the truck's page (Maintenance tab). Highlighted at 60 days (yellow) and 30 days (red) out, so a truck never ends up out-of-service.",
  },
  'overview.overdue': { ru: 'просрочено', en: 'overdue' },
  'overview.daysLeft': { ru: '{n} дн.', en: '{n}d' },

  'overview.brokerUnread': { ru: '⚠ Важное от брокера — не прочитано', en: '⚠ Important from broker — unread' },
  'overview.brokerUnreadInfo': {
    ru: 'Особые инструкции брокера (detention, аппойнтмент, требования к POD и т.д.), распознанные из rate con, которые ещё никто не отметил прочитанными на странице груза.',
    en: "Special broker instructions (detention, appointment, POD requirements, etc) recognized from the rate con, that no one has marked read yet on the load's page.",
  },

  'overview.awaitingPayment': { ru: 'Ждём оплаты', en: 'Awaiting payment' },
  'overview.awaitingPaymentInfo': {
    ru: 'Выставленные, но ещё не оплаченные счета, плюс доставленные грузы без выставленного счёта — то же, что «Не оплачено» на странице Финансы, одной цифрой.',
    en: 'Invoiced but not yet paid, plus delivered loads with no invoice yet — the same figure as "Unpaid" on the Finances page, as one number.',
  },
  'overview.ofWhichOverdue': { ru: 'из них просрочено', en: 'of which overdue' },

  'overview.rateTotal': { ru: 'Рейт всего', en: 'Total rate' },
  'overview.rateTotalSub': { ru: 'чистыми {v}', en: 'net {v}' },
  'overview.rateTotalInfo': {
    ru: 'Полная ставка за все активные грузы (гросс) — самое важное: сколько всего работы взято. Снизу «чистыми» — что останется после всех расходов (топливо, водитель, фикс, обслуживание, факторинг), это доп. информация.',
    en: 'The full rate across all active loads (gross) — the key figure: how much work is booked in total. "Net" below is what remains after all costs (fuel, driver pay, fixed costs, maintenance, factoring) — extra context.',
  },
  // Just the acronym: the tile is a quarter of the grid and the long form was being
  // truncated to "RPM · REVENUE ...". The (i) tooltip beside it carries the meaning.
  'overview.rpm': { ru: 'RPM', en: 'RPM' },
  'overview.rpmInfo': {
    ru: 'RPM (rate per mile) — средний доход на милю по всему парку: общая выручка ÷ общие мили (гружёные + порожние). Главный ориентир, брать груз или нет.',
    en: 'RPM (rate per mile) — average revenue per mile across the whole fleet: total revenue ÷ total miles (loaded + empty). The main yardstick for whether to take a load.',
  },
  'overview.inWork': { ru: 'В работе', en: 'In progress' },
  'overview.inWorkSub': { ru: '{n} свободно', en: '{n} free' },
  'overview.inWorkInfo': {
    ru: 'Сколько грузов сейчас в статусе «забронирован» или «в пути». Снизу — сколько траков сейчас без активного груза и готовы взять новый.',
    en: 'How many loads are currently "booked" or "in transit". Below — how many trucks have no active load right now and are ready to take one.',
  },
  'overview.totalMiles': { ru: 'Всего миль', en: 'Total miles' },
  'overview.totalMilesInfo': {
    ru: 'Суммарные мили всех активных грузов — гружёные плюс порожние (deadhead).',
    en: 'Total miles across all active loads — loaded plus empty (deadhead).',
  },

  'overview.fleetHeading': { ru: 'Парк', en: 'Fleet' },
  'overview.fleetInfo': {
    ru: 'Все траки с живыми данными: где сейчас трак и сколько он заработал за неделю. Кружок слева — статус движения по GPS: зелёный едет, синий on-duty, серый стоит. Нажми на трак — вся его карточка.',
    en: "Every truck with live data: where it is now and what it earned this week. The dot on the left is GPS movement status: green is driving, blue is on-duty, gray is stopped. Click a truck for its full card.",
  },
  'overview.trackingLink': { ru: 'Трекинг →', en: 'Tracking →' },
  'overview.repair': { ru: '🔧 ремонт', en: '🔧 repair' },
  'overview.onVacation': { ru: '🌴 отпуск', en: '🌴 vacation' },
  'overview.trailer': { ru: 'Трейлер {n} · ', en: 'Trailer {n} · ' },
  'overview.noEldData': { ru: 'Нет данных с ELD', en: 'No data from ELD' },
  'overview.perWeek': { ru: 'за неделю', en: 'per week' },
  'overview.perWeekInfo': {
    ru: 'Ставки (гросс) активных грузов этого трака за текущую календарную неделю — с понедельника.',
    en: "This truck's gross rate from active loads for the current calendar week — since Monday.",
  },
  'overview.toDelivery': { ru: 'До выгрузки · ', en: 'To delivery · ' },

  'overview.recentLoads': { ru: 'Последние грузы', en: 'Recent loads' },
  'overview.net': { ru: 'чистыми', en: 'net' },

  'overview.noLoadsYet': { ru: 'Грузов пока нет', en: 'No loads yet' },
  'overview.noLoadsBody': {
    ru: 'Добавь груз вручную, загрузи Rate con или сними QR-код с DAT камерой айфона — аналитика посчитается сама.',
    en: "Add a load manually, upload a rate con, or scan a DAT QR code with an iPhone camera — the analytics calculate themselves.",
  },
  'overview.rateCon': { ru: 'Rate con', en: 'Rate con' },

  'overview.driveDot.noEld': { ru: 'Нет данных с ELD', en: 'No data from ELD' },
  'overview.driveDot.moving': { ru: 'В движении', en: 'Moving' },
  'overview.driveDot.onDuty': { ru: 'На месте (on duty)', en: 'Stopped (on duty)' },
  'overview.driveDot.stopped': { ru: 'Стоит', en: 'Stopped' },
} as const
