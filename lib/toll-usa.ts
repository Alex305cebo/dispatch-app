// Справочник платных дорог США — то, что диспетчер держит в голове или ищет заново
// каждый раз, когда груз идёт на восток.
//
// Здесь нет цен конкретных проездов: их считает HERE по маршруту (lib/tolls.ts).
// Здесь другое — правила, из-за которых один и тот же проезд стоит по-разному:
// какой транспондер работает в штате, во сколько раз дороже без него, где стоят
// самые дорогие пункты страны и сколько стоит въехать в Манхэттен.
//
// Данные проверены по официальным источникам в августе 2026-го; у каждой цифры
// ниже стоит ссылка на первоисточник, чтобы её можно было перепроверить, а не
// верить на слово. Тарифы дорог меняются раз в год (PA Turnpike — 4 января),
// поэтому это справка, а не расчёт: считать по ней счёт нельзя.

/** Сеть транспондеров: один тег — много штатов. */
export type TagNetwork = 'ezpass' | 'cusiop' | 'local'

export type TollState = {
  code: string
  /** Название штата по-русски и по-английски — список читают на обоих. */
  ru: string
  en: string
  /** Кто собирает деньги: агентство или несколько. */
  agency: string
  /** Свой транспондер штата, если есть. */
  tag: string | null
  networks: TagNetwork[]
  /** Чем этот штат опасен для расчёта: то, из-за чего ошибаются. */
  note: string
  noteEn: string
}

/**
 * Штаты с платными дорогами, где реально ездит траковый парк.
 *
 * Сеть важнее самого тега: E-ZPass принимают 19 штатов, CUSIOP — центральные, и
 * машина с одним тегом может проехать всё восточное побережье, а на I-35 в Техасе
 * получить счёт по почте.
 */
