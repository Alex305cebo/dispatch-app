import { sql } from '@/lib/db'
import type { StopEv } from '@/lib/stops'

export type LoadEventKind = 'arrived_pickup' | 'loaded' | 'arrived_delivery' | 'delivered' | 'note' | 'photo'

export type LoadEvent = {
  id: number
  loadId: number | null
  truckId: number | null
  kind: LoadEventKind
  note: string | null
  at: string
  /** Номер остановки (lib/stops.ts); null у отметок до остановок. */
  stopSeq: number | null
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
  stopSeq: number | null = null,
): Promise<void> {
  await sql`INSERT INTO load_events (company_id, load_id, truck_id, kind, note, stop_seq) VALUES (${companyId}, ${loadId}, ${truckId}, ${kind}, ${note}, ${stopSeq})`
}

export async function listLoadEvents(companyId: 'default' | 'demo', loadId: number): Promise<LoadEvent[]> {
  const rows = (await sql`
    SELECT id, load_id, truck_id, kind, note, at, stop_seq FROM load_events
    WHERE company_id = ${companyId} AND load_id = ${loadId}
    ORDER BY at ASC, id ASC`) as {
    id: number
    load_id: number | null
    truck_id: number | null
    kind: LoadEventKind
    note: string | null
    at: string
    stop_seq: number | null
  }[]
  return rows.map((r) => ({
    id: r.id,
    loadId: r.load_id,
    truckId: r.truck_id,
    kind: r.kind,
    note: r.note,
    at: String(r.at),
    stopSeq: r.stop_seq ?? null,
  }))
}

/** Отметки «приехал / загрузился / выгрузился» по ВСЕМ грузам компании — для справочника
 * складов (lib/facilities.ts): стоянки у склада считаются по ним. Заметки и фото не нужны. */
export async function allStopEvents(companyId: 'default' | 'demo'): Promise<Map<number, StopEv[]>> {
  const rows = (await sql`
    SELECT load_id, kind, at, stop_seq FROM load_events
    WHERE company_id = ${companyId} AND load_id IS NOT NULL
      AND kind IN ('arrived_pickup', 'loaded', 'arrived_delivery', 'delivered')
    ORDER BY at ASC, id ASC`) as { load_id: number; kind: string; at: Date | string; stop_seq: number | null }[]
  const out = new Map<number, StopEv[]>()
  for (const r of rows) {
    const list = out.get(r.load_id) ?? []
    list.push({ kind: r.kind, at: r.at instanceof Date ? r.at.toISOString() : String(r.at), stopSeq: r.stop_seq })
    out.set(r.load_id, list)
  }
  return out
}

/** Последние сообщения водителей за сутки — для уведомлений диспетчеру. */
export async function recentDriverNotes(
  companyId: 'default' | 'demo',
): Promise<(LoadEvent & { truckNumber: string | null })[]> {
  const rows = (await sql`
    SELECT e.id, e.load_id, e.truck_id, e.kind, e.note, e.at, t.number
    FROM load_events e LEFT JOIN trucks t ON t.id = e.truck_id
    WHERE e.company_id = ${companyId} AND e.kind = 'note' AND e.at > NOW(6) - INTERVAL 24 HOUR
    ORDER BY e.at DESC LIMIT 20`) as {
    id: number
    load_id: number | null
    truck_id: number | null
    kind: LoadEventKind
    note: string | null
    at: string
    number: string | null
  }[]
  return rows.map((r) => ({
    id: r.id,
    loadId: r.load_id,
    truckId: r.truck_id,
    kind: r.kind,
    note: r.note,
    at: String(r.at),
    stopSeq: null,
    truckNumber: r.number,
  }))
}

/** Убрать ошибочную отметку. Возвращает груз, чтобы вызывающий обновил страницу. */
export async function deleteLoadEvent(companyId: 'default' | 'demo', id: number): Promise<number | null> {
  const rows =
    (await sql`DELETE FROM load_events WHERE id = ${id} AND company_id = ${companyId} RETURNING load_id`) as {
      load_id: number | null
    }[]
  return rows[0]?.load_id ?? null
}

/** Поправить время отметки: от него считается детеншен, и нажатая на час раньше
 * кнопка «Приехал» завышает сумму в письме брокеру. */
export async function updateLoadEventAt(
  companyId: 'default' | 'demo',
  id: number,
  atIso: string,
): Promise<number | null> {
  const upd = await sql`UPDATE load_events SET at = ${new Date(atIso)} WHERE id = ${id} AND company_id = ${companyId}`
  if (!upd.affectedRows) return null
  const rows = (await sql`SELECT load_id FROM load_events WHERE id = ${id} AND company_id = ${companyId}`) as {
    load_id: number | null
  }[]
  return rows[0]?.load_id ?? null
}
