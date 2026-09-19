'use server'

// Отметки оплаты груза — только у тех, кому открыты финансы (lib/capabilities.ts
// 'finances': администратор и бухгалтер; у диспетчера доступ снимается в админке).
// Правила этапов — lib/payments.ts; здесь запись и согласование со статусом груза:
// деньги пришли → «Оплачен» с датой получения, откатили → снова «Доставлен».

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { companyScope, demoReadOnly, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { t, type MsgKey } from '@/lib/i18n'
import { getLocale } from '@/lib/i18n-server'
import { setSetting } from '@/lib/settings'
import { FACTORING_KEY, factoringSettings, paymentFor } from '@/lib/payments-server'
import { defaultFee, isIsoDay, moneyIn, PAY_VIA, previousStage, type FactoringSettings, type PayVia } from '@/lib/payments'

type Fail = { error: string }
type Done = { ok: true; count: number }

async function guard(): Promise<Fail | { companyId: 'default' | 'demo'; userId: number }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const user = await getCurrentUser()
  if (!user || !(await can(user, 'finances'))) return { error: t(await getLocale(), 'actions.noAccess') }
  return { companyId: await companyScope(), userId: user.id }
}

const err = async (key: MsgKey): Promise<Fail> => ({ error: t(await getLocale(), key) })

/** Полдень по восточному времени того дня — чтобы дата не съезжала в отчётах по дням. */
const moment = (day: string) => new Date(`${day}T16:00:00Z`)

const ids = (list: unknown): number[] =>
  [...new Set((Array.isArray(list) ? list : [list]).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200)

const money = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : Number.NaN
}

const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

type LoadLite = { id: number; status: string; rate: number; factoring_percent: number | null }

async function loadsOf(companyId: string, list: number[]): Promise<LoadLite[]> {
  if (!list.length) return []
  return (await sql`
    SELECT l.id, l.status, l.rate, t.factoring_percent
    FROM loads l LEFT JOIN trucks t ON t.id = l.truck_id
    WHERE l.company_id = ${companyId} AND l.id IN (${list})`) as LoadLite[]
}

function refresh(loadIds: number[]) {
  revalidatePath('/docs')
  revalidatePath('/loads')
  revalidatePath('/brokers')
  revalidatePath('/', 'layout')
  for (const id of loadIds) revalidatePath(`/loads/${id}`)
}

/** Отправлены в факторинг (один груз или пакет). Только доставленные. */
export async function markSubmitted(loadIds: number[], on: string, ref?: string | null): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  if (!isIsoDay(on)) return err('payments.err.badDate')
  const s = await factoringSettings()
  const ok = (await loadsOf(g.companyId, ids(loadIds))).filter((l) => l.status === 'delivered')
  if (!ok.length) return err('payments.err.notDelivered')
  const factorRef = text(ref, 100)
  for (const l of ok) {
    await sql`
      INSERT INTO load_payments (load_id, company_id, method, factor_name, stage, submitted_on, factor_ref, updated_by)
      VALUES (${l.id}, ${g.companyId}, 'factoring', ${s.name}, 'submitted', ${on}, ${factorRef}, ${g.userId})
      ON DUPLICATE KEY UPDATE
        method = 'factoring', factor_name = VALUES(factor_name), stage = 'submitted',
        submitted_on = VALUES(submitted_on), factor_ref = COALESCE(VALUES(factor_ref), factor_ref),
        rejected_on = NULL, reject_reason = NULL, chargeback_on = NULL, chargeback_amount = NULL,
        updated_by = VALUES(updated_by), updated_at = NOW(6)`
  }
  const list = ok.map((l) => l.id)
  await sql`UPDATE loads SET invoiced_at = COALESCE(invoiced_at, ${moment(on)}) WHERE company_id = ${g.companyId} AND id IN (${list})`
  refresh(list)
  return { ok: true, count: ok.length }
}

/**
 * Факторинг перевёл деньги. Сумма аванса и комиссия — как пришли; не указаны —
 * комиссия по проценту факторинга из экономики трака, аванс = ставка − комиссия.
 */
