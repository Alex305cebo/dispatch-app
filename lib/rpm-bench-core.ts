// Ставка за милю по самому маршруту «штат → штат» — только рыночные данные, без формул.
// Правило пользователя (16–17.09.2026): рядом с направлением — то, что реально заплатили
// или опубликовали, и НЕ по нашим прошлым грузам (один рейт-кон давал $7/mi на весь штат).
// Источники:
//   • DAT RateView — спот с доски DAT One за 30 дней (таблица dat_lanes, расширение DispatchPro);
//   • USDA AMS — недельный отчёт по рефрижераторным продуктовым рейсам (только Reefer);
//   • Warp — открытый API котировок (scripts/lane-rates.mjs, тот же dat_lanes с source='warp').
//     Это цена ГРУЗООТПРАВИТЕЛЯ: на наших доставленных грузах она вышла примерно в 1.2 раза
//     выше того, что получил трак. Поэтому она последняя в очереди и всегда с подписью.
// Средняя «в штат откуда угодно» не берётся: это смесь чужих маршрутов, а не ставка этого.
// Нет ставки по маршруту — null, и планировщик показывает ставку DAT по региону штата.
// Без сети и базы — проверяется тестом.

export type RpmStat = {
  rpm: number
  n: number
  /** Сдвиг за неделю: ставка последних 7 дней против 7 дней до них, доля (0.03 = +3%).
   * Нет одного из окон — поля нет. */
  wk?: number
}
/** lane — «TX>GA», into — штат доставки. */
export type RpmTable = { lane: Record<string, RpmStat>; into: Record<string, RpmStat> }
export type RpmSource = 'datLane' | 'usdaLane' | 'warpLane'
export type RpmBench = {
  dat: RpmTable
  /** Только у рефрижератора: у USDA — продуктовые рейсы. */
  usda: RpmTable | null
  /** Неделя отчёта USDA, MM/DD/YY — для подписи. */
  usdaWeek: string | null
  /** Котировки Warp — цена грузоотправителя, берётся последней. */
  warp?: RpmTable | null
  /** Сколько от цены грузоотправителя доходит до трака (lib/broker-cut.ts) — для цели торга. */
  cut?: import('./broker-cut.ts').BrokerCut | null
}
export type Benchmark = { rpm: number; n: number; source: RpmSource; from: string | null; to: string; wk?: number }

/** Строка может быть уже суммой (SQL GROUP BY) — тогда n больше единицы. */
export type RpmRow = {
  from: string | null
  to: string | null
  rate: number
  miles: number
  n?: number
  /** Те же суммы по окнам «последние 7 дней» и «7 дней до них» — для сдвига за неделю. */
  rate7?: number
  miles7?: number
  rate14?: number
  miles14?: number
}

/**
 * Короче этого котировка Warp — не ставка за милю, а минимальная цена за подачу: на паре
 * Louisville → Indianapolis (около 115 миль) она давала $8–9/mi, которых на рынке нет,
 * и эта цифра ещё и переносилась на другой, более длинный рейс (ключ ставки — только
 * «штат → штат», без миль). Такие строки в ставку по маршруту не берём.
 */
export const WARP_MIN_MILES = 250

export const laneKey = (from: string, to: string) => `${from}>${to}`
export const emptyTable = (): RpmTable => ({ lane: {}, into: {} })

/** Весь гросс на все мили, а не среднее средних. */
export function rpmTableFrom(rows: Iterable<RpmRow>): RpmTable {
  type Acc = { rate: number; miles: number; n: number; r7: number; m7: number; r14: number; m14: number }
  const lane = new Map<string, Acc>()
  const into = new Map<string, Acc>()
  const add = (m: Map<string, Acc>, key: string, r: RpmRow) => {
    const a = m.get(key) ?? { rate: 0, miles: 0, n: 0, r7: 0, m7: 0, r14: 0, m14: 0 }
    a.rate += r.rate
    a.miles += r.miles
    a.n += r.n ?? 1
    a.r7 += r.rate7 ?? 0
    a.m7 += r.miles7 ?? 0
    a.r14 += r.rate14 ?? 0
    a.m14 += r.miles14 ?? 0
    m.set(key, a)
  }
  for (const r of rows) {
    if (!r.to || !(r.rate > 0) || !(r.miles > 0)) continue
    add(into, r.to, r)
    if (r.from) add(lane, laneKey(r.from, r.to), r)
  }
  const done = (m: Map<string, Acc>): Record<string, RpmStat> =>
    Object.fromEntries(
      [...m].map(([k, a]) => {
        const stat: RpmStat = { rpm: Math.round((a.rate / a.miles) * 100) / 100, n: a.n }
        if (a.m7 > 0 && a.m14 > 0) stat.wk = Math.round((a.r7 / a.m7 / (a.r14 / a.m14) - 1) * 1000) / 1000
        return [k, stat]
      }),
    )
  return { lane: done(lane), into: done(into) }
}

