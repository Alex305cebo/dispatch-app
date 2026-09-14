// «Прошлые грузы в штате — спроси брокера о новых»: наши грузы с пикапом или выгрузкой
// в штате, сгруппированные по брокеру. У брокера там был фрахт — ему и звонят, пока трак
// едет туда или только что освободился. Чистая функция; выборка — lib/backhaul.ts.

export type StateLoadRow = {
  id: number
  origin: string | null
  destination: string | null
  rate: number
  broker_name: string | null
  broker_mc: string | null
  broker_phone: string | null
  broker_email: string | null
  /** yyyy-mm-dd — пикап, у старых грузов дата заведения. */
  day: string
}

export type StateLoad = { id: number; day: string; route: string; rate: number; pickup: boolean; delivery: boolean }

export type StateBroker = {
  key: string
  name: string
  mc: string | null
  phone: string | null
  email: string | null
  payDays: number | null
  /** Сколько всего наших грузов в штате с этим брокером. */
  total: number
  /** Самые свежие, не больше SHOW. */
  loads: StateLoad[]
}

const SHOW = 3
const MAX_BROKERS = 8

export function stateBrokers(
  rows: StateLoadRow[],
  state: string,
  payDaysOf: (mc: string | null, name: string | null) => number | null,
): StateBroker[] {
  const inState = new RegExp(`,\\s*${state}\\b`, 'i')
  const acc = new Map<string, StateBroker & { all: StateLoad[] }>()
  for (const r of rows) {
    const key = r.broker_mc?.trim() || (r.broker_name ?? '').trim().toLowerCase()
    if (!key) continue
    const pickup = inState.test(r.origin ?? '')
    const delivery = inState.test(r.destination ?? '')
    if (!pickup && !delivery) continue
    let b = acc.get(key)
    if (!b) {
      b = {
        key,
        name: r.broker_name?.trim() || `MC ${r.broker_mc}`,
        mc: r.broker_mc,
        phone: r.broker_phone,
        email: r.broker_email,
        payDays: payDaysOf(r.broker_mc, r.broker_name),
        total: 0,
        loads: [],
        all: [],
      }
      acc.set(key, b)
    }
    b.phone ??= r.broker_phone
    b.email ??= r.broker_email
    b.all.push({
      id: r.id,
      day: r.day.slice(0, 10),
      route: `${r.origin ?? '—'} → ${r.destination ?? '—'}`,
      rate: Number(r.rate) || 0,
      pickup,
      delivery,
    })
  }
  return [...acc.values()]
    .map(({ all, ...b }) => {
      const sorted = all.sort((x, y) => y.day.localeCompare(x.day) || y.id - x.id)
      return { ...b, total: sorted.length, loads: sorted.slice(0, SHOW) }
    })
    .sort((a, b) => b.loads[0]!.day.localeCompare(a.loads[0]!.day) || b.total - a.total)
    .slice(0, MAX_BROKERS)
}
