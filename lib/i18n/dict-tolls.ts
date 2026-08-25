// Раздел «Платные дороги».

export const tollsDict = {
  'tolls.title': { ru: 'Платные дороги', en: 'Toll roads' },
  'tolls.subtitle': {
    ru: 'Сколько стоит проезд по маршруту и выгоднее ли объехать',
    en: 'What the tolls cost on a route, and whether going around is cheaper',
  },
  'tolls.from': { ru: 'Откуда', en: 'From' },
  'tolls.to': { ru: 'Куда', en: 'To' },
  'tolls.axles': { ru: 'Осей', en: 'Axles' },
  'tolls.weight': { ru: 'Вес, lb', en: 'Weight, lb' },
  'tolls.calc': { ru: 'Посчитать', en: 'Calculate' },
  'tolls.calculating': { ru: 'Считаю…', en: 'Calculating…' },

  'tolls.withTolls': { ru: 'Через платные', en: 'Using tolls' },
  'tolls.avoiding': { ru: 'В объезд', en: 'Avoiding tolls' },
  'tolls.tollsTotal': { ru: 'Платные дороги', en: 'Tolls' },
  'tolls.plazas': { ru: 'Пункты оплаты', en: 'Toll points' },
  'tolls.noTolls': {
    ru: 'На этом маршруте платных дорог нет.',
    en: 'No toll roads on this route.',
  },
  'tolls.detourWorth': {
    ru: 'Объезд выгоднее на {v}: толлы дороже лишнего пробега.',
    en: 'Going around saves {v}: the tolls cost more than the extra miles.',
  },
  'tolls.detourNot': {
    ru: 'Объезд дороже на {v}: лишний пробег съедает больше, чем стоят толлы.',
    en: 'Going around costs {v} more: the extra miles eat more than the tolls.',
  },
  'tolls.detourDetail': {
    ru: '+{mi} миль и +{time} в пути · топливо и обслуживание на них — {cost}',
    en: '+{mi} mi and +{time} on the road · fuel and maintenance for them — {cost}',
  },

  'tolls.noKey': {
    ru: 'Ключ HERE не задан. Админ → Ключи → «Ключ HERE (платные дороги)».',
    en: 'No HERE key set. Admin → Keys → “HERE key (tolls)”.',
  },
  'tolls.capReached': {
    ru: 'Исчерпан месячный лимит обращений — он стоит нарочно, чтобы бесплатный тариф нельзя было превысить. Обнулится первого числа.',
    en: 'Monthly request cap reached — it exists on purpose so the free tier cannot be exceeded. It resets on the 1st.',
  },
  'tolls.noRoute': {
    ru: 'Маршрута для трака с такими габаритами нет.',
    en: 'No route for a truck with these dimensions.',
  },
  'tolls.notFound': { ru: 'Не нашёл такой город.', en: 'City not found.' },
  'tolls.failed': { ru: 'HERE не ответил:', en: 'HERE did not answer:' },
  'tolls.usage': { ru: 'Запросов в этом месяце: {used} из {cap}', en: 'Requests this month: {used} of {cap}' },
  'tolls.options': { ru: 'Варианты маршрута', en: 'Route options' },
  'tolls.badge.cheapest': { ru: 'дешевле всего', en: 'cheapest overall' },
  'tolls.badge.fastest': { ru: 'быстрее', en: 'fastest' },
  'tolls.badge.shortest': { ru: 'короче', en: 'shortest' },
  'tolls.badge.leastTolls': { ru: 'меньше платных', en: 'least tolls' },
  'tolls.fullCost': { ru: 'Всего в пути', en: 'Trip cost' },
  'tolls.fullCostHint': {
    ru: 'Сравнение по полной стоимости поездки: толлы плюс топливо и обслуживание на пробег. Маршрут с нулевыми толлами бывает дороже — лишние мили съедают больше, чем платные дороги.',
    en: 'Compared by full trip cost: tolls plus fuel and maintenance for the miles. A zero-toll route can still cost more — the extra miles eat more than the tolls.',
  },
  'tolls.vsBest': { ru: 'в сумме дороже на {v}', en: '{v} more in total' },
  'tolls.isBest': { ru: 'дешевле всех в сумме', en: 'cheapest in total' },
  'tolls.truck': { ru: 'Трак', en: 'Truck' },
  'tolls.anyTruck': { ru: 'по среднему траку', en: 'fleet average truck' },
  'tolls.load': { ru: 'Груз', en: 'Load' },
  'tolls.noLoad': { ru: 'без груза', en: 'no load' },
  'tolls.loadImpact': {
    ru: 'Чистыми по этому грузу: {before} → {after} после платных дорог',
    en: 'Net on this load: {before} → {after} after tolls',
  },
  'tolls.fromDoc': { ru: 'Скриншот DAT или rate con', en: 'DAT screenshot or rate con' },
  'tolls.fromDocHint': {
    ru: 'Распознаю откуда и куда — перепечатывать не нужно',
    en: 'Reads origin and destination — no retyping',
  },
  'tolls.reading': { ru: 'Читаю документ…', en: 'Reading the document…' },
  'tolls.docEmpty': { ru: 'Файл пустой.', en: 'Empty file.' },
  'tolls.docTooBig': { ru: 'Файл больше 8 МБ.', en: 'File is over 8 MB.' },
  'tolls.docNoRoute': {
    ru: 'В документе не нашлись города погрузки и выгрузки.',
    en: 'No pickup and delivery cities found in the document.',
  },
  'tolls.pointOnMap': { ru: 'Показать на карте', en: 'Show on the map' },
  'tolls.via': { ru: 'Через', en: 'Via' },
  'tolls.addVia': { ru: '+ точка маршрута', en: '+ waypoint' },
  'tolls.viaHint': {
    ru: 'Куда маршрут обязан зайти. Мосты Нью-Йорка платные все до одного — объезжать там нечего, а экономить можно дальше по пути.',
    en: 'Where the route must pass through. Every New York bridge is tolled — there is nothing to avoid there, and savings live further along.',
  },
  'tolls.removeVia': { ru: 'Убрать', en: 'Remove' },
  'tolls.saveToLoad': { ru: 'Записать в груз', en: 'Save onto the load' },
  'tolls.savedToLoad': {
    ru: 'Толлы записаны — теперь они в себестоимости груза',
    en: 'Tolls saved — now part of the load cost',
  },
  'tolls.departure': { ru: 'Выезд', en: 'Departure' },
  'tolls.departureHint': {
    ru: 'Цена части дорог зависит от часа: в Нью-Йорке и Чикаго пиковый тариф выше.',
    en: 'Some roads price by the hour: peak rates in New York and Chicago are higher.',
  },
  'tolls.info': {
    ru: 'Стоимость проезда считает HERE по траковому профилю: число осей и полная масса меняют тариф в разы. Показываются несколько вариантов маршрута; крупная цифра в карточке — сами платные дороги, мелкая строка внизу сравнивает варианты по полной стоимости поездки, потому что маршрут с нулевыми толлами бывает дороже — лишние мили съедают больше. Из вариантов оплаты берётся самый дорогой: ошибиться в большую сторону безопасно, в меньшую — нет. Число обращений ограничено нарочно, чтобы бесплатный тариф HERE нельзя было превысить.',
    en: 'Toll cost comes from HERE using a truck profile: axle count and gross weight change the rate several times over. Several route options are shown; the large figure on a card is the tolls themselves, and the small line below compares options by full trip cost, because a zero-toll route can still cost more — the extra miles eat the difference. Of the payment options the most expensive is used: erring high is safe, erring low is not. The number of requests is capped on purpose so HERE’s free tier cannot be exceeded.',
  },

  // ── Толлы в деньгах (app/tolls/toll-money.tsx) ──────────────────────────────
  'tolls.money.title': { ru: 'Толлы в деньгах · {days} дней', en: 'Tolls in money · {days} days' },
  'tolls.money.info': {
    ru: 'Считается по своим рейсам: сумма посчитанных толлов, сколько это на милю и какую долю выручки съели платные дороги. Рейсы без посчитанных толлов в сумму не входят — они внизу отдельно.',
    en: 'From our own loads: total tolls counted, what that is per mile, and the share of revenue the toll roads ate. Loads with no tolls calculated are excluded and listed separately below.',
  },
  'tolls.money.total': { ru: 'всего толлов', en: 'tolls total' },
  'tolls.money.perMile': { ru: 'на милю', en: 'per mile' },
  'tolls.money.share': { ru: 'от выручки', en: 'of revenue' },
  'tolls.money.loads': { ru: 'рейсов с толлами', en: 'loads with tolls' },
  'tolls.money.missing': { ru: 'Через платные штаты, но толлы не посчитаны: {n}', en: 'Through toll states with no tolls counted: {n}' },
  'tolls.money.missingWhy': {
    ru: 'Пустое поле толлов — это не ноль, а «не считали». Чистая по такому рейсу завышена ровно на неизвестную сумму, и в счёт брокеру эти доллары тоже не попали.',
    en: 'An empty toll field is not zero, it is "not measured". Net profit on such a load is overstated by exactly that unknown amount, and those dollars never reached the broker invoice either.',
  },

  // ── Справочник платных дорог (app/tolls/toll-guide.tsx) ─────────────────────
  'tolls.guide.title': { ru: 'Платные дороги США: где, чем и сколько', en: 'US toll roads: where, how and how much' },
  'tolls.guide.info': {
    ru: 'Правила, из-за которых один и тот же проезд стоит по-разному: какой транспондер работает в штате, во сколько раз дороже без него и где стоят самые дорогие пункты страны. Тарифы меняются раз в год — это справка, а не расчёт счёта.',
    en: 'The rules that make the same run cost different amounts: which transponder works in each state, how much more it costs without one, and where the priciest points in the country are. Rates change yearly — this is reference, not a bill.',
  },
  'tolls.guide.states': { ru: 'Штаты с платными дорогами: {n}', en: 'States with toll roads: {n}' },
  'tolls.guide.search': { ru: 'Штат, агентство или транспондер', en: 'State, agency or transponder' },
  'tolls.guide.programs': { ru: 'Транспондеры для парка и штрафы', en: 'Fleet transponder programs and fines' },
  'tolls.guide.violation': {
    ru: 'Неоплаченный проезд — это не «толл плюс немного»: административный сбор доходит до ${cap} ЗА ОДИН проезд и не зависит от его цены. Три рамки на $12 без транспондера превращаются в счёт на три сотни.',
    en: 'An unpaid toll is not "the toll plus a little": the administrative fee runs up to ${cap} PER crossing regardless of the toll. Three $12 gantries without a transponder turn into a three-hundred-dollar bill.',
  },

  // ── Въезд в Манхэттен ───────────────────────────────────────────────────────
  'tolls.nyc.title': { ru: 'Въезд в Манхэттен ниже 60-й улицы', en: 'Entering Manhattan below 60th Street' },
  'tolls.nyc.info': {
    ru: 'У грузовиков платится КАЖДЫЙ въезд, дневного потолка нет — в отличие от легковых. Ночью, с 21:00 до 5:00 в будни, тариф ниже на 75%. Три подачи за смену — это три полных тарифа, и закладывать их надо в ставку, а не вспоминать после рейса.',
    en: 'Trucks pay on EVERY entry with no daily cap, unlike cars. Overnight on weekdays, 9pm–5am, the rate drops 75%. Three drops in a shift are three full charges — price them into the rate, not after the run.',
  },
  'tolls.nyc.entries': { ru: 'Въездов', en: 'Entries' },
  'tolls.nyc.kind': { ru: 'Машина', en: 'Vehicle' },
  'tolls.nyc.large': { ru: 'Сцеп', en: 'Multi-unit' },
  'tolls.nyc.small': { ru: 'Одиночный', en: 'Single-unit' },
  'tolls.nyc.night': { ru: 'ночью ({from}:00–{to}:00)', en: 'overnight ({from}:00–{to}:00)' },
  'tolls.nyc.total': { ru: 'за смену', en: 'per shift' },
} as const
