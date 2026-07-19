'use client'

// Thin client for /api/ratecon. The Gemini key never reaches the browser — the
// route holds it; this file only ships bytes and maps the answer.

import type { RateConFields } from './ratecon'
import { aiToFields, type AiFields } from './ratecon-ai-contract'

export type AiResult =
  | { ok: true; fields: RateConFields; model: string }
  | { ok: false; reason: 'no_key' | 'failed'; detail?: string }

export async function aiParseRateCon(input: {
  text?: string
  pdfBase64?: string
  mime?: string
}): Promise<AiResult> {
  try {
    const res = await fetch('/api/ratecon', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = (await res.json()) as
      | { ok: true; fields: AiFields; model: string }
      | { error: string }
    if ('ok' in data) return { ok: true, fields: aiToFields(data.fields, data.model), model: data.model }
    return { ok: false, reason: data.error === 'no_key' ? 'no_key' : 'failed', detail: data.error }
  } catch (e) {
    return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) }
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
