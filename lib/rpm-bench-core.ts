// Настоящая ставка за милю по штату — из данных, а не из формулы. Правило пользователя
// (16.09.2026): рядом с направлением показываем только то, что где-то реально заплатили
// или опубликовали; расчётов и «примерно» здесь нет. Источники:
//   • DAT RateView — спот-ставки с доски DAT One, которые диспетчер видел за 30 дней
//     (таблица dat_lanes, пишет расширение DispatchPro);
//   • наши рейт-коны за 12 месяцев — весь гросс на все гружёные мили;
//   • USDA AMS — недельный отчёт Минсельхоза США по рефрижераторным рейсам с
//     опубликованной ставкой (agtransport.usda.gov, открытые данные, только Reefer).
// Сначала ищется ставка по самому направлению (штат→штат), потом по всем грузам в штат.
// Ничего не нашлось — null, и на экране «данных нет»: бесплатный DAT ставок по штатам не
// отдаёт (только пять регионов), а придумывать нельзя. Без сети и базы — проверяется тестом.

import type { LoadRecord } from './map.ts'
import { stateOfCity } from './toll-spend.ts'

export type RpmStat = { rpm: number; n: number }
/** lane — «TX>GA», into — штат доставки. */
export type RpmTable = { lane: Record<string, RpmStat>; into: Record<string, RpmStat> }
export type RpmSource = 'datLane' | 'datInto' | 'ownLane' | 'ownInto' | 'usdaLane' | 'usdaInto'
export type RpmBench = {
  dat: RpmTable
  own: RpmTable
  /** Только у рефрижератора: у USDA — продуктовые рейсы. */
  usda: RpmTable | null
  /** Неделя отчёта USDA, MM/DD/YY — для подписи. */
  usdaWeek: string | null
}
export type Benchmark = { rpm: number; n: number; source: RpmSource; from: string | null; to: string }

/** Строка может быть уже суммой (SQL GROUP BY) — тогда n больше единицы. */
export type RpmRow = { from: string | null; to: string | null; rate: number; miles: number; n?: number }

export const laneKey = (from: string, to: string) => `${from}>${to}`
export const emptyTable = (): RpmTable => ({ lane: {}, into: {} })

/** Весь гросс на все мили, а не среднее средних — как ставка штата в lib/own-state-rpm.ts. */
export function rpmTableFrom(rows: Iterable<RpmRow>): RpmTable {
  type Acc = { rate: number; miles: number; n: number }
  const lane = new Map<string, Acc>()
  const into = new Map<string, Acc>()
  const add = (m: Map<string, Acc>, key: string, r: RpmRow) => {
    const a = m.get(key) ?? { rate: 0, miles: 0, n: 0 }
    a.rate += r.rate
    a.miles += r.miles
    a.n += r.n ?? 1
    m.set(key, a)
  }
  for (const r of rows) {
    if (!r.to || !(r.rate > 0) || !(r.miles > 0)) continue
    add(into, r.to, r)
    if (r.from) add(lane, laneKey(r.from, r.to), r)
  }
  const done = (m: Map<string, Acc>): Record<string, RpmStat> =>
    Object.fromEntries([...m].map(([k, a]) => [k, { rpm: Math.round((a.rate / a.miles) * 100) / 100, n: a.n }]))
  return { lane: done(lane), into: done(into) }
}

/** Наши рейт-коны за год: те же отборы, что у ставки по штату погрузки (own-state-rpm). */
export function ownRpmTable(loads: LoadRecord[], now = Date.now()): RpmTable {
  const since = now - 365 * 86400_000
  const rows: RpmRow[] = []
  for (const l of loads) {
    if (l.status === 'quoted' || l.status === 'cancelled') continue
    if (!(l.rate > 0) || !(l.loadedMiles > 0)) continue
    const day = Date.parse(l.pickupDate ?? '')
    if (Number.isNaN(day) || day < since) continue
    rows.push({ from: stateOfCity(l.origin), to: stateOfCity(l.destination), rate: l.rate, miles: l.loadedMiles })
  }
  return rpmTableFrom(rows)
}

const ORDER: [keyof Pick<RpmBench, 'dat' | 'own' | 'usda'>, 'lane' | 'into', RpmSource][] = [
  ['dat', 'lane', 'datLane'],
  ['own', 'lane', 'ownLane'],
  ['usda', 'lane', 'usdaLane'],
  ['dat', 'into', 'datInto'],
  ['own', 'into', 'ownInto'],
  ['usda', 'into', 'usdaInto'],
]

/** Ставка для направления from→to: точнее — по самому направлению, дальше — по штату доставки. */
export function benchmarkRpm(bench: RpmBench | null | undefined, from: string | null, to: string): Benchmark | null {
  if (!bench) return null
  for (const [src, kind, source] of ORDER) {
    const table = bench[src]
    if (!table) continue
    const stat = kind === 'lane' ? (from ? table.lane[laneKey(from, to)] : undefined) : table.into[to]
    if (stat) return { rpm: stat.rpm, n: stat.n, source, from: kind === 'lane' ? from : null, to }
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
