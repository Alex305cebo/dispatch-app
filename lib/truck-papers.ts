// Документы водителя и трака — чтение из базы и чтение срока с картинки (Gemini).
// Типы и расчёты — lib/truck-papers-core.ts.
import 'server-only'
import { sql } from './db.ts'
import { withFreshSchema } from './install.ts'
import { geminiKey } from './keys.ts'
import { bumpGeminiUsage } from './gemini-usage.ts'
import { META_SQL_COLUMN, PAPER_META_COLUMN, paperOf, parseModelDate, type PaperType } from './truck-papers-core.ts'
import type { CompanyId } from './company.ts'

export type TruckPaper = {
  id: number
  paper: PaperType
  title: string
  mime: string
  sizeBytes: number
  uploadedAt: string
  expiresOn: string | null
}

const isoDay = (v: unknown): string | null => {
  if (!v) return null
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  return null
}

/** Бумаги трака без груза, у которых есть тип водителя/трака. Старые страховка и
 * регистрация (kind без paper) тоже здесь — их загружали раньше этого окна. */
export async function listTruckPapers(companyId: CompanyId, truckId: number): Promise<TruckPaper[]> {
  try {
    const rows = (await withFreshSchema(() => sql`
      SELECT id, paper, kind, title, mime, size_bytes, uploaded_at,
             DATE_FORMAT(expires_on, '%Y-%m-%d') AS expires_on
      FROM documents
      WHERE truck_id = ${truckId} AND company_id = ${companyId} AND deleted_at IS NULL
        AND load_id IS NULL
        AND (paper IS NOT NULL OR kind IN ('insurance', 'registration'))
      ORDER BY uploaded_at DESC`)) as {
      id: number
      paper: string | null
      kind: string
      title: string
      mime: string
      size_bytes: number
      uploaded_at: Date | string
      expires_on: string | null
    }[]
    const out: TruckPaper[] = []
    for (const r of rows) {
      const paper = paperOf(r)
      if (!paper) continue
      out.push({
        id: r.id,
        paper,
        title: r.title,
        mime: r.mime,
        sizeBytes: r.size_bytes,
        uploadedAt: new Date(r.uploaded_at).toISOString(),
        expiresOn: isoDay(r.expires_on),
      })
    }
    return out
  } catch (e) {
    // Без списка бумаг карточка трака всё равно должна открыться.
    console.error('listTruckPapers failed', e)
    return []
  }
}

/** Срок бумаги: у пяти типов — колонка truck_meta (горит по всему приложению), у
 * остальных — сам документ. Пустая дата стирает срок. */
export async function writePaperDate(
  truckId: number,
  paper: PaperType,
  date: string | null,
  docId: number | null,
): Promise<void> {
  const col = PAPER_META_COLUMN[paper]
  if (col) {
    const name = META_SQL_COLUMN[col]
    // Имя колонки — из закрытого списка META_SQL_COLUMN, значение — параметром.
    await sql.query(
      `INSERT INTO truck_meta (truck_id, ${name}) VALUES (?, ?) ON DUPLICATE KEY UPDATE ${name} = VALUES(${name})`,
      [truckId, date],
    )
  }
  if (docId != null) {
    await withFreshSchema(() => sql`UPDATE documents SET expires_on = ${date} WHERE id = ${docId}`)
  } else if (!col) {
    // Срок без колонки — у самого свежего документа этого типа.
    await withFreshSchema(() => sql`
      UPDATE documents SET expires_on = ${date}
      WHERE id = (SELECT id FROM (SELECT id FROM documents
                   WHERE truck_id = ${truckId} AND paper = ${paper} AND deleted_at IS NULL
                   ORDER BY uploaded_at DESC LIMIT 1) x)`)
  }
}

const EXPIRY_PROMPT: Record<PaperType, string> = {
  cdl: 'a commercial driver license (CDL)',
  medcard: 'a DOT medical examiner certificate (medical card)',
  truck_reg: 'a truck registration / IRP cab card',
  trailer_reg: 'a trailer registration',
  insurance: 'a certificate of insurance',
  inspection: 'an annual DOT vehicle inspection report',
  permit: 'a trucking permit',
  lease: 'a lease agreement',
  instructions: 'a document',
  other: 'a document',
}

const MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']

/**
 * Срок действия с картинки или PDF. null — не нашли (нет ключа, лимит, на бумаге нет
 * срока). Ответ модели проходит parseModelDate: мусор датой не станет.
 */
export async function readExpiryFromFile(
  data: Buffer,
  mime: string,
  paper: PaperType,
): Promise<{ date: string } | { error: 'noKey' | 'notFound' }> {
  const key = await geminiKey()
  if (!key) return { error: 'noKey' }
  const prompt = `This is ${EXPIRY_PROMPT[paper]}. Find its EXPIRATION date (labels like "EXP", "Expires", "Expiration", "Valid until", "Policy expiration", "Medical certificate expiration date"). Do NOT return the issue date or date of birth. Answer with the date only, as YYYY-MM-DD, or the word none if there is no expiration date.`
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: data.toString('base64') } }] }],
          generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 24 },
        }),
      })
      if (!res.ok) continue
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
        usageMetadata?: { totalTokenCount?: number }
      }
      await bumpGeminiUsage(json.usageMetadata?.totalTokenCount ?? 0).catch(() => {})
      const date = parseModelDate(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
      return date ? { date } : { error: 'notFound' }
    } catch {
      // Следующая модель — на своём дневном лимите.
    }
  }
  return { error: 'notFound' }
}
