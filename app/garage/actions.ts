'use server'

// «Распознать чек»: ИИ читает чек / счёт / заказ-наряд сервиса и возвращает поля записи
// журнала и трак, которому чек принадлежит. Сам ничего не пишет — окно записи открывается
// заполненным, человек проверяет и жмёт «Сохранить» (файл прикрепляется к записи там же).

import { sql } from '@/lib/db'
import { companyScope, demoReadOnly, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { matchTruck, scanPrompt, scanToInput, SCAN_SCHEMA, type ScanAnswer, type ScanTruck } from '@/lib/service-scan-core'

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
