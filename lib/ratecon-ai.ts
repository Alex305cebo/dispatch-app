'use client'

// Thin client for /api/ratecon. The Gemini key never reaches the browser — the
// route holds it; this file only ships bytes and maps the answer.

import type { RateConFields } from './ratecon'
import { aiToFields, type AiFields } from './ratecon-ai-contract'
import { t, type Locale } from './i18n.ts'

export type AiResult =
  | { ok: true; fields: RateConFields; model: string }
  | { ok: false; reason: 'no_key' | 'failed'; detail?: string }

export async function aiParseRateCon(
  input: {
    text?: string
    pdfBase64?: string
    mime?: string
  },
  locale: Locale = 'en',
): Promise<AiResult> {
  try {
    const res = await fetch('/api/ratecon', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = (await res.json()) as
      | { ok: true; fields: AiFields; model: string }
      | { error: string }
    if ('ok' in data) return { ok: true, fields: aiToFields(data.fields, data.model, locale), model: data.model }
    return { ok: false, reason: data.error === 'no_key' ? 'no_key' : 'failed', detail: data.error }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // A slow scan (60-90s) can outlast the hosting proxy's own timeout, which
    // answers with its own HTML error page instead of our JSON — res.json() then
    // throws exactly this "Unexpected token '<'" parse error. The raw message means
    // nothing to a dispatcher; the document is already saved regardless (the
    // caller's orphan-RC panel picks it up from there), so say that instead.
    const detail = /Unexpected token|is not valid JSON/.test(msg)
      ? t(locale, 'rateconAi.slowServer')
      : msg
    return { ok: false, reason: 'failed', detail }
  }
}

/** File → base64 without call-stack overflow on multi-MB scans. */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}
