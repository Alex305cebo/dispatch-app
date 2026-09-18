// Котировка Warp по паре индексов — открытый API без ключа (POST wearewarp.com/api/v1/ftl/quote):
// твёрдая цена за 53' Dry Van, которую можно забронировать. Это цена ГРУЗООТПРАВИТЕЛЯ, в ней
// маржа брокера (lib/broker-cut.ts) — в таблицу dat_lanes ложится под source='warp' и
// показывается только с подписью.
//
// Без базы и без '@/': этим же кодом пользуется scripts/lane-rates.mjs в CI (node 24 грузит .ts сам).

const QUOTE = 'https://www.wearewarp.com/api/v1/ftl/quote'

/** Понедельник следующей недели: котировка на рабочий день, а не на «сегодня поздно». */
export function nextMonday(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

/** Цена за рейс, доллары. Бросает с текстом причины: HTTP-код или «нет цены». */
export async function warpQuote(originZip: string, destZip: string, date = nextMonday()): Promise<number> {
  const res = await fetch(QUOTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origin_zip: originZip, destination_zip: destZip, pickup_date: date, pallets: 24, weight_lbs_per_pallet: 1600 }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as { price_usd?: unknown; error?: unknown }
  const price = Number(j?.price_usd)
  if (!(price > 0)) throw new Error(String(j?.error ?? 'нет цены'))
  return price
}

/** Индекс города «Fresno, CA» по открытому справочнику zippopotam; null — не нашёлся. */
export async function zipOfCity(city: string | null | undefined): Promise<string | null> {
  const m = String(city ?? '')
    .trim()
    .match(/^(.*),\s*([A-Za-z]{2})$/)
  if (!m) return null
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${m[2]!.toLowerCase()}/${encodeURIComponent(m[1]!.trim())}`, {
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { places?: { 'post code'?: string }[] }
    return j?.places?.[0]?.['post code'] ?? null
  } catch {
    return null
  }
}
