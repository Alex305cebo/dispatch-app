// Чтение учёта оплат из базы (правила — lib/payments.ts).
import 'server-only'
import { sql } from './db.ts'
import { getSetting } from './settings.ts'
import { DEFAULT_FACTORING, type FactoringSettings, type LoadPayment, type PayStage, type PayVia } from './payments.ts'

type Row = {
  load_id: number
  method: 'factoring' | 'direct'
  factor_name: string | null
  stage: PayStage
  submitted_on: Date | string | null
  factor_ref: string | null
  funded_on: Date | string | null
  advance_amount: number | null
  fee_amount: number | null
  closed_on: Date | string | null
  rejected_on: Date | string | null
  reject_reason: string | null
  chargeback_on: Date | string | null
  chargeback_amount: number | null
  paid_via: PayVia | null
  paid_on: Date | string | null
  paid_amount: number | null
  paid_ref: string | null
  note: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')
/** DATE приходит полуночью по времени сервера (lib/db.ts) — берём местные поля. */
const day = (v: Date | string | null): string | null => {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
}

function rowToPayment(r: Row): LoadPayment {
  return {
    loadId: r.load_id,
    method: r.method,
    factorName: r.factor_name,
    stage: r.stage,
    submittedOn: day(r.submitted_on),
    factorRef: r.factor_ref,
    fundedOn: day(r.funded_on),
    advanceAmount: r.advance_amount,
    feeAmount: r.fee_amount,
    closedOn: day(r.closed_on),
    rejectedOn: day(r.rejected_on),
    rejectReason: r.reject_reason,
    chargebackOn: day(r.chargeback_on),
    chargebackAmount: r.chargeback_amount,
    paidVia: r.paid_via,
    paidOn: day(r.paid_on),
    paidAmount: r.paid_amount,
    paidRef: r.paid_ref,
    note: r.note,
  }
}

/** Оплаты грузов компании (или только перечисленных) — по id груза. */
export async function paymentsByLoad(companyId: string, loadIds?: number[]): Promise<Map<number, LoadPayment>> {
  if (loadIds && !loadIds.length) return new Map()
  const rows = (loadIds
    ? await sql`SELECT * FROM load_payments WHERE company_id = ${companyId} AND load_id IN (${loadIds})`
    : await sql`SELECT * FROM load_payments WHERE company_id = ${companyId}`) as Row[]
  return new Map(rows.map((r) => [r.load_id, rowToPayment(r)]))
}

export async function paymentFor(companyId: string, loadId: number): Promise<LoadPayment | null> {
  return (await paymentsByLoad(companyId, [loadId])).get(loadId) ?? null
}

export const FACTORING_KEY = 'factoring_settings'

export async function factoringSettings(): Promise<FactoringSettings> {
  try {
    const raw = await getSetting(FACTORING_KEY)
    if (!raw) return DEFAULT_FACTORING
    const v = JSON.parse(raw) as Partial<FactoringSettings>
    return {
      name: typeof v.name === 'string' && v.name.trim() ? v.name.trim() : DEFAULT_FACTORING.name,
      recourse: typeof v.recourse === 'boolean' ? v.recourse : DEFAULT_FACTORING.recourse,
      recourseDays: Number.isFinite(v.recourseDays) && v.recourseDays! > 0 ? Math.round(v.recourseDays!) : DEFAULT_FACTORING.recourseDays,
    }
  } catch {
    return DEFAULT_FACTORING
  }
}
