// A curated starter list of the biggest US freight brokers, by name only — NO MC
// numbers baked in, because a wrong MC on a known broker is worse than none. When
// FMCSA_WEBKEY is set, a name lookup can resolve the real MC/DOT and cache it.
//
// Each carries a short history (RU) shown in a popup when the chip is clicked.
// Ranking source: Transport Topics "Top Freight Brokerage Firms" 2025.

export type TopBroker = { name: string; hq: string; history: string }

export const TOP_BROKERS: TopBroker[] = [
  { name: 'C.H. Robinson', hq: 'MN', history: 'Основана в 1905 году в Северной Дакоте, штаб-квартира — Иден-Прери, Миннесота. Один из крупнейших 3PL и фрахтовых брокеров мира, публичная компания (NASDAQ: CHRW) с выручкой свыше $20 млрд.' },
  { name: 'Total Quality Logistics', hq: 'OH', history: 'Основана в 1997 году Кеном Оуксом в Цинциннати, Огайо. Второй по величине фрахтовый брокер США, остаётся частной компанией.' },
  { name: 'J.B. Hunt Transport Services', hq: 'AR', history: 'Основана в 1961 году Джонни Брайаном Хантом в Лоуэлле, Арканзас. Один из крупнейших перевозчиков США; брокерское направление — ICS (Integrated Capacity Solutions).' },
  { name: 'RXO', hq: 'NC', history: 'Выделена из XPO Logistics в 2022 году, штаб — Шарлотт, Северная Каролина. В сентябре 2024 купила Coyote Logistics у UPS за $1,025 млрд и стала 3-м по величине брокером Северной Америки.' },
  { name: 'Coyote Logistics', hq: 'IL', history: 'Основана в 2006 году Джеффом Сильвером в Чикаго. Куплена UPS в 2015 за $1,8 млрд, а в 2024 продана RXO. Сильна в сегменте продуктов питания и напитков.' },
  { name: 'Echo Global Logistics', hq: 'IL', history: 'Основана в 2005 году в Чикаго как технологичный брокер. В 2021 выкуплена фондом The Jordan Company и стала частной.' },
  { name: 'Landstar System', hq: 'FL', history: 'Основана в 1968 году, штаб — Джексонвилл, Флорида. Работает через сеть независимых агентов и владельцев-операторов, публичная (NASDAQ: LSTR).' },
  { name: 'Uber Freight', hq: 'CA', history: 'Запущена компанией Uber в 2017 году. В 2021 купила Transplace примерно за $2,25 млрд; цифровая брокерская платформа.' },
  { name: 'Worldwide Express', hq: 'TX', history: 'Штаб — Даллас, Техас. В 2021 объединилась с GlobalTranz. Специализируется на посылках и грузовом брокеридже для малого и среднего бизнеса.' },
  { name: 'Arrive Logistics', hq: 'TX', history: 'Основана в 2014 году Мэттом Пайаттом и Эриком Даниганом в Остине, Техас. Один из самых быстрорастущих брокеров страны.' },
  { name: 'Hub Group', hq: 'IL', history: 'Основана в 1971 году Филлипом Йегером, штаб — Оук-Брук, Иллинойс. Интермодальные перевозки и брокеридж, публичная (NASDAQ: HUBG).' },
  { name: 'Schneider Logistics', hq: 'WI', history: 'Материнская Schneider основана в 1935 году Элом Шнайдером в Грин-Бей, Висконсин. Крупный перевозчик и логистический оператор, публичная (NYSE: SNDR).' },
  { name: 'England Logistics', hq: 'UT', history: 'Брокерское подразделение C.R. England (основана в 1920), штаб — Солт-Лейк-Сити, Юта.' },
  { name: 'Nolan Transportation Group', hq: 'GA', history: 'NTG, основана в 2005 году в Атланте, Джорджия. Один из крупнейших брокеров США по объёму.' },
  { name: 'Molo Solutions', hq: 'IL', history: 'Основана в 2017 году Мэттом Вогричем в Чикаго. В 2021 куплена перевозчиком ArcBest.' },
  { name: 'Redwood Logistics', hq: 'IL', history: 'Основана в 2001 году в Чикаго; логистика полного цикла и цифровые решения.' },
  { name: 'BlueGrace Logistics', hq: 'FL', history: 'Основана в 2009 году Бобби Харрисом в Ривервью (район Тампы), Флорида.' },
  { name: 'Circle Logistics', hq: 'IN', history: 'Основана в 2011 году в Форт-Уэйн, Индиана; частный брокер полного цикла.' },
  { name: 'Armstrong Transport Group', hq: 'NC', history: 'Основана в 2006 году в Шарлотт, Северная Каролина; работает через агентскую сеть.' },
  { name: 'Allen Lund Company', hq: 'CA', history: 'Основана в 1976 году Алленом Лундом в Ла-Каньяда, Калифорния. Специализация — скоропорт и рефрижераторные перевозки.' },
  { name: 'Trinity Logistics', hq: 'DE', history: 'Основана в 1979 году в Сифорде, Делавэр; входит в группу Burris Logistics.' },
  { name: 'Loadsmart', hq: 'IL', history: 'Основана в 2014 году; цифровой автоматизированный брокер с офисами в Чикаго и Нью-Йорке.' },
  { name: 'ITS Logistics', hq: 'NV', history: 'Основана в 1999 году, штаб — Рино, Невада; перевозки, склад и интермодал.' },
  { name: 'Choptank Transport', hq: 'MD', history: 'Основана в 1996 году в Престоне, Мэриленд; семейный брокер, рефрижераторы и сухие фургоны.' },
  { name: 'PLS Logistics Services', hq: 'PA', history: 'Основана в 1991 году, Крэнберри-Тауншип, Пенсильвания; мультимодальная логистика.' },
  { name: 'MODE Global', hq: 'TX', history: 'MODE Transportation, штаб — Даллас, Техас. Агентская модель, интермодал и брокеридж.' },
  { name: 'Sunset Transportation', hq: 'MO', history: 'Основана в 1989 году в Сент-Луисе, Миссури; семейная логистическая компания.' },
  { name: 'Kingsgate Logistics', hq: 'OH', history: 'Основана в 1986 году в Уэст-Честере, Огайо.' },
  { name: 'R2 Logistics', hq: 'FL', history: 'Основана в 2007 году в Джексонвилле, Флорида.' },
  { name: 'Surge Transportation', hq: 'FL', history: 'Основана в 2016 году в Джексонвилле, Флорида; цифровой брокер.' },
  { name: 'Priority1', hq: 'AR', history: 'Основана в 1995 году в Литл-Роке, Арканзас; брокеридж LTL и FTL.' },
  { name: 'AFN Logistics', hq: 'IL', history: 'Основана в 2003 году в Найлсе, Иллинойс.' },
  { name: 'Steam Logistics', hq: 'TN', history: 'Основана в 2012 году в Чаттануге, Теннесси; международные и внутренние перевозки.' },
  { name: 'Axle Logistics', hq: 'TN', history: 'Основана в 2012 году в Ноксвилле, Теннесси.' },
  { name: 'Command Transportation', hq: 'IL', history: 'Основана в 2005 году в Скоки, Иллинойс. В 2015 куплена Echo Global Logistics.' },
  { name: 'Tucker Company Worldwide', hq: 'NJ', history: 'Основана в 1961 году, Черри-Хилл, Нью-Джерси. Одна из старейших семейных брокерских компаний США, специализация — негабарит и тяжеловесы.' },
]
