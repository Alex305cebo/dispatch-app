// Пересчёт имён документов по правилу lib/doc-name.ts — из того, что уже лежит в базе.
//
// Зовётся после каждой записи, которая меняет что-то из имени: загрузили файл, разобрали
// рейт-кон (появились номер груза и брокер), привязали к грузу, сменили тип, поправили
// детали груза. Имя детерминировано, поэтому лишний вызов ничего не портит, а пропущенный
// догоняется следующим пересчётом того же груза.
//
// Ошибка здесь никогда не роняет вызывающего: не переименовали — файл остался под старым
// именем, это не повод потерять загрузку.
import 'server-only'
import { sql } from './db.ts'
import { docName } from './doc-name.ts'
import { getSetting, setSetting } from './settings.ts'

type Scope = { ids?: number[]; loadId?: number | null; truckId?: number | null; companyId?: string; all?: boolean }

type Row = {
  id: number
  kind: string
  title: string
  mime: string
  stop_seq: number | null
  uploaded_at: Date
  reference_id: string | null
  invoice_number: string | null
  broker_name: string | null
  stops: unknown
  truck_number: string | null
}

export async function retitleDocuments(scope: Scope): Promise<number> {
  const ids = (scope.ids ?? []).filter((n) => Number.isFinite(n) && n > 0)
  if (!scope.all && !ids.length && !scope.loadId && !scope.truckId && !scope.companyId) return 0
  try {
    const rows = (await sql`
      SELECT d.id, d.kind, d.title, d.mime, d.stop_seq, d.uploaded_at,
             l.reference_id, l.invoice_number, l.broker_name, l.stops,
             COALESCE(td.number, tl.number) AS truck_number
      FROM documents d
      LEFT JOIN loads l ON l.id = d.load_id
      LEFT JOIN trucks td ON td.id = d.truck_id
      LEFT JOIN trucks tl ON tl.id = l.truck_id
      WHERE ${scope.all ? 1 : 0} = 1
         OR d.id IN (${ids})
         OR d.load_id = ${scope.loadId ?? -1}
         OR d.truck_id = ${scope.truckId ?? -1}
         OR l.truck_id = ${scope.truckId ?? -1}
         OR d.company_id = ${scope.companyId ?? '-'}`) as Row[]
    let changed = 0
    for (const r of rows) {
      const stops = typeof r.stops === 'string' ? JSON.parse(r.stops) : r.stops
      const title = docName({
        kind: r.kind,
        title: r.title,
        mime: r.mime,
        stopSeq: r.stop_seq,
        stopCount: Array.isArray(stops) && stops.length ? stops.length : 2,
        ref: r.reference_id,
        invoiceNumber: r.invoice_number,
        broker: r.broker_name,
        truck: r.truck_number,
        uploadedAt: r.uploaded_at,
      })
      if (title === r.title) continue
      await sql`UPDATE documents SET title = ${title} WHERE id = ${r.id}`
      changed++
    }
    return changed
  } catch (e) {
    console.error('retitleDocuments failed', e)
    return 0
  }
}

const DONE_KEY = 'doc_titles_v1'
let done = false

/**
 * Разовое переименование всех документов, загруженных до правила. Запускается само при
 * первом открытии любой страницы после выкладки (app/layout.tsx, после ответа) и
 * помечает себя в settings — повторно не идёт ни в этом процессе, ни в других.
 */
export async function ensureDocTitles(): Promise<void> {
  if (done) return
  try {
    if (await getSetting(DONE_KEY)) {
      done = true
      return
    }
    const changed = await retitleDocuments({ all: true })
    await setSetting(DONE_KEY, JSON.stringify({ at: new Date().toISOString(), changed }))
    done = true
    console.warn(`ensureDocTitles: renamed ${changed} documents`)
  } catch (e) {
    console.error('ensureDocTitles failed', e)
  }
}
