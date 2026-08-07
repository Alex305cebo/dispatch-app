import { NextResponse, type NextRequest } from 'next/server'
import { AI_MODELS, AI_MODELS_QUALITY, AI_PROMPT, AI_SCHEMA, type AiFields } from '@/lib/ratecon-ai-contract'
import { bumpGeminiUsage } from '@/lib/gemini-usage'
import { geminiKey, aiModelPref } from '@/lib/keys'

export const dynamic = 'force-dynamic'
// Vision on a multi-page scan can take up to ~90s (that's what the UI promises) —
// 60 cut it short and surfaced as a raw "Unexpected token '<'" JSON-parse error on
// the client (Hostinger's own proxy answering with its timeout page). Self-hosted
// now, not Vercel Hobby, so there's no platform ceiling forcing 60 here.
export const maxDuration = 120

// Sits behind the PIN-gate middleware (same-origin fetch carries the cookie), so
// only a signed-in dispatcher can spend the Gemini quota.
type Body = { text?: string; pdfBase64?: string; mime?: string }

export async function POST(req: NextRequest) {
  const key = await geminiKey()
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

  // Per-model deadline. The whole reason a rate con "didn't recognise, server took
  // long" was that the models were tried back-to-back with NO timeout: a single slow
  // model (a preview build, a cold start) held the connection until the hosting proxy
  // gave up and answered with its own HTML page — which reached the browser as an
  // "Unexpected token '<'" JSON error. Now a model that hasn't answered in MODEL_MS is
  // aborted and the next one is tried, so one slow model can't sink the request.
  // 55s, not less: a heavy multi-page scan can legitimately take 40-50s on a vision
  // model, and cutting it shorter would abort work that was about to succeed — making
  // the very problem worse. This is a ceiling on a HUNG model, not a target. A 55s
  // first attempt still leaves room for one fallback inside the 108s total.
  const MODEL_MS = 55_000
  // Overall wall-clock guard: stop starting new attempts once there isn't time for one
  // to finish before maxDuration (120s). Better to return a clean error than to begin
  // an attempt the platform will kill mid-flight.
  const startedAt = Date.now()
  const TOTAL_MS = 108_000

  // A model needs at least this much runway to be worth starting — below it, an attempt
  // would almost certainly be killed mid-flight, so return the last error cleanly.
  const MIN_SLICE_MS = 18_000

  let lastErr = 'no model answered'
  const models = (await aiModelPref()) === 'quality' ? AI_MODELS_QUALITY : AI_MODELS
  for (const model of models) {
    const remaining = TOTAL_MS - (Date.now() - startedAt)
    if (remaining < MIN_SLICE_MS) {
      lastErr = 'ran out of time before a model answered'
      break
    }
    // This model gets whatever's left, capped at MODEL_MS — so after a slow first
    // attempt the fallback still gets a real (if shorter) slice instead of being
    // skipped entirely.
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), Math.min(MODEL_MS, remaining))
    let res: Response
    try {
      res = await fetch(
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
          signal: ac.signal,
        },
      )
    } catch (e) {
      // Aborted (too slow) or a network drop — both just mean "try the next model".
      lastErr = ac.signal.aborted ? `${model}: timed out after ${MODEL_MS / 1000}s` : `${model}: ${String(e)}`
      continue
    } finally {
      clearTimeout(timer)
    }
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
