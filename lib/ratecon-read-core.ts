// Чтение Rate Con моделями Gemini — без базы, чтобы проверялось тестом
// (lib/ratecon-read-core.test.ts). Задачи и база — lib/ratecon-read.ts.

import { AI_MODELS, AI_MODELS_QUALITY, AI_PROMPT, AI_SCHEMA, type AiFields } from './ratecon-ai-contract.ts'
import { aiFailKind, aiFailMessage, worstFail, type AiFail } from './ai-error.ts'
import type { Locale } from './i18n.ts'

const TEXT_LAYER_NOTE =
  'TEXT LAYER of the same document (only the pages that have selectable text; the file above is the full document):\n'

export type ReadInput = { text?: string; fileBase64?: string; mime?: string }
export type ReadResult = { ok: true; fields: AiFields; model: string } | { ok: false; error: string }

export function buildParts(input: ReadInput): unknown[] | null {
  const parts: unknown[] = [{ text: AI_PROMPT }]
  if (input.fileBase64) {
    // Сканы и фото: модель читает сам файл — это и есть распознавание.
    parts.push({ inlineData: { mimeType: input.mime || 'application/pdf', data: input.fileBase64 } })
    // Файл со страницами-картинками, но с текстом на других: текстовый слой следом,
    // чтобы цифры с текстовых страниц модель брала точно, а не со снимка.
    if (input.text?.trim()) parts.push({ text: TEXT_LAYER_NOTE + input.text.slice(0, 60_000) })
    return parts
  }
  if (input.text?.trim()) {
    parts.push({ text: 'DOCUMENT TEXT:\n' + input.text.slice(0, 60_000) })
    return parts
  }
  return null
}

/** Короткое «подумать» вместо долгого: разбор Rate Con — выписка фактов, а не задача
 * на рассуждение, и по умолчанию flash-модели думают десятки секунд. Если модель не
 * знает этой настройки (ответ 400 про thinking), вызов повторяется без неё. */
export function thinkingFor(model: string): Record<string, unknown> | undefined {
  if (model.startsWith('gemini-3')) return { thinkingLevel: 'low' }
  if (model.startsWith('gemini-2.5-flash') && !model.includes('lite')) return { thinkingBudget: 1024 }
  return undefined
}

/** Бывают беды, которые повтор той же модели не лечит: кончилась квота, ключ не
 * принят, модели нет (404). Остальное — «занята», «не уложилась», «ответила мусором» —
 * второй круг часто проходит. */
function retryable(kind: AiFail | 'timeout' | 'garbage' | 'gone'): boolean {
  return kind === 'busy' || kind === 'timeout' || kind === 'garbage' || kind === 'other'
}

async function callModel(
  model: string,
  key: string,
  parts: unknown[],
  ms: number,
  withThinking: boolean,
): Promise<Response> {
  const thinking = withThinking ? thinkingFor(model) : undefined
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: AI_SCHEMA,
        temperature: 0,
        ...(thinking ? { thinkingConfig: thinking } : {}),
      },
    }),
    signal: AbortSignal.timeout(ms),
  })
}

/**
 * Все модели по очереди, затем второй круг по тем, чья беда лечится повтором. Сроки
 * щедрые: это уже не держит открытым запрос браузера, держит только задачу.
 */
export async function readRateConCore(
  input: ReadInput,
  opts: {
    key: string
    quality: boolean
    locale: Locale
    modelMs?: number
    totalMs?: number
    pauseMs?: number
    onUsage?: (tokens: number) => Promise<void> | void
  },
): Promise<ReadResult> {
  const parts = buildParts(input)
  if (!parts) return { ok: false, error: 'empty' }
  const MODEL_MS = opts.modelMs ?? 100_000
  const TOTAL_MS = opts.totalMs ?? 270_000
  const MIN_SLICE_MS = 15_000
  const startedAt = Date.now()
  const models = opts.quality ? AI_MODELS_QUALITY : AI_MODELS
  const noThinking = new Set<string>()
  let fail: AiFail | null = null
  let lastErr = 'no model answered'
  let retryOk = new Set<string>()

  for (let round = 0; round < 2; round++) {
    const again: string[] = []
    const list = round === 0 ? models : models.filter((m) => retryOk.has(m))
    for (const model of list) {
      const remaining = TOTAL_MS - (Date.now() - startedAt)
      if (remaining < MIN_SLICE_MS) {
        lastErr = 'ran out of time before a model answered'
        break
      }
      const ms = Math.min(MODEL_MS, remaining)
      let res: Response
      try {
        res = await callModel(model, opts.key, parts, ms, !noThinking.has(model))
        if (res.status === 400 && !noThinking.has(model) && thinkingFor(model)) {
          const body = await res.clone().text().catch(() => '')
          if (/thinking/i.test(body)) {
            noThinking.add(model)
            res = await callModel(model, opts.key, parts, ms, false)
          }
        }
      } catch (e) {
        const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
        lastErr = timedOut ? `${model}: timed out after ${Math.round(ms / 1000)}s` : `${model}: ${String(e)}`
        again.push(model)
        continue
      }
      if (!res.ok) {
        const kind = aiFailKind(res.status, await res.text().catch(() => ''))
        fail = worstFail(fail, kind)
        lastErr = `${model}: HTTP ${res.status}`
        if (res.status !== 404 && retryable(kind)) again.push(model)
        continue
      }
      const data = (await res.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
        usageMetadata?: { totalTokenCount?: number }
      } | null
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text ?? '')
          .join('') ?? ''
      try {
        const fields = JSON.parse(text) as AiFields
        if (!Array.isArray(fields.stops)) throw new Error('no stops')
        await opts.onUsage?.(data?.usageMetadata?.totalTokenCount ?? 0)
        return { ok: true, fields, model }
      } catch {
        lastErr = `${model}: unparseable answer`
        again.push(model)
      }
    }
    retryOk = new Set(again)
    if (!again.length) break
    // Пауза перед вторым кругом: «модель перегружена» у Google проходит за секунды.
    await new Promise((r) => setTimeout(r, opts.pauseMs ?? 3000))
  }
  return { ok: false, error: aiFailMessage(fail ?? 'other', opts.locale, lastErr) }
}