export const TOLL_STATES: TollState[] = [
  {
    code: 'PA', ru: 'Пенсильвания', en: 'Pennsylvania', agency: 'PA Turnpike', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Без транспондера ровно вдвое дороже: пятиосному сцепу типовой проезд стоит $24.12 по E-ZPass и $48.24 по Toll By Plate (тариф 2026). Плюс 15% надбавки для машин тяжелее 15 000 фунтов.',
    noteEn: 'Exactly double without a transponder: a class-5 rig pays $24.12 on E-ZPass and $48.24 on Toll By Plate (2026 schedule), plus a 15% surcharge above 15,000 lb.',
  },
  {
    code: 'IN', ru: 'Индиана', en: 'Indiana', agency: 'Indiana Toll Road', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Самый дорогой сквозной проезд в стране: пятиосный сцеп во всю длину дороги — около $87 по транспондеру, примерно $0.56 за милю.',
    noteEn: 'The costliest through-run in the country: about $87 end to end for a class-5 rig with a transponder, roughly $0.56 a mile.',
  },
  {
    code: 'IL', ru: 'Иллинойс', en: 'Illinois', agency: 'Illinois Tollway · Chicago Skyway', tag: 'I-PASS',
    networks: ['ezpass'],
    note: 'Chicago Skyway — самый дорогой одиночный пункт Среднего Запада: пятиосному около $45 в пик, и цена растёт каждый год по концессионному договору. I-PASS и E-ZPass взаимозаменяемы.',
    noteEn: 'The Chicago Skyway is the priciest single toll point in the Midwest — about $45 peak for a class-5 rig, rising every year under its concession. I-PASS and E-ZPass are interchangeable.',
  },
  {
    code: 'OH', ru: 'Огайо', en: 'Ohio', agency: 'Ohio Turnpike', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Около $0.24 за милю пятиосному — вдвое дешевле соседней Индианы. На связке I-80/I-90 это и решает, где ехать.',
    noteEn: 'About $0.24 a mile for a class-5 rig — half of neighbouring Indiana, which is what decides the I-80/I-90 routing.',
  },
  {
    code: 'NY', ru: 'Нью-Йорк', en: 'New York', agency: 'NYS Thruway · MTA · Port Authority', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Три разных сборщика: платная дорога, мосты и тоннели MTA и переправы Port Authority. Отдельно — зона въезда в Манхэттен ниже 60-й улицы, она считается по въездам, а не по милям.',
    noteEn: 'Three separate collectors: the Thruway, MTA bridges and tunnels, and Port Authority crossings. Manhattan below 60th Street is charged per entry, not per mile.',
  },
  {
    code: 'NJ', ru: 'Нью-Джерси', en: 'New Jersey', agency: 'NJ Turnpike · Garden State Parkway', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Тариф зависит от класса и времени суток: ночью дешевле. Проезд в Нью-Йорк через мосты Port Authority оплачивается отдельно и только в одну сторону — на восток.',
    noteEn: 'Rates vary by class and time of day, cheaper overnight. Port Authority crossings into New York are billed separately and only eastbound.',
  },
  {
    code: 'MD', ru: 'Мэриленд', en: 'Maryland', agency: 'MDTA', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Мосты и тоннели вокруг Балтимора; для грузовиков есть отдельные тарифные классы по осям.',
    noteEn: 'Bridges and tunnels around Baltimore, with separate truck classes by axle count.',
  },
  {
    code: 'DE', ru: 'Делавэр', en: 'Delaware', agency: 'DelDOT', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Короткий участок I-95, но один из самых дорогих в пересчёте на милю для тяжёлых.',
    noteEn: 'A short stretch of I-95, yet one of the priciest per mile for heavy vehicles.',
  },
  {
    code: 'MA', ru: 'Массачусетс', en: 'Massachusetts', agency: 'MassDOT', tag: 'E-ZPass MA',
    networks: ['ezpass'],
    note: 'Полностью безостановочный сбор: рамок нет, без транспондера счёт приходит по почте с надбавкой.',
    noteEn: 'All-electronic: no booths, and without a transponder the bill arrives by mail with a surcharge.',
  },
  {
    code: 'ME', ru: 'Мэн', en: 'Maine', agency: 'Maine Turnpike', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Действует своя сетка для коммерческих; E-ZPass любого штата принимается.',
    noteEn: 'Its own commercial rate table; any state’s E-ZPass is accepted.',
  },
  {
    code: 'NH', ru: 'Нью-Гэмпшир', en: 'New Hampshire', agency: 'NH Turnpike', tag: 'E-ZPass',
    networks: ['ezpass'], note: 'Небольшие суммы, но пункты стоят прямо на I-95 и I-93.',
    noteEn: 'Small amounts, but the plazas sit right on I-95 and I-93.',
  },
  {
    code: 'RI', ru: 'Род-Айленд', en: 'Rhode Island', agency: 'RIDOT', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Сбор только с грузовиков — легковые не платят вовсе; рамки на I-95 и мостах.',
    noteEn: 'Trucks only — cars pay nothing; gantries on I-95 and the bridges.',
  },
  {
    code: 'VA', ru: 'Вирджиния', en: 'Virginia', agency: 'VDOT · Elizabeth River · Dulles', tag: 'E-ZPass',
    networks: ['ezpass'],
    note: 'Много разных операторов и экспресс-полос; часть полос грузовикам запрещена, а не просто платная.',
    noteEn: 'Many operators and express lanes; some lanes are closed to trucks outright, not merely tolled.',
  },
  {
    code: 'WV', ru: 'Западная Вирджиния', en: 'West Virginia', agency: 'WV Parkways', tag: 'E-ZPass',
    networks: ['ezpass'], note: 'I-77/I-64 — три пункта подряд, каждый со своим тарифом для тяжёлых.',
    noteEn: 'I-77/I-64 — three plazas in a row, each with its own heavy-vehicle rate.',
  },
  {
    code: 'KY', ru: 'Кентукки', en: 'Kentucky', agency: 'RiverLink', tag: 'E-ZPass',
    networks: ['ezpass'], note: 'Мосты через Огайо в Луисвилле; без транспондера счёт по номеру дороже.',
    noteEn: 'The Ohio River bridges at Louisville; plate billing costs more than a transponder.',
  },
  {
    code: 'NC', ru: 'Северная Каролина', en: 'North Carolina', agency: 'NCTA', tag: 'NC Quick Pass',
    networks: ['ezpass', 'cusiop'], note: 'Quick Pass работает и в сети E-ZPass, и в центральной сети.',
    noteEn: 'Quick Pass works on both the E-ZPass and the central networks.',
  },
  {
    code: 'FL', ru: 'Флорида', en: 'Florida', agency: "Florida's Turnpike · CFX", tag: 'SunPass',
    networks: ['ezpass', 'cusiop'],
    note: 'С 2021 года все платные дороги Флориды принимают E-ZPass. SunPass PRO — самое широкое покрытие одним тегом: обе сети сразу.',
    noteEn: 'Since 2021 every Florida toll road accepts E-ZPass. SunPass PRO has the widest single-tag coverage: both networks at once.',
  },
  {
    code: 'GA', ru: 'Джорджия', en: 'Georgia', agency: 'SRTA', tag: 'Peach Pass',
    networks: ['cusiop'], note: 'Экспресс-полосы вокруг Атланты; грузовикам они по большей части закрыты.',
    noteEn: 'Express lanes around Atlanta, mostly closed to trucks.',
  },
  {
    code: 'TX', ru: 'Техас', en: 'Texas', agency: 'TxDOT · NTTA · HCTRA', tag: 'TxTag · EZ TAG · TollTag',
    networks: ['cusiop'],
    note: 'E-ZPass здесь не работает. Три техасских тега взаимозаменяемы между собой и действуют в центральной сети — Оклахома, Канзас, Колорадо, Флорида.',
    noteEn: 'E-ZPass does not work here. The three Texas tags are interchangeable and valid across the central network — Oklahoma, Kansas, Colorado, Florida.',
  },
  {
    code: 'OK', ru: 'Оклахома', en: 'Oklahoma', agency: 'OTA', tag: 'PikePass',
    networks: ['cusiop'], note: 'Техасские теги принимаются по местному тарифу PikePass.',
    noteEn: 'Texas tags are accepted at local PikePass rates.',
  },
  {
    code: 'KS', ru: 'Канзас', en: 'Kansas', agency: 'KTA', tag: 'K-TAG',
    networks: ['cusiop'], note: 'I-35 через весь штат; вход в центральную сеть.',
    noteEn: 'I-35 the length of the state; part of the central network.',
  },
  {
    code: 'CO', ru: 'Колорадо', en: 'Colorado', agency: 'CDOT · E-470', tag: 'ExpressToll',
    networks: ['ezpass', 'cusiop'], note: 'E-470 вокруг Денвера — платная целиком, объезд по I-25/I-70 бесплатный.',
    noteEn: 'E-470 around Denver is tolled end to end; the I-25/I-70 way around is free.',
  },
  {
    code: 'CA', ru: 'Калифорния', en: 'California', agency: 'Bay Area · OCTA · FasTrak', tag: 'FasTrak',
    networks: ['local'],
    note: 'Своя сеть, ни с чем не совместимая. Мосты залива платные только в одну сторону — на запад.',
    noteEn: 'Its own network, compatible with nothing else. Bay bridges are tolled westbound only.',
  },
  {
    code: 'WA', ru: 'Вашингтон', en: 'Washington', agency: 'WSDOT', tag: 'Good To Go!',
    networks: ['local'], note: 'SR-520 и SR-99; грузовикам часть тоннелей закрыта по габаритам.',
    noteEn: 'SR-520 and SR-99; some tunnels are closed to trucks on dimensions.',
  },
]

