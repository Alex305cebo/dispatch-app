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

  'brokers.verdictClean': { ru: '✓ Красных флагов нет — можно работать', en: '✓ No red flags — clear to work' },
  'brokers.verdictFlags': { ru: 'Есть на что обратить внимание:', en: 'Points to watch:' },

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
  'brokers.noMc': { ru: 'без MC', en: 'no MC' },
  'brokers.recheck': { ru: 'Проверить', en: 'Check' },

  // ── Largest brokers starter list ────────────────────────────
  'brokers.topHeading': { ru: 'Крупнейшие брокеры США', en: 'Largest US brokers' },
  'brokers.topInfo': {
    ru: 'Справочный список для ориентира. Когда такой брокер попадётся в Rate Con, он проверится по своему MC и добавится в «Наши брокеры».',
    en: 'A reference list. When one of these shows up on a Rate Con it gets checked by its MC and added to "Our brokers".',
  },
} as const
