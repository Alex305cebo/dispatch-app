// A curated starter list of the biggest US freight brokers, by name only — NO MC
// numbers baked in, because a wrong MC on a known broker is worse than none. When
// FMCSA_WEBKEY is set, a name lookup can resolve the real MC/DOT and cache it.
//
// Each carries a short history shown in a popup when the chip is clicked — RU for the
// Russian locale, EN (`historyEn`) for the English one; the client picks by locale.
// Ranking source: Transport Topics "Top Freight Brokerage Firms" 2025.

export type TopBroker = {
  name: string
  hq: string
  history: string
  historyEn: string
  /** DOT записи в SAFER, выверенный вручную (сессия 29.08.2026): у крупных
   * брендов в реестре по несколько однофамильцев, и никакое правило имени не
   * отличит «ECHO GLOBAL LOGISTICS INC» с 600 W Chicago Ave от такой же строки
   * из Маттесона. Есть dot — карточка идёт в SAFER напрямую, без поиска. */
  dot?: string
  /** MC, когда SAFER его не печатает вовсе (у RXO и England Logistics номер
   * виден только в L&I). Источник: их собственные карьер-пакеты. */
  mc?: string
  /** Имя, под которым компания ЗАПИСАНА в реестре, когда оно отличается от
   * брендового: «MODE Global» ведёт брокеридж как MODE TRANSPORTATION LLC,
   * «Landstar System» — холдинг, авторитет у LANDSTAR RANGER. Поиском по бренду
   * их не найти вовсе. */
  alias?: string
}

