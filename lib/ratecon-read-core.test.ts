import test from 'node:test'
import assert from 'node:assert/strict'
import { buildParts, readRateConCore, thinkingFor } from './ratecon-read-core.ts'
import { AI_MODELS } from './ratecon-ai-contract.ts'

type Call = { model: string; body: { generationConfig: { thinkingConfig?: unknown } } }

/** Подменяет fetch: answer(model, callNo) решает, что отвечает «Google». */
function mockFetch(answer: (model: string, n: number) => Response | 'hang') {
  const calls: Call[] = []
  const orig = globalThis.fetch
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const model = /models\/([^:]+):/.exec(String(url))![1]!
    calls.push({ model, body: JSON.parse(String(init.body)) })
    const r = answer(model, calls.filter((c) => c.model === model).length)
    if (r === 'hang')
      return new Promise((_, rej) =>
        init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('t'), { name: 'TimeoutError' }))),
      )
    return r
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = orig) }
}

const good = (fields: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(fields) }] } }] }), {
    status: 200,
  })
const opts = { key: 'k', quality: false, locale: 'ru' as const, pauseMs: 1 }

test('buildParts: пусто — null; скан — файл и текстовый слой', () => {
  assert.equal(buildParts({}), null)
  const p = buildParts({ fileBase64: 'AAA', mime: 'image/jpeg', text: 'Rate $1000' })!
  assert.equal(p.length, 3)
  assert.deepEqual((p[1] as { inlineData: unknown }).inlineData, { mimeType: 'image/jpeg', data: 'AAA' })
})

test('thinkingFor: gemini-3 — low, 2.5-flash — бюджет, lite — без', () => {
  assert.deepEqual(thinkingFor('gemini-3-flash-preview'), { thinkingLevel: 'low' })
  assert.deepEqual(thinkingFor('gemini-2.5-flash'), { thinkingBudget: 1024 })
  assert.equal(thinkingFor('gemini-2.5-flash-lite'), undefined)
})

test('модель зависла — следующая отвечает', async () => {
  const m = mockFetch((model) => (model === AI_MODELS[0] ? 'hang' : good({ stops: [] })))
  // Таймер AbortSignal.timeout не держит процесс — без этого тест кончается раньше срока.
  const keep = setInterval(() => {}, 5)
  try {
    const r = await readRateConCore({ text: 'x' }, { ...opts, modelMs: 30 })
    assert.equal(r.ok, true)
    assert.equal(r.ok && r.model, AI_MODELS[1])
  } finally {
    clearInterval(keep)
    m.restore()
  }
})

test('все заняты в первом круге — второй круг проходит', async () => {
  const m = mockFetch((model, n) => (n === 1 ? new Response('overloaded', { status: 503 }) : good({ stops: [{}] })))
  try {
    const r = await readRateConCore({ text: 'x' }, opts)
    assert.equal(r.ok, true)
    assert.equal(m.calls.length, AI_MODELS.length + 1)
  } finally {
    m.restore()
  }
})

test('квота и 404 во второй круг не идут, ошибка словами', async () => {
  const m = mockFetch((model) =>
    model === AI_MODELS[0] ? new Response('nope', { status: 404 }) : new Response('quota', { status: 429 }),
  )
  try {
    const r = await readRateConCore({ text: 'x' }, opts)
    assert.equal(r.ok, false)
    assert.equal(m.calls.length, AI_MODELS.length)
  } finally {
    m.restore()
  }
})

test('400 про thinking — повтор той же модели без настройки', async () => {
  const m = mockFetch((model, n) =>
    n === 1 && thinkingFor(model)
      ? new Response('Unknown name "thinkingLevel": thinking_config', { status: 400 })
      : good({ stops: [] }),
  )
  try {
    const r = await readRateConCore({ text: 'x' }, { ...opts, quality: true })
    assert.equal(r.ok, true)
    assert.equal(m.calls.length, 2)
    assert.ok(m.calls[0]!.body.generationConfig.thinkingConfig)
    assert.equal(m.calls[1]!.body.generationConfig.thinkingConfig, undefined)
  } finally {
    m.restore()
  }
})