const ORDER: [keyof Pick<RpmBench, 'dat' | 'usda' | 'warp'>, RpmSource][] = [
  ['dat', 'datLane'],
  ['usda', 'usdaLane'],
  ['warp', 'warpLane'],
]

/**
 * Ставка по самому маршруту from→to: DAT с доски точнее, потом USDA, потом Warp. Нет — null.
 *
 * `warp: false` — только источники, где ставка измерена на настоящем рейсе с его милями.
 * Так спрашивает НАПРАВЛЕНИЕ «штат → штат» у планировщика: котировка Warp считана на паре
 * городов со своей длиной, и её цена за милю к другому рейсу отношения не имеет
 * (пользователь, 18.09.2026: «таких цен не бывает на рынке»). У конкретного груза мили
 * настоящие — там Warp остаётся.
 */
export function benchmarkRpm(
  bench: RpmBench | null | undefined,
  from: string | null,
  to: string,
  opts?: { warp?: boolean },
): Benchmark | null {
  if (!bench || !from) return null
  for (const [src, source] of ORDER) {
    if (src === 'warp' && opts?.warp === false) continue
    const stat = bench[src]?.lane[laneKey(from, to)]
    if (stat) return { rpm: stat.rpm, n: stat.n, source, from, to, ...(stat.wk != null ? { wk: stat.wk } : {}) }
  }
  return null
}

// ── USDA AMS: «Refrigerated Truck Rates and Availability» ──────────────────
//
// Строка отчёта: район происхождения (текстом, с регионом USDA), город назначения, мили и
// ставка за рейс (weeklow/weekhigh/midpoint). Один и тот же район из Калифорнии и Аризоны
// USDA печатает дважды — под регионом CALIFORNIA и под ARIZONA: для направлений это два
// штата погрузки, для «в штат» — одна строка.

export type UsdaRow = {
  date?: string
  region?: string
  origin?: string
  destination?: string
  commodity?: string
  distance?: string | number
  midpoint?: string | number
}

/** Регионы USDA, которые и есть штат. Остальные (PNW, SOUTHEAST, MID-ATLANTIC…) — штат из текста района. */
const REGION_STATE: Record<string, string> = {
  ARIZONA: 'AZ',
  CALIFORNIA: 'CA',
  TEXAS: 'TX',
  'MEXICO-TEXAS': 'TX',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  MICHIGAN: 'MI',
  'NEW YORK': 'NY',
  WASHINGTON: 'WA',
  IDAHO: 'ID',
  OREGON: 'OR',
  COLORADO: 'CO',
  'NORTH CAROLINA': 'NC',
}

/** Составные названия раньше простых: «WEST VIRGINIA» не должна читаться как Вирджиния. */
const STATE_WORDS: [string, string][] = [
  ['NORTH CAROLINA', 'NC'],
  ['SOUTH CAROLINA', 'SC'],
  ['NORTH DAKOTA', 'ND'],
  ['SOUTH DAKOTA', 'SD'],
  ['WEST VIRGINIA', 'WV'],
  ['NEW HAMPSHIRE', 'NH'],
  ['NEW JERSEY', 'NJ'],
  ['NEW MEXICO', 'NM'],
  ['NEW YORK', 'NY'],
  ['CALIFORNIA', 'CA'],
  ['ARIZONA', 'AZ'],
  ['WASHINGTON', 'WA'],
  ['IDAHO', 'ID'],
  ['OREGON', 'OR'],
  ['TEXAS', 'TX'],
  ['FLORIDA', 'FL'],
  ['GEORGIA', 'GA'],
  ['MICHIGAN', 'MI'],
  ['DELAWARE', 'DE'],
  ['MARYLAND', 'MD'],
  ['VIRGINIA', 'VA'],
  ['COLORADO', 'CO'],
  ['MINNESOTA', 'MN'],
  ['WISCONSIN', 'WI'],
  ['NEBRASKA', 'NE'],
  ['MAINE', 'ME'],
  ['PENNSYLVANIA', 'PA'],
  ['OHIO', 'OH'],
  ['MISSOURI', 'MO'],
  ['ARKANSAS', 'AR'],
  ['ALABAMA', 'AL'],
  ['MISSISSIPPI', 'MS'],
  ['LOUISIANA', 'LA'],
  ['TENNESSEE', 'TN'],
  ['KENTUCKY', 'KY'],
  ['INDIANA', 'IN'],
  ['ILLINOIS', 'IL'],
  ['NEVADA', 'NV'],
  ['UTAH', 'UT'],
  ['OKLAHOMA', 'OK'],
  ['KANSAS', 'KS'],
  ['IOWA', 'IA'],
  ['MASSACHUSETTS', 'MA'],
  ['CONNECTICUT', 'CT'],
  ['VERMONT', 'VT'],
  ['MONTANA', 'MT'],
  ['WYOMING', 'WY'],
]

