// Server-side document classifier (Gemini vision). Used by the Telegram intake to
// tell a POD from a BOL from a random photo a driver sends. Degrades to 'other'
// when there's no key — never throws.

const KINDS = ['pod', 'bol', 'ratecon', 'invoice', 'other'] as const
export type DocClass = (typeof KINDS)[number]

const PROMPT = `Classify this trucking document image. Answer with ONE word only, exactly one of:
pod  — proof of delivery / delivery receipt (signed, "received", delivery signature)
bol  — bill of lading (shipping document at pickup)
ratecon — rate confirmation from a broker
invoice — an invoice
other — anything else (fuel receipt, lumper receipt, random photo)
Answer with just the single word.`

export async function classifyDocument(base64: string, mime: string): Promise<DocClass> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return 'other'
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: base64 } }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5 },
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