export async function markFunded(
  items: { loadId: number; advance?: number | string | null; fee?: number | string | null }[],
  on: string,
): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  if (!isIsoDay(on)) return err('payments.err.badDate')
  const s = await factoringSettings()
  const byId = new Map((await loadsOf(g.companyId, ids(items.map((i) => i.loadId)))).map((l) => [l.id, l]))
  const done: number[] = []
  for (const it of items) {
    const l = byId.get(Number(it.loadId))
    if (!l || l.status !== 'delivered') continue
    const feeIn = money(it.fee)
    const advIn = money(it.advance)
    if (Number.isNaN(feeIn) || Number.isNaN(advIn)) return err('payments.err.badAmount')
    const fee = feeIn ?? defaultFee(l.rate, l.factoring_percent)
    const advance = advIn ?? Math.round((l.rate - fee) * 100) / 100
    await sql`
      INSERT INTO load_payments (load_id, company_id, method, factor_name, stage, submitted_on, funded_on, advance_amount, fee_amount, updated_by)
      VALUES (${l.id}, ${g.companyId}, 'factoring', ${s.name}, 'funded', ${on}, ${on}, ${advance}, ${fee}, ${g.userId})
      ON DUPLICATE KEY UPDATE
        method = 'factoring', factor_name = COALESCE(factor_name, VALUES(factor_name)), stage = 'funded',
        submitted_on = COALESCE(submitted_on, VALUES(submitted_on)),
        funded_on = VALUES(funded_on), advance_amount = VALUES(advance_amount), fee_amount = VALUES(fee_amount),
        rejected_on = NULL, reject_reason = NULL, chargeback_on = NULL, chargeback_amount = NULL,
        updated_by = VALUES(updated_by), updated_at = NOW(6)`
    await sql`
      UPDATE loads SET status = 'paid', paid_at = ${moment(on)}, invoiced_at = COALESCE(invoiced_at, ${moment(on)})
      WHERE id = ${l.id} AND company_id = ${g.companyId}`
    done.push(l.id)
  }
  if (!done.length) return err('payments.err.notDelivered')
  refresh(done)
  return { ok: true, count: done.length }
}

/** Брокер рассчитался с факторингом — по грузу больше ничего не ждём. */
export async function markClosed(loadIds: number[], on: string): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  if (!isIsoDay(on)) return err('payments.err.badDate')
  const list = ids(loadIds)
  if (!list.length) return err('payments.err.nothing')
  const res = await sql`
    UPDATE load_payments SET stage = 'closed', closed_on = ${on}, updated_by = ${g.userId}, updated_at = NOW(6)
    WHERE company_id = ${g.companyId} AND load_id IN (${list}) AND stage = 'funded'`
  if (!res.affectedRows) return err('payments.err.nothing')
  refresh(list)
  return { ok: true, count: res.affectedRows }
}

/** Факторинг не принял: брокер не одобрен, документы не те. Груз остаётся неоплаченным. */
export async function markRejected(loadId: number, on: string, reason: string): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  if (!isIsoDay(on)) return err('payments.err.badDate')
  const why = text(reason, 500)
  if (!why) return err('payments.err.needReason')
  const [l] = (await loadsOf(g.companyId, ids([loadId]))).filter((x) => x.status === 'delivered')
  if (!l) return err('payments.err.notDelivered')
  const s = await factoringSettings()
  await sql`
    INSERT INTO load_payments (load_id, company_id, method, factor_name, stage, rejected_on, reject_reason, updated_by)
    VALUES (${l.id}, ${g.companyId}, 'factoring', ${s.name}, 'rejected', ${on}, ${why}, ${g.userId})
    ON DUPLICATE KEY UPDATE stage = 'rejected', rejected_on = VALUES(rejected_on), reject_reason = VALUES(reject_reason),
      updated_by = VALUES(updated_by), updated_at = NOW(6)`
  refresh([l.id])
  return { ok: true, count: 1 }
}

/** Регресс: брокер не заплатил, факторинг вернул счёт и удержал деньги. Груз снова не оплачен. */
export async function markChargeback(loadId: number, on: string, amount?: number | string | null): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  if (!isIsoDay(on)) return err('payments.err.badDate')
  const p = await paymentFor(g.companyId, Number(loadId))
  if (!p || (p.stage !== 'funded' && p.stage !== 'closed')) return err('payments.err.nothing')
  const amt = money(amount)
  if (Number.isNaN(amt)) return err('payments.err.badAmount')
  await sql`
    UPDATE load_payments SET stage = 'chargeback', chargeback_on = ${on},
      chargeback_amount = ${amt ?? p.advanceAmount}, closed_on = NULL, updated_by = ${g.userId}, updated_at = NOW(6)
    WHERE load_id = ${p.loadId} AND company_id = ${g.companyId}`
  await sql`UPDATE loads SET status = 'delivered', paid_at = NULL WHERE id = ${p.loadId} AND company_id = ${g.companyId} AND status = 'paid'`
  refresh([p.loadId])
  return { ok: true, count: 1 }
}

