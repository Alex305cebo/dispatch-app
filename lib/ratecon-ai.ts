'use client'

// Thin client for /api/ratecon. The Gemini key never reaches the browser — the
// route holds it; this file only ships bytes and maps the answer.

import type { RateConFields } from './ratecon'
import { aiToFields, type AiFields } from './ratecon-ai-contract'
import { t, type Locale } from './i18n.ts'

export type AiResult =
  | { ok: true; fields: RateConFields; model: string }
  /** 'off' — чтение закрыто для этого входа (демо, без входа): detail — готовая фраза
   * человеку, повторять запрос бессмысленно. */
  | { ok: false; reason: 'no_key' | 'failed' | 'off'; detail?: string }

/** Ответ сервера JSON-ом, либо null: вместо JSON пришла страница хостинга (перегрузка,
 * перезапуск при выкладке, фильтр) — тогда code говорит, что именно. */
async function getJson(url: string, init?: RequestInit): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { ...init, cache: 'no-store' })
  const raw = await res.text()
  try {
    return { status: res.status, data: JSON.parse(raw) as Record<string, unknown> }
  } catch {
    return { status: res.status, data: null }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Чтение Rate Con задачей: POST ставит её (ответ сразу), дальше короткие GET раз в
 * пару секунд, пока модели читают. Раньше один POST ждал весь разбор, и прокси хостинга
 * рвал его на сканах — «Сервер долго отвечал» (lib/ratecon-read.ts).
 *
 * docId — документ уже сохранён: файл второй раз не едет, сервер берёт его из базы.
 * Короткие сбои сети и страницы хостинга вместо JSON переживаются повтором.
 */
export async function aiParseRateCon(
  input: {
    text?: string
    pdfBase64?: string
    mime?: string
    docId?: number
  },
  locale: Locale = 'en',
  onWait?: (seconds: number) => void,
): Promise<AiResult> {
  const startedAt = Date.now()
  let lastStatus = 0
  try {
    // 1) Поставить задачу. Три попытки: страница хостинга (503 при перегрузке, 502 при
    // перезапуске) обычно проходит за секунды.
    let job = 0
    for (let i = 0; i < 3 && !job; i++) {
      if (i) await sleep(2000 * i)
      const { status, data } = await getJson('/api/ratecon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      }).catch(() => ({ status: 0, data: null }))
      lastStatus = status
      if (!data) continue
      if (typeof data.job === 'number') job = data.job
      else if (data.ok && data.fields) {
        // Старый сервер (вкладка новее выкладки) ещё отвечает итогом сразу.
        return { ok: true, fields: aiToFields(data.fields as AiFields, String(data.model), locale), model: String(data.model) }
      } else {
        const error = String(data.error ?? '')
        if (status === 401 || status === 403) return { ok: false, reason: 'off', detail: error }
        return { ok: false, reason: error === 'no_key' ? 'no_key' : 'failed', detail: error }
      }
    }
    if (!job) return { ok: false, reason: 'failed', detail: hostingFail(lastStatus, locale) }

    // 2) Ждать итог. Сервер сам бросает задачу через ~4.5 мин, здесь потолок с запасом.
    let misses = 0
    while (Date.now() - startedAt < 330_000) {
      await sleep(2500)
      onWait?.(Math.round((Date.now() - startedAt) / 1000))
      const { status, data } = await getJson(`/api/ratecon?job=${job}`).catch(() => ({ status: 0, data: null }))
      lastStatus = status
      if (!data) {
        // Страница хостинга или обрыв сети — задача на сервере идёт дальше, спросим ещё.
        if (++misses >= 12) break
        continue
      }
      misses = 0
      if (data.status === 'working') continue
      if (data.ok && data.fields) {
        return { ok: true, fields: aiToFields(data.fields as AiFields, String(data.model), locale), model: String(data.model) }
      }
      if (status === 401 || status === 403) return { ok: false, reason: 'off', detail: String(data.error ?? '') }
      return { ok: false, reason: 'failed', detail: String(data.error ?? '') || undefined }
    }
    return { ok: false, reason: 'failed', detail: hostingFail(lastStatus, locale) }
  } catch (e) {
    return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) }
  }
}

/** Сервер так и не ответил JSON-ом — по-человечески и с кодом, чтобы было видно, что это. */
function hostingFail(status: number, locale: Locale): string {
  return t(locale, 'rateconAi.hostingFail').replace('{code}', status ? `HTTP ${status}` : t(locale, 'rateconAi.noNetwork'))
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
