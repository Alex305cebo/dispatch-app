'use server'

// «Распознать чек»: ИИ читает чек / счёт / заказ-наряд сервиса и возвращает поля записи
// журнала и трак, которому чек принадлежит. Сам ничего не пишет — окно записи открывается
// заполненным, человек проверяет и жмёт «Сохранить» (файл прикрепляется к записи там же).

import { sql } from '@/lib/db'
import { companyScope, demoReadOnly, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { matchTruck, scanPrompt, scanToInput, SCAN_SCHEMA, titleHints, type ScanAnswer, type ScanTruck } from '@/lib/service-scan-core'

const MAX_BYTES = 8 * 1024 * 1024

export async function readServiceDoc(files: { b64: string; mime: string }[]): Promise<
  { truckId: number | null; input: ReturnType<typeof scanToInput> } | { error: string }
> {
  const locale = await getLocale()
  if (!(await getCurrentUser())) return { error: t(locale, 'actions.aiUnavailable') }
  // Демо общее для всех — лимит ИИ на нём не тратим.
  const ro = await demoReadOnly()
  if (ro) return ro
  const list = files.filter((f) => f.b64 && /^(image\/|application\/pdf)/.test(f.mime)).slice(0, 6)
  if (!list.length) return { error: t(locale, 'actions.fileUnreadable') }
  if (list.reduce((a, f) => a + f.b64.length * 0.75, 0) > MAX_BYTES) return { error: t(locale, 'actions.fileOver8mb') }

  const { geminiJson } = await import('@/lib/ratecon-gemini')
  const parts: unknown[] = [{ text: scanPrompt(locale) }, ...list.map((f) => ({ inlineData: { mimeType: f.mime, data: f.b64 } }))]
  const res = await geminiJson<ScanAnswer>(parts, SCAN_SCHEMA, (a) => !!a?.kind, 60_000)
  if ('error' in res)
    return { error: res.error === 'no_key' ? t(locale, 'actions.aiUnavailable') : `${t(locale, 'actions.aiFailedToRead')} ${res.error}` }

  const companyId = await companyScope()
  const trucks = (await sql`
    SELECT t.id, t.number, m.plate, m.vin FROM trucks t LEFT JOIN truck_meta m ON m.truck_id = t.id
    WHERE t.company_id = ${companyId}`) as ScanTruck[]
  return { truckId: matchTruck(res.data, trucks), input: scanToInput(res.data) }
}

type ScanInput = ReturnType<typeof scanToInput>

/** Ремонтная бумага, уже лежащая в базе: ИИ читает её, имя «REPAIR #… MM-DD-YY - …»
 * подсказывает дату и что сделано, если ИИ промолчал. Трак — тот, к которому бумага
 * загружена. Без ключа ИИ — только подсказки из имени, ошибка не мешает. */
export async function scanStoredDoc(docId: number): Promise<{ truckId: number; input: ScanInput; aiError: string | null } | { error: string }> {
  const locale = await getLocale()
  const companyId = await companyScope()
  const rows = (await sql`
    SELECT REPLACE(TO_BASE64(data), CHAR(10 USING ascii), '') AS b64, mime, title, truck_id, uploaded_at
    FROM documents WHERE id = ${docId} AND company_id = ${companyId} AND deleted_at IS NULL`) as {
    b64: string
    mime: string
    title: string
    truck_id: number | null
    uploaded_at: string | Date
  }[]
  const doc = rows[0]
  if (!doc?.truck_id) return { error: t(locale, 'actions.entryNotFound') }

  const hints = titleHints(doc.title)
  const fallback: ScanInput = {
    kind: 'repair',
    title: hints.what ?? doc.title,
    notes: '',
    cost: null,
    odometer: null,
    doneAt: hints.doneAt ?? new Date(doc.uploaded_at).toISOString().slice(0, 10),
    doneTime: null,
    shop: '',
  }
  const read = await readServiceDoc([{ b64: doc.b64, mime: doc.mime }])
  if ('error' in read) return { truckId: doc.truck_id, input: fallback, aiError: read.error }
  const f = read.input
  return {
    truckId: doc.truck_id,
    input: { ...f, title: f.title || fallback.title, doneAt: f.doneAt ?? fallback.doneAt },
    aiError: null,
  }
}

/** «Разобрать всё»: бумага → запись журнала без окна. Запись создаётся и бумага встаёт
 * к ней; что ИИ не нашёл, остаётся пустым — поправить можно ✎ в журнале. */
export async function autoRecordFromDoc(docId: number): Promise<{ id: number; aiError: string | null } | { error: string }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  const scan = await scanStoredDoc(docId)
  if ('error' in scan) return scan
  const { addMaintenance, linkDocToMaintenance } = await import('@/app/actions')
  const rec = await addMaintenance(scan.truckId, { ...scan.input, doneAt: scan.input.doneAt! })
  if ('error' in rec) return rec
  const linked = await linkDocToMaintenance(docId, rec.id)
  if (linked?.error) return linked
  return { id: rec.id, aiError: scan.aiError }
}
