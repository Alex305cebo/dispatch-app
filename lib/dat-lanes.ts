import { sql } from '@/lib/db'
import { rpmTableFrom, type RpmRow, type RpmTable } from '@/lib/rpm-bench-core'
import { brokerCut, targetBand, type BrokerCut } from '@/lib/broker-cut'

/**
 * Ставки по направлениям одного источника — по штату погрузки И доставки: «TX>GA» и «в GA»,
 * по сериям. Для «Куда отправить трак»: напротив штата назначения — настоящая цифра, не
 * формула. Источники не смешиваем: у каждого своя подпись в строке направления.
 */
export async function laneRpmTables(companyId: 'default' | 'demo', source: 'dat' | 'warp'): Promise<Record<string, RpmTable>> {
  const rows = (await sql`
    SELECT equipment, origin_state AS f, dest_state AS t, SUM(spot_rate) AS rate, SUM(miles) AS miles, COUNT(*) AS n
    FROM dat_lanes
    WHERE company_id = ${companyId} AND source = ${source} AND dest_state IS NOT NULL AND seen_on >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY equipment, origin_state, dest_state`) as { equipment: string; f: string | null; t: string; rate: number | string; miles: number | string; n: number | string }[]
  const byEq = new Map<string, RpmRow[]>()
  for (const r of rows) {
    const list = byEq.get(r.equipment) ?? []
    list.push({ from: r.f, to: r.t, rate: Number(r.rate), miles: Number(r.miles), n: Number(r.n) })
    byEq.set(r.equipment, list)
  }
  return Object.fromEntries([...byEq].map(([eq, list]) => [eq, rpmTableFrom(list)]))
}

/**
 * Сколько от цены грузоотправителя доходило до трака — по нашим доставленным грузам за
 * полгода против котировок Warp по тому же направлению. Штат берём из конца строки
 * «City, ST»: так грузы и лежат. Несколько котировок по одному направлению усредняются,
 * иначе груз считался бы столько раз, сколько дней собиралась ставка.
 */
export async function brokerCutFromLoads(companyId: 'default' | 'demo'): Promise<BrokerCut> {
  const rows = (await sql`
    SELECT l.rate / l.loaded_miles AS ours, AVG(d.spot_rpm) AS shipper
    FROM loads l
    JOIN dat_lanes d
      ON d.company_id = l.company_id AND d.source = 'warp'
     AND d.origin_state = UPPER(RIGHT(l.origin, 2)) AND d.dest_state = UPPER(RIGHT(l.destination, 2))
    WHERE l.company_id = ${companyId} AND l.loaded_miles > 100 AND l.rate > 0
      AND l.pickup_date >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)
    GROUP BY l.id, l.rate, l.loaded_miles`) as { ours: number | string; shipper: number | string }[]
  return brokerCut(rows.map((r) => ({ ours: Number(r.ours), shipper: Number(r.shipper) })))
}

/**
 * Цель торга по маршруту груза, $/mi: цена грузоотправителя (Warp за 30 дней по этому
 * направлению) и доля, которая доходит до трака. Нет котировок по направлению — null,
 * и карточка груза про цель молчит.
 */
export async function laneTarget(
  companyId: 'default' | 'demo',
  equipment: string,
  from: string | null,
  to: string | null,
): Promise<{ low: number; high: number; shipper: number; n: number } | null> {
  if (!from || !to) return null
  const rows = (await sql`
    SELECT SUM(spot_rate) AS rate, SUM(miles) AS miles
    FROM dat_lanes
    WHERE company_id = ${companyId} AND source = 'warp' AND equipment = ${equipment}
      AND origin_state = ${from} AND dest_state = ${to} AND seen_on >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`) as {
    rate: number | string | null
    miles: number | string | null
  }[]
  const rate = Number(rows[0]?.rate ?? 0)
  const miles = Number(rows[0]?.miles ?? 0)
  if (!(rate > 0) || !(miles > 0)) return null
  const shipper = rate / miles
  const cut = await brokerCutFromLoads(companyId)
  const band = targetBand(shipper, cut)
  return band ? { ...band, shipper, n: cut.n } : null
}
