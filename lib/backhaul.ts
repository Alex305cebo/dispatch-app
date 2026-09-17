import { sql } from '@/lib/db'
import { stateOfCity } from '@/lib/toll-spend'
import { listOurBrokers } from '@/lib/brokers'
import { stateBrokers, type StateBroker, type StateLoadRow } from '@/lib/state-brokers'

/**
 * «Прошлые грузы в штате выгрузки — спроси брокера о новых». Пока трак едет на
 * выгрузку (или только что разгрузился), диспетчер ищет следующий груз — и звонит
 * брокерам, у которых там уже был фрахт: наши грузы с пикапом или выгрузкой в этом
 * штате. Группировка — lib/state-brokers.ts; по своей истории, без внешних сервисов.
 */
export async function backhaulBrokers(
  companyId: 'default' | 'demo',
  destination: string | null,
  excludeLoadId: number,
): Promise<{ state: string; brokers: StateBroker[] } | null> {
  const state = stateOfCity(destination)
  if (!state) return null
  const inState = `(?i),\\s*${state}\\b`
  const rows = (await sql`
    SELECT id, origin, destination, rate, broker_name, broker_mc, broker_phone, broker_email,
           COALESCE(CAST(pickup_date AS CHAR), CAST(created_at AS CHAR)) AS day
    FROM loads
    WHERE company_id = ${companyId}
      AND id <> ${excludeLoadId}
      AND status NOT IN ('quoted', 'cancelled')
      AND (origin REGEXP ${inState} OR destination REGEXP ${inState})
      AND (broker_name IS NOT NULL OR broker_mc IS NOT NULL)
    ORDER BY created_at DESC
    LIMIT 400`) as StateLoadRow[]
  if (!rows.length) return { state, brokers: [] }

  const our = await listOurBrokers(companyId)
  const payByMc = new Map(our.filter((b) => b.mc).map((b) => [b.mc!, b.payDays]))
  const payByName = new Map(our.map((b) => [(b.name ?? '').toLowerCase(), b.payDays]))
  return {
    state,
    brokers: stateBrokers(rows, state, (mc, name) => (mc ? payByMc.get(mc) : undefined) ?? payByName.get((name ?? '').toLowerCase()) ?? null),
  }
}
