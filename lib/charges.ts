import { sql } from './db.ts'
import type { ChargeKind, LoadCharge } from './charges-core.ts'

/** Начисления груза, старые первыми — в счёт и на карточку. */
export async function listCharges(companyId: 'default' | 'demo', loadId: number): Promise<LoadCharge[]> {
  const rows = (await sql`
    SELECT id, kind, amount, note, created_at FROM load_charges
    WHERE company_id = ${companyId} AND load_id = ${loadId} ORDER BY created_at ASC, id ASC`) as {
    id: number
    kind: ChargeKind
    amount: number
    note: string | null
    created_at: Date | string
  }[]
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: Number(r.amount),
    note: r.note,
    createdAt: new Date(r.created_at).toISOString(),
  }))
}
