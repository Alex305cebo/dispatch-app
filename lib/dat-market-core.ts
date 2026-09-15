// Рынок DAT без сети: во что превращается ответ DAT Trendlines, какой регион у
// штата, насколько ставка груза выше или ниже рынка. Отдельно от lib/dat-market.ts,
// где живёт сам запрос, — чтобы всё это проверялось тестом без интернета.
//
// Источник — публичный сервис, на котором работает dat.com/trendlines. Отдаёт
// ставку за милю по пяти регионам (Van / Reefer / Flatbed) и соотношение грузов
// к тракам по каждому штату. Национальные средние и тренды там закрыты токеном,
// но для конкретного груза региональная ставка даже честнее: груз из Огайо
// сравнивается с рынком региона North, а не со средней по стране.

export type DatEquipment = 'VAN' | 'REEFER' | 'FLATBED'

export type DatRegion = { code: string; states: string[]; rpm: number }

/** Сколько грузов приходится на один трак в штате: чем выше, тем легче найти груз. */
export type DatLt = { loads: number; trucks: number; ratio: number }

/** Как рынок серии сдвинулся за неделю, %: грузов на трак и спотовая ставка. */
export type DatTrend = { ltWoW: number | null; rateWoW: number | null }

/** Грузов на трак по всей стране за неделю; `when` — конец недели, YYYY-MM-DD. */
export type DatWeek = { when: string; ratio: number }

export type DatSnapshot = {
  equipment: DatEquipment
  /** Когда забрали у DAT, мс. */
  at: number
  regions: DatRegion[]
  lt: Record<string, DatLt>
  fuel: { when: string; price: number } | null
  /** Тренд и история — только в суточном снимке из CI (scripts/dat-snapshot.mjs): живой
   * запрос за ними не ходит и переносит их из прошлого снимка. У старых снимков их нет. */
  trend?: DatTrend | null
  history?: DatWeek[] | null
}

/**
 * Тип трейлера из рейт-кона или биржи → серия DAT. Пишут как попало: «53' Dry Van»,
 * «V», «Reefer 53», «Step Deck». Power only и прочее у DAT своей серии не имеет —
 * null, и сравнивать с рынком тогда не с чем.
 */
export function datEquipment(equipment: string | null | undefined): DatEquipment | null {
  const up = (equipment ?? '').toUpperCase().trim()
  if (!up) return null
  if (/POWER\s*ONLY|\bPO\b|HOTSHOT|HOT\s*SHOT|BOX\s*TRUCK|SPRINTER|CARGO\s*VAN/.test(up)) return null
  if (/REEFER|REFRIG|\bTEMP|\bR\b/.test(up)) return 'REEFER'
  if (/FLAT|STEP\s*DECK|STEPDECK|\bSD\b|CONESTOGA|LOWBOY|RGN|DOUBLE\s*DROP|MAXI|\bF\b/.test(up)) return 'FLATBED'
  if (/VAN|DRY|\bV\b|53|48|TRAILER/.test(up)) return 'VAN'
  return null
}

/** В регионах ставок DAT пишет Канзас как KA, а не KS — без этого груз из Канзаса выпадал
 * бы из регионов. В соотношении грузов к тракам (/lt) у того же DAT уже обычный KS. */
export function datState(code: string): string {
  const c = code.trim().toUpperCase()
  return c === 'KS' ? 'KA' : c
}

/** Штат из «Wapakoneta, OH» или «Cleveland TN 37312». У места трака бывает приставка
 * «NV · 98.0mi ENE from Mammoth lakes, CA» (lib/place.ts: штат в строке вендора чужой) —
 * тогда настоящий штат в приставке. */
