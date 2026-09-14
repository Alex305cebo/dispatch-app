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

export type DatSnapshot = {
  equipment: DatEquipment
  /** Когда забрали у DAT, мс. */
  at: number
  regions: DatRegion[]
  lt: Record<string, DatLt>
  fuel: { when: string; price: number } | null
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

/** DAT пишет Канзас как KA, а не KS — без этого груз из Канзаса выпадал бы из регионов. */
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
  return snap.lt[datState(state)] ?? null
}

/**
 * «Горячий» ли штат — относительно медианы по всем штатам этой же серии. Абсолютных
 * порогов нет и быть не может: у Van обычное соотношение 3–8, у Flatbed 20–60, одна
 * и та же цифра значит противоположное.
 */
export function ltHeat(snap: DatSnapshot, ratio: number): 'hot' | 'warm' | 'cold' {
  const all = Object.values(snap.lt)
    .map((x) => x.ratio)
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b)
  if (!all.length) return 'warm'
  const mid = all[Math.floor(all.length / 2)]!
  if (ratio >= mid * 1.25) return 'hot'
  if (ratio <= mid * 0.8) return 'cold'
  return 'warm'
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

export function parseFuel(raw: unknown): { when: string; price: number } | null {
  const r = raw as Record<string, unknown> | null
  const price = Number(r?.pricePerGallonUSD)
  const when = typeof r?.when === 'string' ? r.when : null
  return when && Number.isFinite(price) && price > 1 && price < 15 ? { when, price } : null
}
