// The dedicated Brokers section: our broker database, the FMCSA check form with its
// step-by-step checklist, and the largest-US-brokers starter list.

export const brokersDict = {
  'brokers.pageTitle': { ru: 'Брокеры', en: 'Brokers' },
  'brokers.pageSubtitle': {
    ru: 'База брокеров, с кем мы работали, и проверка FMCSA по MC / DOT.',
    en: 'Database of brokers we have worked with, plus FMCSA vetting by MC / DOT.',
  },

  // ── Check form ──────────────────────────────────────────────
  'brokers.checkHeading': { ru: 'Проверить брокера', en: 'Check a broker' },
  'brokers.checkInfo': {
    ru: 'Официальная проверка в базе FMCSA: активны ли полномочия брокера, есть ли страховой бонд, возраст MC. Работает по MC или DOT номеру.',
    en: 'Official FMCSA lookup: is the broker authority active, is a surety bond on file, how old is the MC. Works by MC or DOT number.',
  },
  'brokers.byMc': { ru: 'по MC', en: 'by MC' },
  'brokers.byDot': { ru: 'по DOT', en: 'by DOT' },
  'brokers.mcPlaceholder': { ru: 'MC номер, напр. 123456', en: 'MC number, e.g. 123456' },
  'brokers.dotPlaceholder': { ru: 'DOT номер, напр. 1234567', en: 'DOT number, e.g. 1234567' },
  'brokers.checkButton': { ru: 'Проверить', en: 'Check' },
  'brokers.checking': { ru: 'Проверяю…', en: 'Checking…' },
  'brokers.noKey': {
    ru: 'Проверка выключена — нужен бесплатный ключ FMCSA. Заведи его на mobile.fmcsa.dot.gov (через Login.gov) и добавь в переменную окружения FMCSA_WEBKEY. После этого проверка заработает сразу.',
    en: 'Checks are off — a free FMCSA key is needed. Get one at mobile.fmcsa.dot.gov (via Login.gov) and set it as the FMCSA_WEBKEY env var. Checks turn on immediately after.',
  },
  'brokers.cachedNote': { ru: 'из кэша · проверено {date}', en: 'from cache · checked {date}' },

  // ── Step-by-step checklist ──────────────────────────────────
  'brokers.stepFound': { ru: 'Найден в базе FMCSA', en: 'Found in the FMCSA database' },
  'brokers.stepAuthority': { ru: 'Полномочия брокера (authority)', en: 'Broker operating authority' },
  'brokers.stepBond': { ru: 'Страховой бонд BMC-84', en: 'BMC-84 surety bond' },
  'brokers.stepAge': { ru: 'Возраст MC', en: 'MC age' },
  'brokers.stepName': { ru: 'Юр. название', en: 'Legal name' },
  'brokers.stepPhone': { ru: 'Телефон', en: 'Phone' },

  'brokers.statusActive': { ru: 'активна', en: 'active' },
  'brokers.statusInactive': { ru: 'НЕ активна', en: 'NOT active' },
  'brokers.statusNone': { ru: 'нет полномочий', en: 'no authority' },
  'brokers.statusUnknown': { ru: 'неизвестно', en: 'unknown' },
  'brokers.bondYes': { ru: 'есть', en: 'on file' },
  'brokers.bondNo': { ru: 'НЕТ', en: 'NONE' },
  'brokers.bondUnknown': { ru: 'неизвестно', en: 'unknown' },
  'brokers.ageMonths': { ru: '{months} мес.', en: '{months} mo.' },
  'brokers.ageUnknown': { ru: 'дата неизвестна', en: 'date unknown' },

  // Платёжная дисциплина брокера публично не раздаётся — только платные базы,
  // поэтому здесь ссылки, а не цифра.
  'brokers.payHistory': { ru: 'Платит вовремя? Проверить:', en: 'Pays on time? Check:' },
  'brokers.verdictClean': { ru: '✓ Красных флагов нет — можно работать', en: '✓ No red flags — clear to work' },
  'brokers.detailsToggle': { ru: 'Все проверки ({n})', en: 'All checks ({n})' },
  'brokers.verdictFlags': { ru: 'Есть на что обратить внимание:', en: 'Points to watch:' },

  // ── Full checklist: section headers ─────────────────────────
  'brokers.secAuthority': { ru: 'Полномочия и статус', en: 'Authority & status' },
  'brokers.secInsurance': { ru: 'Страховка и бонд', en: 'Insurance & bond' },
  'brokers.secIdentity': { ru: 'Идентификация', en: 'Identity' },
  'brokers.secSafety': { ru: 'Безопасность и парк', en: 'Safety & fleet' },

  // ── Full checklist: rows ────────────────────────────────────
  'brokers.rowOperating': { ru: 'Статус работы', en: 'Operating status' },
  'brokers.rowBrokerAuth': { ru: 'Полномочия брокера', en: 'Broker authority' },
  'brokers.rowCommonAuth': { ru: 'Common carrier authority', en: 'Common carrier authority' },
  'brokers.rowContractAuth': { ru: 'Contract authority', en: 'Contract authority' },
  'brokers.rowOos': { ru: 'Out of service', en: 'Out of service' },
  'brokers.rowBond': { ru: 'Бонд BMC-84', en: 'BMC-84 bond' },
  'brokers.rowCargo': { ru: 'Груз. страховка', en: 'Cargo insurance' },
  'brokers.rowBipd': { ru: 'Страховка BIPD', en: 'BIPD insurance' },
  'brokers.rowDot': { ru: 'DOT номер', en: 'DOT number' },
  'brokers.rowEin': { ru: 'EIN (налоговый ID)', en: 'EIN (Tax ID)' },
  'brokers.rowDba': { ru: 'Работает как (DBA)', en: 'Doing business as' },
  'brokers.rowOperation': { ru: 'Тип операций', en: 'Operation' },
  'brokers.rowMcs150': { ru: 'MCS-150 актуальна', en: 'MCS-150 current' },
  'brokers.rowSafetyRating': { ru: 'Safety rating', en: 'Safety rating' },
  'brokers.rowPowerUnits': { ru: 'Траков (power units)', en: 'Power units' },
  'brokers.rowDrivers': { ru: 'Водителей', en: 'Drivers' },
  'brokers.rowCrashes': { ru: 'Аварии (всего)', en: 'Crashes (total)' },
  'brokers.rowVehicleOos': { ru: 'OOS траков', en: 'Vehicle OOS rate' },
  'brokers.rowDriverOos': { ru: 'OOS водителей', en: 'Driver OOS rate' },

  // ── Full checklist: values ──────────────────────────────────
  'brokers.valYes': { ru: 'да', en: 'Yes' },
  'brokers.valNo': { ru: 'нет', en: 'No' },
  'brokers.onFile': { ru: 'на файле', en: 'on file' },
  'brokers.bondMissing': { ru: 'требуется, но НЕТ', en: 'required, NONE' },
  'brokers.notRequired': { ru: 'не требуется', en: 'not required' },
  'brokers.notRated': { ru: 'не оценён', en: 'not rated' },
  'brokers.vsNational': { ru: 'нац. среднее {n}%', en: "nat'l avg {n}%" },
  'brokers.na': { ru: '—', en: '—' },

  // ── Section explanations (i) ────────────────────────────────
  'brokers.secAuthorityInfo': {
    ru: 'Есть ли у брокера законное право работать (лицензия FMCSA). Если полномочия не активны или брокер out of service — с ним работать нельзя.',
    en: 'Whether the broker is legally authorized to operate (FMCSA license). If authority is inactive or the broker is out of service, do not work with them.',
  },
  'brokers.secInsuranceInfo': {
    ru: 'Финансовая защита. Бонд BMC-84 ($75,000) — гарантия: если брокер не заплатит перевозчику, деньги требуют с бонда. Без бонда работать рискованно.',
    en: 'Financial protection. The BMC-84 bond ($75,000) guarantees payment: if the broker fails to pay the carrier, the claim goes against the bond. No bond means high risk.',
  },
  'brokers.secIdentityInfo': {
    ru: 'Официальные идентификаторы компании в FMCSA — по ним проверяют, что брокер реальный и это именно та компания, что в Rate Con.',
    en: "The company's official FMCSA identifiers — used to confirm the broker is real and matches the company on the Rate Con.",
  },
  'brokers.secSafetyInfo': {
    ru: 'Показатели безопасности парка. У чистого брокера траков нет, поэтому здесь обычно нули — это нормально. Важно для перевозчиков.',
    en: 'Fleet safety metrics. A pure broker has no trucks, so these are usually zero — that is normal. Relevant for carriers.',
  },

  // ── Field explanations (i) ──────────────────────────────────
  'brokers.rowDotInfo': { ru: 'Уникальный номер компании в US DOT — главный идентификатор в системе FMCSA.', en: 'The company USDOT number — its primary identifier in the FMCSA system.' },
  'brokers.rowEinInfo': { ru: 'Федеральный налоговый номер компании (аналог ИНН). Есть у реальной зарегистрированной фирмы.', en: 'The federal tax ID of the company. A real registered business has one.' },
  'brokers.rowOperationInfo': { ru: 'Interstate — перевозки между штатами, Intrastate — внутри одного штата.', en: 'Interstate — hauls across state lines; Intrastate — within a single state.' },
  'brokers.rowSafetyRatingInfo': {
    ru: 'Оценка FMCSA после выездной проверки: Satisfactory (хорошо), Conditional (условно), Unsatisfactory (плохо). «Не оценён» — проверки не было, для брокера без траков это норма.',
    en: 'FMCSA rating after an audit: Satisfactory, Conditional, or Unsatisfactory. "Not rated" means no audit — normal for a broker with no trucks.',
  },
  'brokers.rowVehicleOosInfo': {
    ru: 'Как часто траки снимали с рейса на дорожных проверках из-за неисправностей. Чем ниже нац. среднего — тем лучше.',
    en: 'How often trucks were pulled out of service at roadside inspections for defects. Lower than the national average is better.',
  },
  'brokers.rowDriverOosInfo': {
    ru: 'Как часто водителей отстраняли на проверках (часы, документы, состояние). Чем ниже нац. среднего — тем лучше.',
    en: 'How often drivers were placed out of service at inspections (hours, paperwork, condition). Lower than the national average is better.',
  },
  'brokers.rowBondInfo': { ru: 'Бонд BMC-84 на $75,000 — обязательная страховка брокера. Если её нет, работать нельзя.', en: 'The BMC-84 bond of $75,000 — a broker’s mandatory surety. Without it, do not work with them.' },
  'brokers.rowBrokerAuthInfo': { ru: 'Право работать брокером. Должно быть «активна».', en: 'The right to operate as a broker. Must be "active".' },
  'brokers.rowCarrierAuthInfo': { ru: 'Право быть перевозчиком (не брокером). У чистого брокера обычно «не активна» — это нормально.', en: 'Authority to operate as a carrier (not a broker). Usually "inactive" for a pure broker — that is normal.' },
  'brokers.rowOosInfo': { ru: 'Прямой запрет FMCSA на работу. Должно быть «нет».', en: 'An outright FMCSA ban on operating. Must be "No".' },
  'brokers.rowMcs150Info': { ru: 'Компании обязаны обновлять данные в FMCSA каждые 2 года. «Да» — регистрация актуальна, фирма живая.', en: 'Companies must refresh their FMCSA filing every 2 years. "Yes" means the registration is current and the firm is active.' },

  // ── Safety meter ────────────────────────────────────────────
  'brokers.safetyHeading': { ru: 'Насколько безопасно', en: 'How safe' },
  'brokers.safetyInfo': {
    ru: 'Общая оценка надёжности брокера по данным FMCSA: полномочия, бонд, out-of-service, актуальность регистрации и показатели безопасности. 100 — идеально, ниже 45 — рискованно.',
    en: 'Overall broker reliability from FMCSA data: authority, bond, out-of-service, registration currency and safety metrics. 100 is perfect; below 45 is risky.',
  },
  'brokers.safe': { ru: 'Надёжно', en: 'Safe' },
  'brokers.caution': { ru: 'Осторожно', en: 'Caution' },
  'brokers.risky': { ru: 'Рискованно', en: 'Risky' },

  // ── Our broker database ─────────────────────────────────────
  'brokers.dbHeading': { ru: 'Наши брокеры', en: 'Our brokers' },
  'brokers.dbInfo': {
    ru: 'Все брокеры из ваших грузов — имя, MC, телефон, email, сколько грузов и когда последний. Растёт сама из каждого импортированного Rate Con.',
    en: 'Every broker from your loads — name, MC, phone, email, load count and last load. Grows on its own from each imported Rate Con.',
  },
  'brokers.searchPlaceholder': { ru: 'Поиск по MC, названию или телефону', en: 'Search by MC, name or phone' },
  'brokers.empty': {
    ru: 'Пока нет брокеров — они появятся здесь из ваших Rate Con.',
    en: 'No brokers yet — they will appear here from your Rate Cons.',
  },
  'brokers.noMatch': { ru: 'Ничего не найдено.', en: 'Nothing found.' },
  'brokers.loadsCount': { ru: 'грузов: {n}', en: 'loads: {n}' },
  'brokers.lastLoad': { ru: 'последний {date}', en: 'last {date}' },
  'brokers.gross': { ru: 'привёз {sum}', en: 'gross {sum}' },
  'brokers.rpm': { ru: '{v}/миля', en: '{v}/mi' },
  'brokers.paysIn': { ru: 'платит за {n} дн.', en: 'pays in {n} d.' },
  'brokers.owes': { ru: 'должен {sum}', en: 'owes {sum}' },
  'brokers.moneyInfo': {
    ru: 'Считается по своим рейсам: ставка за милю — весь гросс на все мили, дни оплаты — фактический срок от счёта до денег. Обещанный в рейт-коне срок тут не участвует.',
    en: 'From our own loads: rate per mile is total gross over total miles, pay days is the real gap between invoice and money. The term promised on the rate con is not used here.',
  },
  'brokers.mcWorking': { ru: 'подбираю MC…', en: 'finding MC numbers…' },
  'brokers.mcNoKey': { ru: 'MC не подбираются: нужен ключ FMCSA →', en: 'MC lookup off: an FMCSA key is needed →' },
  'brokers.factsRetry': { ru: 'Повторить', en: 'Retry' },
  'brokers.factsLoading': { ru: 'Смотрю в реестре FMCSA…', en: 'Looking it up in FMCSA…' },
  'brokers.factsFailed': { ru: 'Реестр не ответил.', en: 'The registry did not answer.' },
  'brokers.factsNoKey': { ru: 'Нужен ключ FMCSA — Админ → Ключи.', en: 'An FMCSA key is required — Admin → Keys.' },
  'brokers.factsAuthority': { ru: 'Authority', en: 'Authority' },
  'brokers.factsCity': { ru: 'Город', en: 'City' },
  'brokers.reps': { ru: 'представители брокера: {n}', en: 'broker contacts: {n}' },
  'brokers.repLoads': { ru: 'грузов {n}', en: '{n} loads' },
  'brokers.markPaid': { ru: 'Оплачен', en: 'Paid' },
  'brokers.paidDone': { ru: 'Отмечено оплаченным.', en: 'Marked as paid.' },
  'brokers.waitingDays': { ru: 'ждём {n} дн.', en: 'waiting {n} d.' },
  'brokers.edit': { ru: 'Изменить', en: 'Edit' },
  'brokers.editClose': { ru: 'Свернуть', en: 'Close' },
  'brokers.editName': { ru: 'Название', en: 'Name' },
  'brokers.editMc': { ru: 'MC номер', en: 'MC number' },
  'brokers.editPhone': { ru: 'Телефон', en: 'Phone' },
  'brokers.editEmail': { ru: 'Почта для счетов', en: 'Billing email' },
  'brokers.editSave': { ru: 'Сохранить', en: 'Save' },
  'brokers.editSaving': { ru: 'Сохраняю…', en: 'Saving…' },
  'brokers.editCancel': { ru: 'Отмена', en: 'Cancel' },
  'brokers.editScope': { ru: 'изменится во всех его грузах ({n})', en: 'applies to all their loads ({n})' },
  'brokers.editSaved': { ru: 'Сохранено. Обновлено грузов: {n}.', en: 'Saved. Loads updated: {n}.' },
  'brokers.editNoTarget': { ru: 'Непонятно, какого брокера править: нет ни MC, ни названия.', en: 'Nothing identifies this broker: no MC and no name.' },
  'brokers.editOwnMc': { ru: 'Это MC нашей компании, а не брокера. В рейт-коне их два — нужен номер брокера.', en: 'That is our own MC, not the broker’s. A rate con prints two — use the broker’s.' },
  'brokers.editBadEmail': { ru: 'Почта написана с ошибкой.', en: 'That email address is malformed.' },
  'brokers.mcNotFound': { ru: 'У этой компании в FMCSA нет номера MC — только DOT.', en: 'FMCSA lists no MC for that company — only a DOT.' },
  'brokers.noMc': { ru: 'без MC', en: 'no MC' },
  'brokers.payVia': { ru: 'платит через {name}', en: 'pays via {name}' },
  'brokers.recheck': { ru: 'Проверить', en: 'Check' },

  // ── Largest brokers starter list ────────────────────────────
  'brokers.close': { ru: 'Закрыть', en: 'Close' },
  'brokers.topHeading': { ru: 'Крупнейшие брокеры США', en: 'Largest US brokers' },
  'brokers.topInfo': {
    ru: 'Справочный список для ориентира. Когда такой брокер попадётся в Rate Con, он проверится по своему MC и добавится в «Наши брокеры».',
    en: 'A reference list. When one of these shows up on a Rate Con it gets checked by its MC and added to "Our brokers".',
  },
} as const
