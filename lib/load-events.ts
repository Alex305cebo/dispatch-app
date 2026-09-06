import { sql } from '@/lib/db'

export type LoadEventKind = 'arrived_pickup' | 'loaded' | 'arrived_delivery' | 'delivered' | 'note' | 'photo'

export type LoadEvent = {
  id: number
  loadId: number | null
  truckId: number | null
  kind: LoadEventKind
  note: string | null
  at: string
}

/**
 * Хронология рейса от водителя: приехал на погрузку, загрузился, приехал на
 * выгрузку, выгрузился, сообщение диспетчеру, фото. Пишется со страницы водителя
 * (app/api/driver), читается диспетчером на странице груза. Время «приехал» —
 * это и есть доказательство детеншена, которое раньше никто не записывал.
 */
export async function addLoadEvent(
  companyId: 'default' | 'demo',
  loadId: number | null,
  truckId: number | null,
  kind: LoadEventKind,
  note: string | null = null,
): Promise<void> {
  await sql`INSERT INTO load_events (company_id, load_id, truck_id, kind, note) VALUES (${companyId}, ${loadId}, ${truckId}, ${kind}, ${note})`
}

export async function listLoadEvents(companyId: 'default' | 'demo', loadId: number): Promise<LoadEvent[]> {
  const rows = (await sql`
    SELECT id, load_id, truck_id, kind, note, at FROM load_events
    WHERE company_id = ${companyId} AND load_id = ${loadId}
    ORDER BY at ASC, id ASC`) as { id: number; load_id: number | null; truck_id: number | null; kind: LoadEventKind; note: string | null; at: string }[]
  return rows.map((r) => ({ id: r.id, loadId: r.load_id, truckId: r.truck_id, kind: r.kind, note: r.note, at: String(r.at) }))
}

/** Последние сообщения водителей за сутки — для уведомлений диспетчеру. */
export async function recentDriverNotes(companyId: 'default' | 'demo'): Promise<(LoadEvent & { truckNumber: string | null })[]> {
  const rows = (await sql`
    SELECT e.id, e.load_id, e.truck_id, e.kind, e.note, e.at, t.number
    FROM load_events e LEFT JOIN trucks t ON t.id = e.truck_id
    WHERE e.company_id = ${companyId} AND e.kind = 'note' AND e.at > now() - interval '24 hours'
    ORDER BY e.at DESC LIMIT 20`) as { id: number; load_id: number | null; truck_id: number | null; kind: LoadEventKind; note: string | null; at: string; number: string | null }[]
  return rows.map((r) => ({ id: r.id, loadId: r.load_id, truckId: r.truck_id, kind: r.kind, note: r.note, at: String(r.at), truckNumber: r.number }))
}

/** Убрать ошибочную отметку. Возвращает груз, чтобы вызывающий обновил страницу. */
export async function deleteLoadEvent(companyId: 'default' | 'demo', id: number): Promise<number | null> {
  const rows = (await sql`DELETE FROM load_events WHERE id = ${id} AND company_id = ${companyId} RETURNING load_id`) as { load_id: number | null }[]
  return rows[0]?.load_id ?? null
}

/** Поправить время отметки: от него считается детеншен, и нажатая на час раньше
 * кнопка «Приехал» завышает сумму в письме брокеру. */
export async function updateLoadEventAt(companyId: 'default' | 'demo', id: number, atIso: string): Promise<number | null> {
  const rows = (await sql`UPDATE load_events SET at = ${atIso} WHERE id = ${id} AND company_id = ${companyId} RETURNING load_id`) as { load_id: number | null }[]
  return rows[0]?.load_id ?? null
}
