import 'server-only'

// Server-side rate-con extraction, reusing the same prompt/schema the /api/ratecon
// route uses. Lets a server action re-read a load's already-attached RC (as PDF
// bytes) and pull the important-notes briefing — no browser round-trip.

import { AI_MODELS, AI_MODELS_QUALITY, AI_PROMPT, AI_SCHEMA, type AiFields } from './ratecon-ai-contract.ts'
import { bumpGeminiUsage } from './gemini-usage.ts'
import { geminiKey, aiModelPref } from './keys.ts'
import { aiFailKind, aiFailMessage, worstFail, type AiFail } from './ai-error.ts'
import { getLocale } from './i18n-server.ts'

/**
 * Лестница моделей с ответом JSON по схеме — общая для всего, что читает ИИ: рейт-конов
 * и скриншотов доски грузов. Разница только в том, что спросить (parts, schema) и какой
 * ответ считать ответом (ok).
 */
export async function geminiJson<T>(
  parts: unknown[],
  schema: unknown,
  ok: (answer: T) => boolean,
  /** Потолок на одну модель, мс. Без него ждём, сколько модель думает (так у рейт-конов). */
  timeoutMs?: number,
): Promise<{ data: T; model: string } | { error: string }> {
  const key = await geminiKey()
  if (!key) return { error: 'no_key' }

  let lastErr = ''
  // Копим не последнюю беду, а самую объясняющую: отозванный ключ важнее квоты.
  let fail: AiFail | null = null
  const models = (await aiModelPref()) === 'quality' ? AI_MODELS_QUALITY : AI_MODELS
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: schema,
              temperature: 0,
            },
          }),
          signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
        },
      )
      if (!res.ok) {
        fail = worstFail(fail, aiFailKind(res.status, await res.text().catch(() => '')))
        lastErr = `${model}: HTTP ${res.status}`
        continue
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
        usageMetadata?: { totalTokenCount?: number }
      }
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const answer = JSON.parse(text) as T
      if (!ok(answer)) throw new Error('unexpected answer')
      await bumpGeminiUsage(data.usageMetadata?.totalTokenCount ?? 0)
      return { data: answer, model }
    } catch (e) {
      // Модель не уложилась в срок — это «занята, повторите», а не непонятная ошибка.
      if (e instanceof Error && e.name === 'TimeoutError') fail = worstFail(fail, 'busy')
      lastErr = `${model}: ${e instanceof Error ? e.message : 'error'}`
      continue
    }
  }
  // Код HTTP остаётся в скобках для нас, а первое, что читает диспетчер, — что
  // делать: ждать сброса лимита, менять ключ или просто повторить.
  return { error: aiFailMessage(fail ?? 'other', await getLocale(), lastErr) }
}

export async function geminiExtract(input: {
  text?: string
  pdfBase64?: string
  mime?: string
}): Promise<{ fields: AiFields; model: string } | { error: string }> {
  const parts: unknown[] = [{ text: AI_PROMPT }]
  if (input.pdfBase64) {
    parts.push({ inlineData: { mimeType: input.mime ?? 'application/pdf', data: input.pdfBase64 } })
  } else if (input.text?.trim()) {
    parts.push({ text: 'DOCUMENT TEXT:\n' + input.text.slice(0, 60_000) })
  } else {
    return { error: 'empty' }
  }
  const res = await geminiJson<AiFields>(parts, AI_SCHEMA, (f) => Array.isArray(f?.stops))
  return 'error' in res ? res : { fields: res.data, model: res.model }
}

// gemini-3-flash-preview "thinks" before answering — fine for RC extraction (worth
// the wait for accuracy) but a plain translation sat over two minutes on real broker
// notes. 2.5-flash answers the same prompt in ~7s with no accuracy cost for this
// task, so translation gets its own, speed-first model order instead of AI_MODELS.
const TRANSLATE_MODELS = ['gemini-2.5-flash', 'gemini-3-flash-preview']

/** Plain-text translation (no schema) — used for the broker-notes RU toggle. */
export async function translatePlainText(
  text: string,
  targetLang: string,
): Promise<{ text: string } | { error: string }> {
  const key = await geminiKey()
  if (!key) return { error: 'no_key' }
  const prompt = `Translate the following trucking rate-confirmation note into ${targetLang}. Keep phone numbers, dollar amounts, times and line breaks exactly as they are. If a line starts with a tag in square brackets like [SAFETY] or [CONTACT], leave that bracketed tag itself untranslated and unchanged, translate only the text after it. Output ONLY the translation, nothing else.\n\n${text.slice(0, 8000)}`

  let lastErr = 'no model answered'
  for (const model of TRANSLATE_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0 },
          }),
        },
      )
      if (!res.ok) {
        lastErr = `${model}: HTTP ${res.status}`
        continue
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
        usageMetadata?: { totalTokenCount?: number }
      }
      const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()
      if (!out) throw new Error('empty answer')
      await bumpGeminiUsage(data.usageMetadata?.totalTokenCount ?? 0)
      return { text: out }
    } catch (e) {
      lastErr = `${model}: ${e instanceof Error ? e.message : 'error'}`
      continue
    }
  }
  return { error: lastErr }
}