export function stateFromPlace(place: string | null | undefined): string | null {
  const s = (place ?? '').trim()
  const fixed = /^([A-Z]{2})\s·\s/.exec(s)
  if (fixed) return fixed[1]!
  const comma = /,\s*([A-Za-z]{2})\b/.exec(s)
  if (comma) return comma[1]!.toUpperCase()
  const bare = /\s([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/.exec(s)
  return bare ? bare[1]!.toUpperCase() : null
}

export function regionOf(snap: DatSnapshot, state: string | null): DatRegion | null {
  if (!state) return null
  const s = datState(state)
  return snap.regions.find((r) => r.states.includes(s)) ?? null
}

export function ltOf(snap: DatSnapshot, state: string | null): DatLt | null {
  if (!state) return null
  const code = state.trim().toUpperCase()
  // /lt отдаёт KS, регионы — KA: искали по KA, и у Канзаса рынка не было вовсе.
  return snap.lt[code] ?? snap.lt[datState(code)] ?? null
}

export type RegionState = { code: string; ratio: number }

/**
 * Штаты региона DAT по грузам на трак — столбец под ставкой региона: два лучших, два из
 * середины и два худших. Ставок за милю по штатам в открытом DAT нет, только по регионам,
 * поэтому штат оценивается тем, насколько легко там найти груз. В регионе меньше шести
 * штатов (в South их пять) середина короче, и ни один штат не повторяется.
 */
export function regionStates(snap: DatSnapshot, states: string[]): Record<'best' | 'middle' | 'worst', RegionState[]> {
  const rows = states
    .map((s) => (s === 'KA' ? 'KS' : s))
    .map((code) => ({ code, ratio: ltOf(snap, code)?.ratio }))
    .filter((r): r is RegionState => r.ratio != null)
    .sort((a, b) => b.ratio - a.ratio)
  const best = rows.slice(0, 2)
  const rest = rows.slice(best.length)
  const worst = rest.slice(Math.max(0, rest.length - 2))
  const inner = rest.slice(0, rest.length - worst.length)
  const from = Math.max(0, Math.floor((inner.length - 2) / 2))
  return { best, middle: inner.slice(from, from + 2), worst }
}

export type DatHeat = 'hot' | 'warm' | 'cold'

/**
 * «Горячий» ли штат — относительно медианы по всем штатам этой же серии. Абсолютных
 * порогов нет и быть не может: у Van обычное соотношение 3–8, у Flatbed 20–60, одна
 * и та же цифра значит противоположное.
 */
export function ltHeat(snap: DatSnapshot, ratio: number): DatHeat {
  const mid = ltMedian(snap)
  if (!mid) return 'warm'
  if (ratio >= mid * 1.25) return 'hot'
  if (ratio <= mid * 0.8) return 'cold'
  return 'warm'
}

/** Медиана грузов на трак по всем штатам серии — точка отсчёта горячести и простоя
 * в «Куда отправить трак» (lib/route-plan-core.ts). 0 — соотношений в снимке нет. */
export function ltMedian(snap: DatSnapshot): number {
  const all = Object.values(snap.lt)
    .map((x) => x.ratio)
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b)
  return all.length ? all[Math.floor(all.length / 2)]! : 0
}

/**
 * Рынок для направления. Ориентир — регион ПОГРУЗКИ: ставка DAT по региону — это
 * цена исходящих из него грузов, ровно то, с чем сравнивают предложение брокера.
 * Регион доставки показываем рядом: он говорит, как дорого будет выбраться обратно.
 */
export function laneMarket(
  snap: DatSnapshot,
  origin: string | null,
  destination: string | null,
): {
  origin: { state: string; region: DatRegion | null; lt: DatLt | null } | null
  dest: { state: string; region: DatRegion | null; lt: DatLt | null } | null
  rpm: number | null
} {
  const os = stateFromPlace(origin)
  const ds = stateFromPlace(destination)
  const o = os ? { state: os, region: regionOf(snap, os), lt: ltOf(snap, os) } : null
  const d = ds ? { state: ds, region: regionOf(snap, ds), lt: ltOf(snap, ds) } : null
  return { origin: o, dest: d, rpm: o?.region?.rpm ?? d?.region?.rpm ?? null }
}

/**
 * Ставка DAT по региону погрузки — ориентир для груза, у которого своей рыночной ставки
 * нет. Регион доставки сюда не подставляется: сравнивают с ценой грузов, выходящих из
 * региона погрузки. Код региона DAT пишет капсом (NORTH) — людям показываем «North».
 */
export function originRate(snap: DatSnapshot, origin: string | null): { rpm: number; region: string } | null {
  const region = laneMarket(snap, origin, null).origin?.region
  return region ? { rpm: region.rpm, region: region.code.charAt(0) + region.code.slice(1).toLowerCase() } : null
}

/** Ставка груза против рынка: разница в процентах и цвет. ±10% — ещё «в рынке». */
export function marketVerdict(loadRpm: number, marketRpm: number): { diff: number; tone: 'good' | 'warn' | 'bad' } {
  const diff = ((loadRpm - marketRpm) / marketRpm) * 100
  return { diff, tone: diff >= 10 ? 'good' : diff <= -10 ? 'bad' : 'warn' }
}

/** «+8%» / «-12%» — как пишет карточка груза, округлено до процента. */
export function pctText(diff: number): string {
  const n = Math.round(diff)
  return `${n > 0 ? '+' : ''}${n}%`
}

/**
 * Рыночная ставка груза — то же правило, что в карточке груза, чтобы список, брокер и
 * карточка не расходились: вписанная в груз (spotRpm) главнее, иначе DAT по региону
 * погрузки. Нет ни того ни другого — null, сравнивать не с чем.
 */
export function loadMarketRpm(snap: DatSnapshot | null, load: { spotRpm: number | null; origin: string | null }): number | null {
  if (load.spotRpm && load.spotRpm > 0) return load.spotRpm
  return snap ? (originRate(snap, load.origin)?.rpm ?? null) : null
}

/**
 * Средняя ставка набора грузов против рынка тех же грузов — неделя парка, брокер.
 * Вес — гружёные мили: DAT считает ставку за гружёную милю, а среднее от процентов дало
 * бы короткому дорогому рейсу столько же голоса, сколько рейсу через полстраны. Грузы без
 * рыночной ставки, миль или ставки не участвуют ни в числителе, ни в знаменателе.
 */
export function versusMarket(
  rows: { rate: number; loadedMiles: number; market: number | null }[],
): { rpm: number; market: number; diff: number; tone: 'good' | 'warn' | 'bad'; loads: number } | null {
  let rate = 0
  let miles = 0
  let market = 0
  let loads = 0
  for (const r of rows) {
    if (!r.market || !(r.loadedMiles > 0) || !(r.rate > 0)) continue
    rate += r.rate
    miles += r.loadedMiles
    market += r.market * r.loadedMiles
    loads++
  }
  if (!miles) return null
  const rpm = rate / miles
  return { rpm, market: market / miles, ...marketVerdict(rpm, market / miles), loads }
}

/**
 * Штаты США для раскраски карты: грузов на трак и горячесть от медианы серии. Коды —
 * почтовые, как у подписей карты (Канзас — KS, даже если DAT пришлёт KA); провинции Канады
 * в ответе остаются — карте их рисовать нечем, а в медиану серии они входят и так.
 */
export function ltStates(snap: DatSnapshot): Record<string, { ratio: number; heat: DatHeat }> {
  const out: Record<string, { ratio: number; heat: DatHeat }> = {}
  for (const [code, lt] of Object.entries(snap.lt)) out[code === 'KA' ? 'KS' : code] = { ratio: lt.ratio, heat: ltHeat(snap, lt.ratio) }
  return out
}

/**
 * Разбор ответов DAT. Каждый проверяется по форме: сервис неофициальный, и если он
 * однажды поменяет поля, лучше честно не показать рынок, чем показать мусор.
 */
export function parseRegions(raw: unknown): DatRegion[] | null {
  if (!Array.isArray(raw)) return null
  const out: DatRegion[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const rpm = Number(r?.tripRatePerMileInDollars)
    const code = typeof r?.regionCode === 'string' ? r.regionCode : null
    const states = Array.isArray(r?.stateInRegion) ? (r.stateInRegion as unknown[]).filter((s): s is string => typeof s === 'string') : []
    // Ставка за милю вне 0.5–15 — это не рынок, а поломка ответа.
    if (!code || !states.length || !Number.isFinite(rpm) || rpm < 0.5 || rpm > 15) continue
    out.push({ code, states, rpm })
  }
  return out.length ? out : null
}

export function parseLt(raw: unknown): Record<string, DatLt> | null {
  if (!Array.isArray(raw)) return null
  const out: Record<string, DatLt> = {}
  for (const r of raw as Record<string, unknown>[]) {
    const code = typeof r?.code === 'string' ? r.code.toUpperCase() : null
    const loads = Number(r?.loads)
    const trucks = Number(r?.trucks)
    const ratio = Number(r?.ratio)
    if (!code || !Number.isFinite(ratio) || ratio < 0) continue
    out[code] = { loads: Number.isFinite(loads) ? loads : 0, trucks: Number.isFinite(trucks) ? trucks : 0, ratio }
  }
  return Object.keys(out).length ? out : null
}

/** /trends: недельный сдвиг грузов на трак и ставки для своей серии. Проценты вне ±1000 —
 * поломка ответа, а не рынок. */
export function parseTrend(raw: unknown, equipment: DatEquipment): DatTrend | null {
  const name = equipment.charAt(0) + equipment.slice(1).toLowerCase()
  const t = (raw as Record<string, Record<string, unknown> | undefined> | null)?.[`${name.toLowerCase()}Trends`]
  const pct = (key: string) => {
    const v = t?.[key]
    return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1000 ? v : null
  }
  const trend = {
    ltWoW: pct(`weekOverWeek${name}LoadToTruckRatioChangeInPercentage`),
    rateWoW: pct(`weekOverWeek${name}SpotRateChangeInPercentage`),
  }
  return trend.ltWoW === null && trend.rateWoW === null ? null : trend
}

/** /{EQ}/loadAndTruckRatio: грузов на трак по стране понедельно — последние 52 недели. */
export function parseHistory(raw: unknown): DatWeek[] | null {
  const weekly = (raw as { oneMonthWeekly?: unknown } | null)?.oneMonthWeekly
  if (!Array.isArray(weekly)) return null
  const out: DatWeek[] = []
  for (const w of weekly as Record<string, unknown>[]) {
    const when = typeof w?.weekEndingWhen === 'string' ? w.weekEndingWhen.slice(0, 10) : ''
    const ratio = Number(w?.ratio)
    if (/^\d{4}-\d{2}-\d{2}$/.test(when) && Number.isFinite(ratio) && ratio > 0) out.push({ when, ratio: Math.round(ratio * 100) / 100 })
  }
  out.sort((a, b) => a.when.localeCompare(b.when))
  return out.length >= 2 ? out.slice(-52) : null
}

export function parseFuel(raw: unknown): { when: string; price: number } | null {
  const r = raw as Record<string, unknown> | null
  const price = Number(r?.pricePerGallonUSD)
  const when = typeof r?.when === 'string' ? r.when : null
  return when && Number.isFinite(price) && price > 1 && price < 15 ? { when, price } : null
}
