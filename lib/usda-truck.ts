import { after } from 'next/server'
import { getSetting, setSetting } from '@/lib/settings'
import { usdaTable, type RpmTable, type UsdaRow } from './rpm-bench-core.ts'

/**
 * USDA AMS Market News, «Refrigerated Truck Rates and Availability»: недельный отчёт
 * Минсельхоза США по продуктовым рейсам — район погрузки, город выгрузки, мили и ставка
 * за рейс. Открытые данные без ключа (agtransport.usda.gov, представление «последняя
 * неделя»). Это настоящие опубликованные ставки, а не оценка — единственный бесплатный
 * источник ставок по направлениям; для рефрижератора он прямой, для фургона не подходит.
 *
 * Обновляется раз в неделю. Держим три дня; протух — отдаём что есть, а свежее забираем
 * уже после ответа страницы, как снимок DAT (lib/dat-market.ts datCached).
 */
const URL = 'https://agtransport.usda.gov/resource/25pi-t6xr.json?$limit=500'
const KEY = 'usda_reefer_rates'
const TTL_MS = 3 * 86400_000

export type UsdaCache = { at: number; week: string | null; table: RpmTable }

export async function usdaReeferCached(): Promise<UsdaCache | null> {
  try {
    const raw = await getSetting(KEY)
    const cached = raw ? (JSON.parse(raw) as UsdaCache) : null
    if (!cached || Date.now() - cached.at >= TTL_MS) after(() => fetchUsda().catch(() => null))
    return cached
  } catch {
    return null
  }
}

async function fetchUsda(): Promise<void> {
  const res = await fetch(URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`USDA HTTP ${res.status}`)
  const { table, week } = usdaTable((await res.json()) as UsdaRow[])
  // Пустой ответ (сменили форму строк) не должен затирать прошлый — лучше старая неделя, чем ничего.
  if (!Object.keys(table.into).length) throw new Error('USDA: empty')
  await setSetting(KEY, JSON.stringify({ at: Date.now(), week, table } satisfies UsdaCache))
}