/** Редкий случай без факторинга: брокер заплатил нам напрямую. */
export async function markPaidDirect(
  loadId: number,
  input: { via: PayVia; on: string; amount?: number | string | null; ref?: string | null },
): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  if (!isIsoDay(input.on)) return err('payments.err.badDate')
  if (!PAY_VIA.includes(input.via)) return err('payments.err.badMethod')
  const [l] = (await loadsOf(g.companyId, ids([loadId]))).filter((x) => x.status === 'delivered')
  if (!l) return err('payments.err.notDelivered')
  const amt = money(input.amount)
  if (Number.isNaN(amt)) return err('payments.err.badAmount')
  await sql`
    INSERT INTO load_payments (load_id, company_id, method, stage, paid_via, paid_on, paid_amount, paid_ref, updated_by)
    VALUES (${l.id}, ${g.companyId}, 'direct', 'paid', ${input.via}, ${input.on}, ${amt ?? l.rate}, ${text(input.ref, 100)}, ${g.userId})
    ON DUPLICATE KEY UPDATE method = 'direct', stage = 'paid', paid_via = VALUES(paid_via), paid_on = VALUES(paid_on),
      paid_amount = VALUES(paid_amount), paid_ref = VALUES(paid_ref),
      rejected_on = NULL, reject_reason = NULL, chargeback_on = NULL, chargeback_amount = NULL,
      updated_by = VALUES(updated_by), updated_at = NOW(6)`
  await sql`
    UPDATE loads SET status = 'paid', paid_at = ${moment(input.on)}, invoiced_at = COALESCE(invoiced_at, ${moment(input.on)})
    WHERE id = ${l.id} AND company_id = ${g.companyId}`
  refresh([l.id])
  return { ok: true, count: 1 }
}

/** Отменить последний шаг оплаты — ошиблись кнопкой или датой. */
export async function undoPaymentStep(loadId: number): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  const p = await paymentFor(g.companyId, Number(loadId))
  if (!p) return err('payments.err.nothing')
  const prev = previousStage(p)
  if (prev === null) {
    await sql`DELETE FROM load_payments WHERE load_id = ${p.loadId} AND company_id = ${g.companyId}`
    if (moneyIn(p.stage))
      await sql`UPDATE loads SET status = 'delivered', paid_at = NULL WHERE id = ${p.loadId} AND company_id = ${g.companyId} AND status = 'paid'`
    // Счёт ставила отправка в факторинг — снимаем его, если своего номера счёта у груза нет.
    if (p.submittedOn)
      await sql`UPDATE loads SET invoiced_at = NULL WHERE id = ${p.loadId} AND company_id = ${g.companyId} AND invoice_number IS NULL AND status <> 'paid'`
  } else if (prev === 'funded') {
    await sql`
      UPDATE load_payments SET stage = 'funded', closed_on = NULL, chargeback_on = NULL, chargeback_amount = NULL,
        updated_by = ${g.userId}, updated_at = NOW(6)
      WHERE load_id = ${p.loadId} AND company_id = ${g.companyId}`
    if (p.stage === 'chargeback' && p.fundedOn)
      await sql`UPDATE loads SET status = 'paid', paid_at = ${moment(p.fundedOn)} WHERE id = ${p.loadId} AND company_id = ${g.companyId}`
  } else {
    await sql`
      UPDATE load_payments SET stage = 'submitted', funded_on = NULL, advance_amount = NULL, fee_amount = NULL,
        rejected_on = NULL, reject_reason = NULL, updated_by = ${g.userId}, updated_at = NOW(6)
      WHERE load_id = ${p.loadId} AND company_id = ${g.companyId}`
    if (moneyIn(p.stage))
      await sql`UPDATE loads SET status = 'delivered', paid_at = NULL WHERE id = ${p.loadId} AND company_id = ${g.companyId} AND status = 'paid'`
  }
  refresh([p.loadId])
  return { ok: true, count: 1 }
}

export async function setPaymentNote(loadId: number, note: string): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  const res = await sql`
    UPDATE load_payments SET note = ${text(note, 1000)}, updated_by = ${g.userId}, updated_at = NOW(6)
    WHERE load_id = ${Number(loadId)} AND company_id = ${g.companyId}`
  if (!res.affectedRows) return err('payments.err.nothing')
  refresh([Number(loadId)])
  return { ok: true, count: 1 }
}

export async function saveFactoringSettings(input: FactoringSettings): Promise<Fail | Done> {
  const g = await guard()
  if ('error' in g) return g
  if (g.companyId === 'demo') return err('actions.demoReadOnly')
  const name = text(input.name, 60)
  const days = Math.round(Number(input.recourseDays))
  if (!name || !Number.isFinite(days) || days < 15 || days > 365) return err('payments.err.badSettings')
  await setSetting(FACTORING_KEY, JSON.stringify({ name, recourse: !!input.recourse, recourseDays: days }))
  revalidatePath('/docs')
  return { ok: true, count: 1 }
}
