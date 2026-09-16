import { sql } from '@/lib/db'
import type { OwnStateRpm } from '@/lib/own-state-rpm'

/**
 * Спот-ставка DAT по штату погрузки — из направлений, которые диспетчеры видели на доске
 * DAT One за последние 30 дней (таблица dat_lanes, пишет расширение DispatchPro через
 * /api/dat-lanes). Весь гросс на все мили, а не среднее средних; n — сколько направлений.
 * По сериям: VAN / REEFER / FLATBED — ставки у них разные.
 */
export async function datStateRpm(companyId: 'default' | 'demo'): Promise<Record<string, OwnStateRpm>> {
  const rows = (await sql`
    SELECT equipment, origin_state AS st, SUM(spot_rate) AS rate, SUM(miles) AS miles, COUNT(*) AS n
    FROM dat_lanes
    WHERE company_id = ${companyId} AND origin_state IS NOT NULL AND seen_on >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY equipment, origin_state`) as { equipment: string; st: string; rate: number | string; miles: number | string; n: number | string }[]
  const out: Record<string, OwnStateRpm> = {}
  for (const r of rows) {
    const miles = Number(r.miles)
    if (!(miles > 0)) continue
    ;(out[r.equipment] ??= {})[r.st] = { rpm: Math.round((Number(r.rate) / miles) * 100) / 100, n: Number(r.n) }
  }
  return out
}