export const TOP_BROKERS: TopBroker[] = [
  { name: 'C.H. Robinson', hq: 'MN', history: 'Основана в 1905 году в Северной Дакоте, штаб-квартира — Иден-Прери, Миннесота. Один из крупнейших 3PL и фрахтовых брокеров мира, публичная компания (NASDAQ: CHRW) с выручкой свыше $20 млрд.', historyEn: 'Founded in 1905 in North Dakota, headquartered in Eden Prairie, Minnesota. One of the world’s largest 3PLs and freight brokers, a public company (NASDAQ: CHRW) with revenue over $20B.' },
  { name: 'Total Quality Logistics', hq: 'OH', history: 'Основана в 1997 году Кеном Оуксом в Цинциннати, Огайо. Второй по величине фрахтовый брокер США, остаётся частной компанией.', historyEn: 'Founded in 1997 by Ken Oaks in Cincinnati, Ohio. The second-largest freight broker in the US and still privately held.' },
  { name: 'J.B. Hunt Transport Services', alias: 'J B Hunt', hq: 'AR', history: 'Основана в 1961 году Джонни Брайаном Хантом в Лоуэлле, Арканзас. Один из крупнейших перевозчиков США; брокерское направление — ICS (Integrated Capacity Solutions).', historyEn: 'Founded in 1961 by Johnnie Bryan Hunt in Lowell, Arkansas. One of the largest US carriers; its brokerage arm is ICS (Integrated Capacity Solutions).' },
  { name: 'RXO', mc: '107012', dot: '425389', hq: 'NC', history: 'Выделена из XPO Logistics в 2022 году, штаб — Шарлотт, Северная Каролина. В сентябре 2024 купила Coyote Logistics у UPS за $1,025 млрд и стала 3-м по величине брокером Северной Америки.', historyEn: 'Spun off from XPO Logistics in 2022, headquartered in Charlotte, North Carolina. In September 2024 it bought Coyote Logistics from UPS for $1.025B, becoming the 3rd-largest broker in North America.' },
  { name: 'Coyote Logistics', hq: 'IL', history: 'Основана в 2006 году Джеффом Сильвером в Чикаго. Куплена UPS в 2015 за $1,8 млрд, а в 2024 продана RXO. Сильна в сегменте продуктов питания и напитков.', historyEn: 'Founded in 2006 by Jeff Silver in Chicago. Acquired by UPS in 2015 for $1.8B, then sold to RXO in 2024. Strong in the food and beverage segment.' },
  { name: 'Echo Global Logistics', dot: '2233564', hq: 'IL', history: 'Основана в 2005 году в Чикаго как технологичный брокер. В 2021 выкуплена фондом The Jordan Company и стала частной.', historyEn: 'Founded in 2005 in Chicago as a technology-driven broker. Taken private by The Jordan Company in 2021.' },
  { name: 'Landstar System', alias: 'Landstar Ranger', hq: 'FL', history: 'Основана в 1968 году, штаб — Джексонвилл, Флорида. Работает через сеть независимых агентов и владельцев-операторов, публичная (NASDAQ: LSTR).', historyEn: 'Founded in 1968, headquartered in Jacksonville, Florida. Operates through a network of independent agents and owner-operators; public (NASDAQ: LSTR).' },
  { name: 'Uber Freight', dot: '2926893', hq: 'CA', history: 'Запущена компанией Uber в 2017 году. В 2021 купила Transplace примерно за $2,25 млрд; цифровая брокерская платформа.', historyEn: 'Launched by Uber in 2017. Acquired Transplace in 2021 for roughly $2.25B; a digital brokerage platform.' },
  { name: 'Worldwide Express', hq: 'TX', history: 'Штаб — Даллас, Техас. В 2021 объединилась с GlobalTranz. Специализируется на посылках и грузовом брокеридже для малого и среднего бизнеса.', historyEn: 'Headquartered in Dallas, Texas. Merged with GlobalTranz in 2021. Specializes in parcel and freight brokerage for small and mid-sized businesses.' },
  { name: 'Arrive Logistics', hq: 'TX', history: 'Основана в 2014 году Мэттом Пайаттом и Эриком Даниганом в Остине, Техас. Один из самых быстрорастущих брокеров страны.', historyEn: 'Founded in 2014 by Matt Pyatt and Eric Dunigan in Austin, Texas. One of the fastest-growing brokers in the country.' },
  { name: 'Hub Group', hq: 'IL', history: 'Основана в 1971 году Филлипом Йегером, штаб — Оук-Брук, Иллинойс. Интермодальные перевозки и брокеридж, публичная (NASDAQ: HUBG).', historyEn: 'Founded in 1971 by Phillip Yeager, headquartered in Oak Brook, Illinois. Intermodal transport and brokerage; public (NASDAQ: HUBG).' },
  { name: 'Schneider Logistics', hq: 'WI', history: 'Материнская Schneider основана в 1935 году Элом Шнайдером в Грин-Бей, Висконсин. Крупный перевозчик и логистический оператор, публичная (NYSE: SNDR).', historyEn: 'Parent company Schneider was founded in 1935 by Al Schneider in Green Bay, Wisconsin. A large carrier and logistics operator; public (NYSE: SNDR).' },
  { name: 'England Logistics', mc: '135655', dot: '2241506', hq: 'UT', history: 'Брокерское подразделение C.R. England (основана в 1920), штаб — Солт-Лейк-Сити, Юта.', historyEn: 'The brokerage division of C.R. England (founded 1920), headquartered in Salt Lake City, Utah.' },
  { name: 'Nolan Transportation Group', hq: 'GA', history: 'NTG, основана в 2005 году в Атланте, Джорджия. Один из крупнейших брокеров США по объёму.', historyEn: 'NTG, founded in 2005 in Atlanta, Georgia. One of the largest US brokers by volume.' },
  { name: 'Molo Solutions', hq: 'IL', history: 'Основана в 2017 году Мэттом Вогричем в Чикаго. В 2021 куплена перевозчиком ArcBest.', historyEn: 'Founded in 2017 by Matt Vogrich in Chicago. Acquired by carrier ArcBest in 2021.' },
  { name: 'Redwood Logistics', dot: '2228062', hq: 'IL', history: 'Основана в 2001 году в Чикаго; логистика полного цикла и цифровые решения.', historyEn: 'Founded in 2001 in Chicago; full-service logistics and digital solutions.' },
  { name: 'BlueGrace Logistics', dot: '2222378', alias: 'Blue-Grace Logistics', hq: 'FL', history: 'Основана в 2009 году Бобби Харрисом в Ривервью (район Тампы), Флорида.', historyEn: 'Founded in 2009 by Bobby Harris in Riverview (Tampa area), Florida.' },
  { name: 'Circle Logistics', hq: 'IN', history: 'Основана в 2011 году в Форт-Уэйн, Индиана; частный брокер полного цикла.', historyEn: 'Founded in 2011 in Fort Wayne, Indiana; a privately held full-service broker.' },
  { name: 'Armstrong Transport Group', hq: 'NC', history: 'Основана в 2006 году в Шарлотт, Северная Каролина; работает через агентскую сеть.', historyEn: 'Founded in 2006 in Charlotte, North Carolina; operates through an agent network.' },
  { name: 'Allen Lund Company', hq: 'CA', history: 'Основана в 1976 году Алленом Лундом в Ла-Каньяда, Калифорния. Специализация — скоропорт и рефрижераторные перевозки.', historyEn: 'Founded in 1976 by Allen Lund in La Cañada, California. Specializes in produce and refrigerated freight.' },
  { name: 'Trinity Logistics', dot: '2214024', hq: 'DE', history: 'Основана в 1979 году в Сифорде, Делавэр; входит в группу Burris Logistics.', historyEn: 'Founded in 1979 in Seaford, Delaware; part of the Burris Logistics group.' },
  { name: 'Loadsmart', hq: 'IL', history: 'Основана в 2014 году; цифровой автоматизированный брокер с офисами в Чикаго и Нью-Йорке.', historyEn: 'Founded in 2014; a digital, automated broker with offices in Chicago and New York.' },
  { name: 'ITS Logistics', hq: 'NV', history: 'Основана в 1999 году, штаб — Рино, Невада; перевозки, склад и интермодал.', historyEn: 'Founded in 1999, headquartered in Reno, Nevada; trucking, warehousing, and intermodal.' },
  { name: 'Choptank Transport', hq: 'MD', history: 'Основана в 1996 году в Престоне, Мэриленд; семейный брокер, рефрижераторы и сухие фургоны.', historyEn: 'Founded in 1996 in Preston, Maryland; a family-owned broker handling reefer and dry van freight.' },
  { name: 'PLS Logistics Services', dot: '598698', hq: 'PA', history: 'Основана в 1991 году, Крэнберри-Тауншип, Пенсильвания; мультимодальная логистика.', historyEn: 'Founded in 1991 in Cranberry Township, Pennsylvania; multimodal logistics.' },
  { name: 'MODE Global', dot: '2214647', alias: 'Mode Transportation', hq: 'TX', history: 'MODE Transportation, штаб — Даллас, Техас. Агентская модель, интермодал и брокеридж.', historyEn: 'MODE Transportation, headquartered in Dallas, Texas. Agent-based model spanning intermodal and brokerage.' },
  { name: 'Sunset Transportation', dot: '2214238', hq: 'MO', history: 'Основана в 1989 году в Сент-Луисе, Миссури; семейная логистическая компания.', historyEn: 'Founded in 1989 in St. Louis, Missouri; a family-owned logistics company.' },
  { name: 'Kingsgate Logistics', hq: 'OH', history: 'Основана в 1986 году в Уэст-Честере, Огайо.', historyEn: 'Founded in 1986 in West Chester, Ohio.' },
  { name: 'R2 Logistics', hq: 'FL', history: 'Основана в 2007 году в Джексонвилле, Флорида.', historyEn: 'Founded in 2007 in Jacksonville, Florida.' },
  { name: 'Surge Transportation', hq: 'FL', history: 'Основана в 2016 году в Джексонвилле, Флорида; цифровой брокер.', historyEn: 'Founded in 2016 in Jacksonville, Florida; a digital broker.' },
  { name: 'Priority1', dot: '2222837', hq: 'AR', history: 'Основана в 1995 году в Литл-Роке, Арканзас; брокеридж LTL и FTL.', historyEn: 'Founded in 1995 in Little Rock, Arkansas; LTL and FTL brokerage.' },
  { name: 'AFN Logistics', dot: '2226975', hq: 'IL', history: 'Основана в 2003 году в Найлсе, Иллинойс.', historyEn: 'Founded in 2003 in Niles, Illinois.' },
  { name: 'Steam Logistics', dot: '2232729', hq: 'TN', history: 'Основана в 2012 году в Чаттануге, Теннесси; международные и внутренние перевозки.', historyEn: 'Founded in 2012 in Chattanooga, Tennessee; international and domestic freight.' },
  { name: 'Axle Logistics', hq: 'TN', history: 'Основана в 2012 году в Ноксвилле, Теннесси.', historyEn: 'Founded in 2012 in Knoxville, Tennessee.' },
  { name: 'Command Transportation', hq: 'IL', history: 'Основана в 2005 году в Скоки, Иллинойс. В 2015 куплена Echo Global Logistics.', historyEn: 'Founded in 2005 in Skokie, Illinois. Acquired by Echo Global Logistics in 2015.' },
  { name: 'Tucker Company Worldwide', hq: 'NJ', history: 'Основана в 1961 году, Черри-Хилл, Нью-Джерси. Одна из старейших семейных брокерских компаний США, специализация — негабарит и тяжеловесы.', historyEn: 'Founded in 1961 in Cherry Hill, New Jersey. One of the oldest family-owned brokerages in the US, specializing in oversized and heavy-haul freight.' },
]
