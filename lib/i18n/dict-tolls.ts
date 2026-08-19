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
  'tolls.transponder': { ru: 'E-ZPass / транспондер', en: 'E-ZPass / transponder' },
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
  'tolls.info': {
    ru: 'Стоимость проезда считает HERE по траковому профилю: число осей и полная масса меняют тариф в разы. Сравниваются два маршрута — через платные дороги и в объезд, — и разница переводится в деньги: лишние мили объезда стоят топлива и обслуживания, и часто дороже самих толлов. С транспондером берётся тариф E-ZPass, без него — тариф «по номеру», который выше. Число обращений ограничено нарочно, чтобы бесплатный тариф HERE нельзя было превысить.',
    en: 'Toll cost comes from HERE using a truck profile: axle count and gross weight change the rate several times over. Two routes are compared — through the tolls and around them — and the difference is put in dollars: the detour’s extra miles cost fuel and maintenance, often more than the tolls themselves. With a transponder the E-ZPass rate is used; without one, the higher pay-by-plate rate. The number of requests is capped on purpose so HERE’s free tier cannot be exceeded.',
  },
} as const
