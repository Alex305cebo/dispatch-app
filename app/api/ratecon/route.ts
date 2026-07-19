import { NextResponse, type NextRequest } from 'next/server'
import { AI_MODELS, AI_PROMPT, AI_SCHEMA, type AiFields } from '@/lib/ratecon-ai-contract'
import { bumpGeminiUsage } from '@/lib/gemini-usage'

export const dynamic = 'force-dynamic'
// Vision on a multi-page scan can take a while; Hobby allows up to 60s.
export const maxDuration = 60

// Sits behind the PIN-gate middleware (same-origin fetch carries the cookie), so
// only a signed-in dispatcher can spend the Gemini quota.
type Body = { text?: string; pdfBase64?: string; mime?: string }

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 503 })

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const parts: unknown[] = [{ text: AI_PROMPT }]
  if (body.pdfBase64) {
    // Scans and photos: the model reads the document itself — this IS the OCR.
    parts.push({ inlineData: { mimeType: body.mime ?? 'application/pdf', data: body.pdfBase64 } })
  } else if (body.text?.trim()) {
    // Text PDFs: send extracted text — far cheaper against the free-tier quota.
    parts.push({ text: 'DOCUMENT TEXT:\n' + body.text.slice(0, 60_000) })
  } else {
    return NextResponse.json({ error: 'empty' }, { status: 400 })
  }

  let lastErr = 'no model answered'
  for (const model of AI_MODELS) {
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
      // 404 = model renamed, 429 = quota — both legitimately fall to the next model.
      lastErr = `${model}: HTTP ${res.status}`
      continue
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      usageMetadata?: { totalTokenCount?: number }
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    try {
      const fields = JSON.parse(text) as AiFields
      if (!Array.isArray(fields.stops)) throw new Error('no stops')
      await bumpGeminiUsage(data.usageMetadata?.totalTokenCount ?? 0)
      return NextResponse.json({ ok: true, fields, model })
    } catch {
      lastErr = `${model}: unparseable answer`
      continue
    }
  }
  return NextResponse.json({ error: lastErr }, { status: 502 })
}
