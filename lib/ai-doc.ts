// Server-side document classifier (Gemini vision). Used by the Telegram intake to
// tell a POD from a BOL from a random photo a driver sends. Degrades to 'other'
// when there's no key — never throws.

// caption-kind imports DocClass back from here, but only as `import type`, which is
// erased at compile time — no runtime import cycle.
import { captionKind } from './caption-kind.ts'
import { geminiKey } from './keys.ts'

const KINDS = ['pod', 'bol', 'ratecon', 'invoice', 'other'] as const
export type DocClass = (typeof KINDS)[number]

const PROMPT = `Classify this trucking document image. Answer with ONE word only, exactly one of:
pod  — proof of delivery / delivery receipt (signed, "received", delivery signature)
bol  — bill of lading (shipping document at pickup)
ratecon — rate confirmation from a broker
invoice — an invoice
other — anything else (fuel receipt, lumper receipt, random photo)
Answer with just the single word.`

export async function classifyDocument(
  base64: string,
  mime: string,
  /** The uploaded file's own name. Optional only so old call sites keep compiling. */
  filename?: string,
): Promise<DocClass> {
  // The filename first: brokers send "RateConf_2002711744.pdf", which says what the
  // document is more reliably than reading the page — and says it for free, offline,
  // with no API key and no way to time out. Same matcher the Telegram captions use,
  // so both paths agree on what counts as a rate con.
  const byName = filename ? captionKind(filename) : null
  if (byName) return byName

  const key = await geminiKey()
  if (!key) return 'other'
  try {
    const res = await fetch(
      // flash-lite, not flash: on the free tier gemini-2.5-flash allows 20 requests
      // PER DAY, and this classifier plus the rate-con parse spend two of them on
      // every upload — ten documents and the whole feature is dead until midnight.
      // gemini-3.1-flash-lite allows 500/day for the same money (none). Naming one
      // word out of five is not the task that needs the stronger model.
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: base64 } }] }],
          generationConfig: {
            temperature: 0,
            // gemini-2.5-flash reasons before it answers, and those thinking tokens
            // are billed against maxOutputTokens. The old cap of 5 was spent on
            // thinking before a single visible token, so the reply came back empty
            // and EVERY document fell through to 'other'. Thinking off, and enough
            // room that a one-word answer can never be the thing that gets truncated.
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 32,
          },
        }),
      },
    )
    if (!res.ok) return 'other'
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const word = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').toLowerCase().trim()
    return (KINDS as readonly string[]).includes(word) ? (word as DocClass) : 'other'
  } catch {
    return 'other'
  }
}
