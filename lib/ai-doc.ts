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

/** Лестница из трёх моделей вместо одной. У каждой модели свой дневной лимит на
 * бесплатном ключе, поэтому исчерпанная первая больше не означает, что определить
 * тип нечем: пробуем следующую. Порядок — по дневному лимиту, самый щедрый первым. */
const CLASSIFY_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']

/**
 * Тип документа. null — «определить не удалось» (нет ключа, кончился лимит, модель
 * молчит), и это НЕ то же самое, что «другое».
 *
 * Раньше любая неудача возвращала 'other', и при исчерпанном лимите каждый файл из
 * Telegram молча становился «Другое»: рейт-коны и накладные ложились в общую кучу, а
 * причина нигде не называлась. Теперь вызывающий видит разницу и может попросить
 * человека выбрать тип руками.
 */
export async function classifyDocument(
  base64: string,
  mime: string,
  /** The uploaded file's own name. Optional only so old call sites keep compiling. */
  filename?: string,
): Promise<DocClass | null> {
  // The filename first: brokers send "RateConf_2002711744.pdf", which says what the
  // document is more reliably than reading the page — and says it for free, offline,
  // with no API key and no way to time out. Same matcher the Telegram captions use,
  // so both paths agree on what counts as a rate con.
  const byName = filename ? captionKind(filename) : null
  if (byName) return byName

  const key = await geminiKey()
  if (!key) return null
  for (const model of CLASSIFY_MODELS) {
    const word = await askModel(model, key, base64, mime)
    if (word) return word
  }
  return null
}

async function askModel(
  model: string,
  key: string,
  base64: string,
  mime: string,
): Promise<DocClass | null> {
  try {
    const res = await fetch(
      // flash-lite, not flash: on the free tier gemini-2.5-flash allows 20 requests
      // PER DAY, and this classifier plus the rate-con parse spend two of them on
      // every upload — ten documents and the whole feature is dead until midnight.
      // gemini-3.1-flash-lite allows 500/day for the same money (none). Naming one
      // word out of five is not the task that needs the stronger model.
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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
    // Неудача этой модели — не приговор: следующая в лестнице живёт на своём лимите.
    if (!res.ok) return null
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const word = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').toLowerCase().trim()
    // Модель ответила, но не тем словом — это её ответ «ничего из перечисленного»,
    // то есть честное 'other', а не сбой.
    return (KINDS as readonly string[]).includes(word) ? (word as DocClass) : 'other'
  } catch {
    return null
  }
}