/** Самые дорогие места страны — те, что решают судьбу рейса, а не мелочь по пути. */
export const TOLL_HOTSPOTS: {
  name: string
  state: string
  ru: string
  en: string
  amount: string
}[] = [
  {
    name: 'Indiana Toll Road (I-80/I-90)', state: 'IN', amount: '≈ $87',
    ru: 'Сквозной проезд по всей длине, пятиосный сцеп с транспондером. Около $0.56 за милю.',
    en: 'End to end for a class-5 rig with a transponder — about $0.56 a mile.',
  },
  {
    name: 'Chicago Skyway', state: 'IL', amount: '≈ $45',
    ru: 'Самый дорогой одиночный пункт Среднего Запада. Частная концессия, тариф растёт каждый год.',
    en: 'The priciest single toll point in the Midwest. A private concession with a yearly escalation.',
  },
  {
    name: 'PA Turnpike', state: 'PA', amount: '$24 / $48',
    ru: 'Типовой проезд пятиосного: слева по E-ZPass, справа — по счёту на номер. Разница ровно вдвое.',
    en: 'A typical class-5 run: E-ZPass on the left, plate billing on the right. Exactly double.',
  },
  {
    name: 'Манхэттен ниже 60-й · Manhattan below 60th', state: 'NY', amount: '$21.60 / $5.40',
    ru: 'Платится за КАЖДЫЙ въезд, дневного потолка для грузовиков нет. Ночью, с 21:00 до 5:00, дешевле на 75%.',
    en: 'Charged on EVERY entry, with no daily cap for trucks. Overnight, 9pm–5am, it drops by 75%.',
  },
]

