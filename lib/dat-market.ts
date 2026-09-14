import { getSetting, setSetting } from '@/lib/settings'
import { parseFuel, parseLt, parseRegions, type DatEquipment, type DatSnapshot } from './dat-market-core.ts'

export * from './dat-market-core.ts'

/**
 * Рынок DAT из интернета: публичный сервис, на котором работает dat.com/trendlines.
 * Ключа, куки и авторизации нет — нужны только заголовки Origin/Referer его же
 * страницы. Нашли его 31.08.2026, разбирая бандл страницы Trendlines.
 *
 * Отдаёт без токена: ставку за милю по пяти регионам, соотношение грузов к тракам
 * по штатам и цену дизеля. Национальные средние и тренды — только с токеном DAT.
 *
 * Кэш в settings: DAT обновляет эти цифры раз в неделю, а страница груза
 * открывается на каждый рейт-кон. Кнопка «Обновить» может попросить свежие данные
 * мимо кэша, но не чаще раза в 5 минут — сервис чужой и неофициальный, долбить его
 * нельзя, иначе однажды закроют и для нас.
 */

const BASE = 'https://analytics.api.dat.com/v2/trendlines'
const PAGE = 'https://iq.trendlines-prod.prod.dat.com'
const TTL_MS = 6 * 3_600_000
const FORCE_FLOOR_MS = 5 * 60_000

async function getJson(path: string): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(BASE + path, {
      signal: ctrl.signal,
      headers: { Origin: PAGE, Referer: PAGE + '/', Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function readCache(raw: string | null): DatSnapshot | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as DatSnapshot
    return s && Array.isArray(s.regions) && s.lt && typeof s.at === 'number' ? s : null
  } catch {
    return null
  }
}

/**
 * Снимок рынка по серии. `force` — кнопка «Обновить» на странице: мимо суточного
 * кэша, но не чаще раза в пять минут. Если DAT не ответил, отдаём последний
 * сохранённый снимок с его датой — старые цифры с подписанной датой полезнее, чем
 * пустой блок, — и `stale: true`, чтобы страница это показала.
 */
export async function datSnapshot(
  equipment: DatEquipment,
  opts: { force?: boolean } = {},
): Promise<(DatSnapshot & { stale: boolean }) | null> {
  const key = `dat_trendlines_${equipment}`
  const cached = readCache(await getSetting(key))
  const age = cached ? Date.now() - cached.at : Infinity
  if (cached && (opts.force ? age < FORCE_FLOOR_MS : age < TTL_MS)) return { ...cached, stale: false }

  const [regionsRaw, ltRaw, fuelRaw] = await Promise.all([
    getJson(`/${equipment}/regionalRates`),
    getJson(`/lt/${equipment}`),
    getJson('/fuel'),
  ])
  const regions = parseRegions(regionsRaw)
  const lt = parseLt(ltRaw)
  if (!regions || !lt) return cached ? { ...cached, stale: true } : null

  const snap: DatSnapshot = { equipment, at: Date.now(), regions, lt, fuel: parseFuel(fuelRaw) ?? cached?.fuel ?? null }
  await setSetting(key, JSON.stringify(snap)).catch(() => {})
  return { ...snap, stale: false }
}