/** Города назначения отчёта USDA — штат. Неизвестный город строку не портит: она пропускается. */
const CITY_STATE: [string, string][] = [
  ['NEW YORK', 'NY'],
  ['LOS ANGELES', 'CA'],
  ['SAN FRANCISCO', 'CA'],
  ['SAN DIEGO', 'CA'],
  ['ST. LOUIS', 'MO'],
  ['ST LOUIS', 'MO'],
  ['KANSAS CITY', 'MO'],
  ['SALT LAKE CITY', 'UT'],
  ['LAS VEGAS', 'NV'],
  ['SAN ANTONIO', 'TX'],
  ['NEW ORLEANS', 'LA'],
  ['OKLAHOMA CITY', 'OK'],
  ['DES MOINES', 'IA'],
  ['EL PASO', 'TX'],
  ['LITTLE ROCK', 'AR'],
  ['ATLANTA', 'GA'],
  ['BALTIMORE', 'MD'],
  ['BOSTON', 'MA'],
  ['CHICAGO', 'IL'],
  ['DALLAS', 'TX'],
  ['MIAMI', 'FL'],
  ['PHILADELPHIA', 'PA'],
  ['SEATTLE', 'WA'],
  ['DENVER', 'CO'],
  ['HOUSTON', 'TX'],
  ['MINNEAPOLIS', 'MN'],
  ['DETROIT', 'MI'],
  ['PORTLAND', 'OR'],
  ['PHOENIX', 'AZ'],
  ['ORLANDO', 'FL'],
  ['TAMPA', 'FL'],
  ['JACKSONVILLE', 'FL'],
  ['CHARLOTTE', 'NC'],
  ['RALEIGH', 'NC'],
  ['CINCINNATI', 'OH'],
  ['CLEVELAND', 'OH'],
  ['COLUMBUS', 'OH'],
  ['PITTSBURGH', 'PA'],
  ['MEMPHIS', 'TN'],
  ['NASHVILLE', 'TN'],
  ['INDIANAPOLIS', 'IN'],
  ['MILWAUKEE', 'WI'],
  ['RICHMOND', 'VA'],
  ['NORFOLK', 'VA'],
  ['BUFFALO', 'NY'],
  ['ALBANY', 'NY'],
  ['HARTFORD', 'CT'],
  ['PROVIDENCE', 'RI'],
  ['NEWARK', 'NJ'],
  ['OMAHA', 'NE'],
  ['LOUISVILLE', 'KY'],
  ['BIRMINGHAM', 'AL'],
  ['SACRAMENTO', 'CA'],
  ['FRESNO', 'CA'],
  ['SPOKANE', 'WA'],
  ['BOISE', 'ID'],
  ['ALBUQUERQUE', 'NM'],
  ['TUCSON', 'AZ'],
  ['CHARLESTON', 'SC'],
  ['SAVANNAH', 'GA'],
  ['TULSA', 'OK'],
  ['WICHITA', 'KS'],
  ['LAREDO', 'TX'],
]

export function usdaOriginStates(region: string, origin: string): string[] {
  const byRegion = REGION_STATE[region.trim().toUpperCase()]
  if (byRegion) return [byRegion]
  let text = ` ${origin.toUpperCase()} `
  const out: string[] = []
  for (const [name, code] of STATE_WORDS) {
    if (!text.includes(name)) continue
    if (!out.includes(code)) out.push(code)
    text = text.split(name).join(' ')
  }
  return out
}

export function usdaDestState(destination: string | undefined): string | null {
  const d = (destination ?? '').toUpperCase()
  return CITY_STATE.find(([city]) => d.includes(city))?.[1] ?? null
}

/** Отчёт USDA → таблица ставок и неделя отчёта (YYYY-MM-DD). Ставка — midpoint / distance USDA. */
export function usdaTable(rows: UsdaRow[]): { table: RpmTable; week: string | null } {
  const laneRows: RpmRow[] = []
  const intoRows: RpmRow[] = []
  const seen = new Set<string>()
  let week: string | null = null
  for (const r of rows) {
    const miles = Number(r.distance)
    const rate = Number(r.midpoint)
    const to = usdaDestState(r.destination)
    if (!to || !(miles > 0) || !(rate > 0)) continue
    const day = String(r.date ?? '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && (!week || day > week)) week = day
    for (const from of usdaOriginStates(r.region ?? '', r.origin ?? '')) laneRows.push({ from, to, rate, miles })
    const key = `${r.origin}|${r.destination}|${r.commodity ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    intoRows.push({ from: null, to, rate, miles })
  }
  return { table: { lane: rpmTableFrom(laneRows).lane, into: rpmTableFrom(intoRows).into }, week }
}
