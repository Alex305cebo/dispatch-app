import 'server-only'

// Server-side rate-con extraction, reusing the same prompt/schema the /api/ratecon
// route uses. Lets a server action re-read a load's already-attached RC (as PDF
// bytes) and pull the important-notes briefing — no browser round-trip.

import { AI_MODELS, AI_PROMPT, AI_SCHEMA, type AiFields } from './ratecon-ai-contract.ts'
import { bumpGeminiUsage } from './gemini-usage.ts'

export async function geminiExtract(input: {
  text?: string
  pdfBase64?: string
  mime?: string
}): Promise<{ fields: AiFields; model: string } | { error: string }> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { error: 'no_key' }

  const parts: unknown[] = [{ text: AI_PROMPT }]
  if (input.pdfBase64) {
    parts.push({ inlineData: { mimeType: input.mime ?? 'application/pdf', data: input.pdfBase64 } })
  } else if (input.text?.trim()) {
    parts.push({ text: 'DOCUMENT TEXT:\n' + input.text.slice(0, 60_000) })
  } else {
    return { error: 'empty' }
  }

  let lastErr = 'no model answered'
  for (const model of AI_MODELS) {
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
              responseSchema: AI_SCHEMA,
              temperature: 0,
            },
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
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const fields = JSON.parse(text) as AiFields
      if (!Array.isArray(fields.stops)) throw new Error('no stops')
      await bumpGeminiUsage(data.usageMetadata?.totalTokenCount ?? 0)
      return { fields, model }
    } catch (e) {
      lastErr = `${model}: ${e instanceof Error ? e.message : 'error'}`
      continue
    }
  }
  return { error: lastErr }
}
