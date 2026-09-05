import { sql } from '@/lib/db'
import { stateOfCity } from '@/lib/toll-spend'
import { listOurBrokers } from '@/lib/brokers'

export type BackhaulBroker = {
  key: string
  name: string
  mc: string | null
  phone: string | null
  email: string | null
  /** Сколько раз возили ИЗ этого штата с этим брокером. */
  loads: number
  avgRate: number
  rpm: number
  lastDate: string
  payDays: number | null
  /** Пример направления — откуда куда возили в последний раз. */
  lastRoute: string
}

/**
 * «Кому звонить за обратным грузом»: брокеры, с которыми уже возили ИЗ штата
 * выгрузки. Пока трак едет на выгрузку, диспетчер ищет следующий груз — и первым
 * делом звонит тем, кто уже давал грузы из этого региона: у них есть контакт,
 * известна ставка и известно, как они платят. Список строится по своей истории,
 * без внешних сервисов.
 */
export async function backhaulBrokers(
  companyId: 'default' | 'demo',
  destination: string | null,
): Promise<{ state: string; brokers: BackhaulBroker[] } | null> {
  const state = stateOfCity(destination)
  if (!state) return null
  const rows = (await sql`
    SELECT id, origin, destination, rate, loaded_miles, deadhead_miles, broker_name, broker_mc, broker_phone, broker_email,
           COALESCE(pickup_date::text, created_at::text) AS day
    FROM loads
    WHERE company_id = ${companyId}
      AND status NOT IN ('quoted', 'cancelled')
      AND origin ~* ${`,\\s*${state}\\b`}
      AND (broker_name IS NOT NULL OR broker_mc IS NOT NULL)
    ORDER BY created_at DESC
    LIMIT 400`) as {
    id: number
    origin: string
    destination: string | null
    rate: number
    loaded_miles: number
    deadhead_miles: number
    broker_name: string | null
    broker_mc: string | null
    broker_phone: string | null
    broker_email: string | null
    day: string
  }[]
  if (!rows.length) return { state, brokers: [] }

  const our = await listOurBrokers(companyId)
  const payByMc = new Map(our.filter((b) => b.mc).map((b) => [b.mc!, b.payDays]))
  const payByName = new Map(our.map((b) => [(b.name ?? '').toLowerCase(), b.payDays]))

  const acc = new Map<string, BackhaulBroker & { gross: number; miles: number }>()
  for (const r of rows) {
    const key = r.broker_mc?.trim() || (r.broker_name ?? '').trim().toLowerCase()
    if (!key) continue
    const found = acc.get(key)
    const b: BackhaulBroker & { gross: number; miles: number } = found ?? {
      key,
      name: r.broker_name?.trim() || `MC ${r.broker_mc}`,
      mc: r.broker_mc,
      phone: r.broker_phone,
      email: r.broker_email,
      loads: 0,
      avgRate: 0,
      rpm: 0,
      lastDate: r.day.slice(0, 10),
      payDays:
        (r.broker_mc ? payByMc.get(r.broker_mc) : undefined) ??
        payByName.get((r.broker_name ?? '').toLowerCase()) ??
        null,
      lastRoute: `${r.origin} → ${r.destination ?? '—'}`,
      gross: 0,
      miles: 0,
    }
    if (!found) acc.set(key, b)
    b.loads += 1
    b.gross += Number(r.rate) || 0
    b.miles += (Number(r.loaded_miles) || 0) + (Number(r.deadhead_miles) || 0)
    if (!b.phone && r.broker_phone) b.phone = r.broker_phone
    if (!b.email && r.broker_email) b.email = r.broker_email
  }
  const brokers = [...acc.values()]
    .map((b) => ({
      ...b,
      avgRate: b.loads ? b.gross / b.loads : 0,
      rpm: b.miles > 0 ? b.gross / b.miles : 0,
    }))
    .sort((a, b) => b.loads - a.loads || b.lastDate.localeCompare(a.lastDate))
    .slice(0, 8)
  return { state, brokers }
}
