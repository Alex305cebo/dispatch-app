import { sql } from '@/lib/db'
import { rpmTableFrom, type RpmRow, type RpmTable } from '@/lib/rpm-bench-core'

/**
 * Те же направления с доски — по штату погрузки И доставки: «TX>GA» и «в GA», по сериям.
 * Для «Куда отправить трак»: напротив штата назначения — настоящая ставка DAT, не формула.
 * Только строки DAT: в той же таблице живут другие источники (Warp и прочие) со своей
 * подписью, и в «ставку DAT RateView» они попадать не должны.
 */
export async function datRpmTables(companyId: 'default' | 'demo'): Promise<Record<string, RpmTable>> {
  const rows = (await sql`
    SELECT equipment, origin_state AS f, dest_state AS t, SUM(spot_rate) AS rate, SUM(miles) AS miles, COUNT(*) AS n
    FROM dat_lanes
    WHERE company_id = ${companyId} AND source = 'dat' AND dest_state IS NOT NULL AND seen_on >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY equipment, origin_state, dest_state`) as { equipment: string; f: string | null; t: string; rate: number | string; miles: number | string; n: number | string }[]
  const byEq = new Map<string, RpmRow[]>()
  for (const r of rows) {
    const list = byEq.get(r.equipment) ?? []
    list.push({ from: r.f, to: r.t, rate: Number(r.rate), miles: Number(r.miles), n: Number(r.n) })
    byEq.set(r.equipment, list)
  }
  return Object.fromEntries([...byEq].map(([eq, list]) => [eq, rpmTableFrom(list)]))
}