/** Въезд в зону Манхэттена: тариф зависит от размера машины и часа. */
export const NYC_ZONE = {
  /** Одиночный грузовик (single-unit). */
  small: { peak: 14.4, night: 3.6 },
  /** Сцеп (multi-unit) — наш случай. */
  large: { peak: 21.6, night: 5.4 },
  /** Ночной тариф действует с 21:00 до 5:00 в будни. */
  nightFrom: 21,
  nightTo: 5,
}

/** Сколько стоит N въездов в зону: у грузовиков платится каждый, потолка нет. */
export function nycZoneCost(entries: number, kind: 'small' | 'large', night: boolean): number {
  const rate = NYC_ZONE[kind][night ? 'night' : 'peak']
  // Округление до цента: 3 × 21.6 в двоичной арифметике даёт 64.80000000000001,
  // и такая цифра в смете выглядит поломкой, а не суммой.
  return Math.max(0, Math.round(Math.round(entries) * rate * 100) / 100)
}

/**
 * Во сколько раз проезд без транспондера дороже.
 *
 * Точную цифру мы знаем только там, где агентство публикует обе сетки рядом:
 * PA Turnpike — ровно вдвое. В остальных штатах надбавка есть почти везде, но её
 * размер зависит от дороги, и выдумывать множитель нельзя: счёт по нему стал бы
 * враньём. Поэтому null означает «дороже, но насколько — смотри у агентства».
 */
export const PLATE_MULTIPLIER: Record<string, number | null> = {
  PA: 2,
}

/** Программы для парков: единый счёт, скидки за объём, свои транспондеры. */
export const TOLL_PROGRAMS: { name: string; ru: string; en: string }[] = [
  {
    name: 'Bestpass (Fleetworthy)',
    ru: 'Вступительного взноса нет, есть месячная плата за машину. Даёт две скидки сразу: за электронную оплату и за объём группы. У владельцев-операторов экономия в среднем около 20%.',
    en: 'No joining fee, a monthly per-truck charge. Two discounts at once — electronic payment and group volume. Owner-operators save about 20% on average.',
  },
  {
    name: 'PrePass',
    ru: 'Толлы плюс обход весовых. Отдельный счёт и разбор спорных списаний — а спорные бывают у всех, кто ездит по безостановочным дорогам.',
    en: 'Tolls plus weigh-station bypass. A single account with dispute handling — and disputes happen to everyone running all-electronic roads.',
  },
]

/**
 * Штраф за неоплаченный проезд.
 *
 * Считается не «толл плюс немного»: административный сбор доходит до $100 ЗА ОДИН
 * проезд и никак не связан с его ценой. Проехать без транспондера три рамки на
 * $12 и получить счёт на триста — обычное дело, поэтому цифра тут и стоит.
 */
export const VIOLATION_FEE_CAP = 100
