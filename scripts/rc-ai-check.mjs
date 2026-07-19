// Batch-verify the AI rate-con path on real PDFs, using the SAME prompt/schema/
// mapping the app runs (lib/ratecon-ai-contract.ts). Text PDFs send text, scans
// send the PDF bytes — exactly like import-client.
//   node --env-file=.env.local scripts/rc-ai-check.mjs <file.pdf> [more...]
//   node --env-file=.env.local scripts/rc-ai-check.mjs --dir <folder> [N]
import { readFile, readdir } from 'node:fs/promises'
import { AI_MODELS, AI_PROMPT, AI_SCHEMA, aiToFields } from '../lib/ratecon-ai-contract.ts'
import { formatDriverInfo } from '../lib/ratecon.ts'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) {
  console.error('GEMINI_API_KEY is not set (.env.local)')
  process.exit(1)
}

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

async function extractText(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
  const pages = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    const rows = new Map()
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const y = Math.round(it.transform[5])
      const r = rows.get(y) ?? []
      r.push({ x: Math.round(it.transform[4]), s: it.str })
      rows.set(y, r)
    }
    pages.push(
      [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, r]) => r.sort((a, b) => a.x - b.x).map((c) => c.s).join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n'),
    )
  }
  return pages.join('\n')
}

async function askGemini(parts) {
  let lastErr = ''
  for (const model of AI_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: AI_SCHEMA, temperature: 0 },
        }),
      },
    )
    if (!res.ok) {
      lastErr = `${model}: HTTP ${res.status}`
      if (res.status === 429) await new Promise((r) => setTimeout(r, 15_000)) // free-tier RPM
      continue
    }
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    try {
      return { fields: JSON.parse(text), model }
    } catch {
      lastErr = `${model}: unparseable`
    }
  }
  throw new Error(lastErr)
}

let files = process.argv.slice(2)
const verbose = !files.includes('--dir')
if (files[0] === '--dir') {
  const dir = files[1]
  const N = Number(files[2] || 20)
  files = (await readdir(dir))
    .filter((f) => /\.pdf$/i.test(f) && /rc|rate|confirmation/i.test(f) && !/pod|bol|signed|invoice|birth|application/i.test(f))
    .slice(0, N)
    .map((f) => dir + '/' + f)
}

for (const path of files) {
  const name = path.split(/[\\/]/).pop()
  try {
    const bytes = await readFile(path)
    const text = await extractText(bytes).catch(() => '')
    const scanned = text.replace(/\s/g, '').length < 40
    const parts = [{ text: AI_PROMPT }]
    if (scanned) parts.push({ inlineData: { mimeType: 'application/pdf', data: Buffer.from(bytes).toString('base64') } })
    else parts.push({ text: 'DOCUMENT TEXT:\n' + text.slice(0, 60_000) })

    const { fields, model } = await askGemini(parts)
    const f = aiToFields(fields, model)
    const first = (b) => (b ? b.split('\n')[0].slice(0, 36) : '—')
    console.log(
      `${scanned ? '[scan]' : '      '} ${name.slice(0, 38).padEnd(38)} | PU: ${first(f.pickupStop.block).padEnd(36)} | DEL: ${first(f.deliveryStop.block).padEnd(30)} | $${f.rate?.value ?? '—'}`,
    )
    if (verbose) console.log(formatDriverInfo(f) + '\n')
  } catch (e) {
    console.log(`✗ ${name}: ${e.message.slice(0, 80)}`)
  }
}
