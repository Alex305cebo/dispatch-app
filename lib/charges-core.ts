// Доп. начисления брокеру сверх ставки груза. Чистые типы — без базы, чтобы их видел
// клиентский компонент (components/load-charges.tsx). Запросы — в lib/charges.ts.

export type ChargeKind = 'detention' | 'lumper' | 'tonu' | 'layover' | 'stop_off' | 'other'

/** Порядок = порядок в выпадающем списке: сначала то, что бывает чаще. */
export const CHARGE_KINDS: ChargeKind[] = ['detention', 'lumper', 'tonu', 'layover', 'stop_off', 'other']

export type LoadCharge = {
  id: number
  kind: ChargeKind
  amount: number
  note: string | null
  createdAt: string
}

export const chargesTotal = (rows: { amount: number }[]) => rows.reduce((s, c) => s + c.amount, 0)

/** Подпись строки в счёте — по-английски, как и весь счёт. */
export function chargeLabel(kind: ChargeKind): string {
  return kind === 'stop_off' ? 'Stop-off' : kind === 'tonu' ? 'TONU' : kind[0]!.toUpperCase() + kind.slice(1)
}
