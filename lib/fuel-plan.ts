import { getSetting, setSetting } from '@/lib/settings'
import { REGION_NAME, seriesFor, statesAlong, type FuelPlan, type FuelStop } from './fuel-plan-core.ts'

export { seriesFor, statesAlong, type FuelPlan, type FuelStop } from './fuel-plan-core.ts'

/**
 * План заправок: где по маршруту дизель дешевле. EIA публикует розничную цену
 * дизеля раз в неделю по регионам (PADD) и по девяти крупным штатам отдельно.
 * Каждый штат маршрута сводится к своей серии; разница между самым дорогим и
 * самым дешёвым штатом на полном баке — и есть цена «заправился не там».
 */

/** Цены EIA по нужным сериям, кэш на сутки в settings (одна запись на все серии). */
async function regionalDiesel(series: string[]): Promise<{ asOf: string; prices: Record<string, number> } | null> {
  const key = process.env.EIA_API_KEY
  if (!key || !series.length) return null
  const cacheKey = 'diesel_regions'
  const raw = await getSetting(cacheKey)
  let cache: { at: number; asOf: string; prices: Record<string, number> } | null = null
  if (raw) {
    try {
      cache = JSON.parse(raw)
    } catch {
      cache = null
    }
  }
  if (cache && Date.now() - cache.at < 24 * 3_600_000 && series.every((s) => s in cache!.prices)) {
    return { asOf: cache.asOf, prices: cache.prices }
  }
  // Одним запросом все нужные серии: свежая неделя по каждой.
  const facets = [...new Set([...series, ...Object.keys(cache?.prices ?? {})])].map((s) => `&facets[duoarea][]=${s}`).join('')
  const url =
    `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${key}` +
    `&frequency=weekly&data[0]=value&facets[product][]=EPD2D${facets}` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=60`
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as { response?: { data?: { period: string; duoarea: string; value: number | string }[] } }
    const rows = data.response?.data ?? []
    const prices: Record<string, number> = {}
    let asOf = ''
    for (const r of rows) {
      if (r.duoarea in prices) continue // строки отсортированы от свежих — первая и есть последняя неделя
      const v = Number(r.value)
      if (!Number.isFinite(v)) continue
      prices[r.duoarea] = v
      if (!asOf || r.period > asOf) asOf = r.period
    }
    if (!Object.keys(prices).length) return null
    await setSetting(cacheKey, JSON.stringify({ at: Date.now(), asOf, prices }))
    return { asOf, prices }
  } catch {
    return null
  }
}

/** План по маршруту: цена в каждом штате пути и где дешевле всего. null — без
 * ключа EIA, без маршрута или если EIA не ответил. */
export async function fuelPlan(coords: [number, number][], tankGal = 250): Promise<FuelPlan | null> {
  const states = statesAlong(coords)
  if (states.length < 2) return null
  const series = [...new Set(states.map(seriesFor).filter((s): s is string => !!s))]
  const data = await regionalDiesel(series)
  if (!data) return null
  const stops: FuelStop[] = []
  for (const state of states) {
    const s = seriesFor(state)
    const price = s ? data.prices[s] : undefined
    if (!s || price == null) continue
    stops.push({ state, series: s, region: s.startsWith('R') ? (REGION_NAME[s] ?? null) : null, price })
  }
  if (stops.length < 2) return null
  const cheapest = stops.reduce((a, b) => (b.price < a.price ? b : a))
  const priciest = stops.reduce((a, b) => (b.price > a.price ? b : a))
  return { asOf: data.asOf, stops, cheapest, priciest, tankSavings: (priciest.price - cheapest.price) * tankGal }
}
