import 'server-only'

// Чтение Rate Con через Gemini — на сервере, фоновой задачей.
//
// Почему задачей, а не одним запросом (11/10/26). Раньше браузер держал один POST
// /api/ratecon открытым, пока модели читали скан. Скан идёт 40–90 с, а прокси хостинга
// рвёт долгий запрос раньше и отвечает СВОЕЙ HTML-страницей — в браузер это приходило
// как «Unexpected token '<'», то есть «Сервер долго отвечал», и так каждый раз, сколько
// ни повторяй: повтор упирался в тот же потолок. Плюс файл ехал вторым разом base64 в
// JSON (на треть больше файла) — на это мог ругаться и фильтр хостинга.
//
// Теперь: POST только ставит задачу и сразу отвечает её номером; модели работают после
// ответа (next/server after); браузер раз в пару секунд спрашивает GET ?job=…, и каждый
// такой запрос короткий. Файл не пересылается: документ к этому моменту уже сохранён
// (lib/send-document.ts), сервер берёт его из базы по docId. Итог задачи лежит в
// таблице ratecon_jobs — у хостинга может быть несколько процессов приложения, и опрос
// может прийти не в тот, что читает.

import { sql } from './db.ts'
import { ensureSchema } from './install.ts'
import type { AiFields } from './ratecon-ai-contract.ts'
import { bumpGeminiUsage } from './gemini-usage.ts'
import type { Locale } from './i18n.ts'
import { readRateConCore, type ReadInput, type ReadResult } from './ratecon-read-core.ts'

export { buildParts, type ReadInput, type ReadResult } from './ratecon-read-core.ts'

export function readRateCon(
  input: ReadInput,
  opts: { key: string; quality: boolean; locale: Locale },
): Promise<ReadResult> {
  return readRateConCore(input, { ...opts, onUsage: bumpGeminiUsage })
}

// ── Задачи ─────────────────────────────────────────────────────────────────────

export type JobState =
  | { status: 'working' }
  | { status: 'done'; fields: AiFields; model: string }
  | { status: 'failed'; error: string }

/** Таблица появляется со свежей схемой; первый запрос сразу после выкладки может
 * прийти раньше, чем схему дотянул экран входа, — тогда дотягиваем здесь. */
async function withTable<T>(q: () => Promise<T>): Promise<T> {
  try {
    return await q()
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code !== 'ER_NO_SUCH_TABLE' && code !== 'ER_BAD_FIELD_ERROR') throw e
    await ensureSchema()
    return q()
  }
}

export type JobInput = { docId?: number; text?: string }

export async function createJob(companyId: string, input: JobInput): Promise<number> {
  return withTable(async () => {
    // Старые задачи не нужны никому: итог забирают в течение минут.
    await sql`DELETE FROM ratecon_jobs WHERE created_at < NOW() - INTERVAL 1 DAY`
    const rows = (await sql`
      INSERT INTO ratecon_jobs (company_id, status, doc_id, input_text)
      VALUES (${companyId}, 'working', ${input.docId ?? null}, ${input.text?.slice(0, 60_000) ?? null})
      RETURNING id`) as { id: number }[]
    return rows[0]!.id
  })
}

async function finishJob(id: number, r: ReadResult): Promise<void> {
  if (r.ok) {
    await sql`UPDATE ratecon_jobs SET status = 'done', result = ${JSON.stringify({ fields: r.fields, model: r.model })},
      finished_at = NOW(6) WHERE id = ${id}`
  } else {
    await sql`UPDATE ratecon_jobs SET status = 'failed', error = ${r.error.slice(0, 2000)},
      finished_at = NOW(6) WHERE id = ${id}`
  }
}

/** Прочитать и записать итог задачи. Пульс раз в 10 с говорит опросу «процесс жив». */
export async function runJob(
  id: number,
  input: ReadInput,
  opts: { key: string; quality: boolean; locale: Locale },
): Promise<void> {
  const beat = setInterval(() => {
    sql`UPDATE ratecon_jobs SET beat_at = NOW(6) WHERE id = ${id}`.catch(() => undefined)
  }, 10_000)
  try {
    const r = await readRateCon(input, opts).catch((e: unknown) => ({ ok: false as const, error: String(e) }))
    await finishJob(id, r)
  } catch (e) {
    console.error('ratecon job failed to finish', id, e)
  } finally {
    clearInterval(beat)
  }
}

/** Пульс молчит дольше этого — процесс с задачей умер (перезапуск, хостинг погасил). */
const DEAD_BEAT_S = 45
/** Больше этого «в работе» не бывает: сервер сам сдаётся через ~4.5 мин. */
const STALE_S = 8 * 60
const MAX_TRIES = 3

export type JobRow = JobState & { orphan?: JobInput }

export async function jobState(id: number, companyId: string): Promise<JobRow | null> {
  const rows = (await withTable(
    () => sql`
    SELECT status, result, error, doc_id, input_text, tries,
      TIMESTAMPDIFF(SECOND, created_at, NOW(6)) AS age,
      TIMESTAMPDIFF(SECOND, beat_at, NOW(6)) AS quiet
    FROM ratecon_jobs WHERE id = ${id} AND company_id = ${companyId}`,
  )) as {
    status: string
    result: string | null
    error: string | null
    doc_id: number | null
    input_text: string | null
    tries: number
    age: number
    quiet: number
  }[]
  const row = rows[0]
  if (!row) return null
  if (row.status === 'done' && row.result) {
    const r = JSON.parse(row.result) as { fields: AiFields; model: string }
    return { status: 'done', fields: r.fields, model: r.model }
  }
  if (row.status === 'failed') return { status: 'failed', error: row.error || 'failed' }
  if (Number(row.age) > STALE_S) return { status: 'failed', error: 'stale' }
  if (Number(row.quiet) > DEAD_BEAT_S) {
    // Подхватить можно только то, что лежит в базе: документ или текст.
    if ((row.doc_id || row.input_text) && Number(row.tries) < MAX_TRIES)
      return { status: 'working', orphan: { docId: row.doc_id ?? undefined, text: row.input_text ?? undefined } }
    return { status: 'failed', error: 'stale' }
  }
  return { status: 'working' }
}

/** Забрать осиротевшую задачу себе. true — только одному из параллельных опросов. */
export async function claimJob(id: number): Promise<boolean> {
  const r = await sql`
    UPDATE ratecon_jobs SET beat_at = NOW(6), tries = tries + 1
    WHERE id = ${id} AND status = 'working' AND beat_at < NOW(6) - INTERVAL ${DEAD_BEAT_S} SECOND`
  return (r.affectedRows ?? 0) === 1
}
/** Файл документа из базы — base64 и тип. Только своей компании. */
export async function documentFile(
  docId: number,
  companyId: string,
): Promise<{ b64: string; mime: string } | null> {
  const rows = (await sql`
    SELECT mime, REPLACE(TO_BASE64(data), CHAR(10 USING ascii), '') AS b64 FROM documents
    WHERE id = ${docId} AND company_id = ${companyId}`) as { mime: string; b64: string }[]
  const d = rows[0]
  if (!d?.b64) return null
  return { b64: d.b64, mime: (d.mime || 'application/pdf').split(';')[0]!.trim() }
}
