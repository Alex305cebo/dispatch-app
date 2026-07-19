// Compact batch: one line per PDF. Flags suspicious parses so the broker-address /
// pickup==delivery / empty cases jump out. Usage: node scripts/rc-batch.mjs <dir> [N]
import { readFile, readdir } from 'node:fs/promises'
import { parseRateCon } from '../lib/ratecon.ts'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

async function extractPdf(path) {
  const data = new Uint8Array(await readFile(path))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const pages = [], items = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const off = (doc.numPages - i) * 10000
    const rows = new Map()
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const y = Math.round(it.transform[5]), x = Math.round(it.transform[4])
      items.push({ x, y: y + off, s: it.str.trim() })
      const r = rows.get(y) ?? []; r.push({ x, s: it.str }); rows.set(y, r)
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0])
      .map(([, r]) => r.sort((a, b) => a.x - b.x).map((c) => c.s).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
    pages.push(lines.join('\n'))
  }
  return { text: pages.join('\n'), items }
}

const dir = process.argv[2]
const N = Number(process.argv[3] || 40)
const files = (await readdir(dir)).filter((f) => /\.pdf$/i.test(f) && /rc|rate|confirmation/i.test(f) && !/pod|bol|signed|invoice|birth|application/i.test(f)).slice(0, N)

const first = (b) => (b ? b.split('\n')[0].slice(0, 34) : '—')
for (const f of files) {
  try {
    const { text, items } = await extractPdf(dir + '/' + f)
    const r = parseRateCon(text, items)
    const pu = r.pickupStop.block, del = r.deliveryStop.block
    const flags = []
    if (pu && del && pu === del) flags.push('PU==DEL')
    if (!pu) flags.push('NO-PU')
    if (pu && !/\d/.test(pu)) flags.push('PU-city-only')
    // broker heuristic: pickup block near broker words
    if (pu && /\b(broker|logistics|freight|dispatch|carrier services|3pl)\b/i.test(pu)) flags.push('PU-broker?')
    console.log(`${flags.length ? '⚠ ' : '  '}${f.slice(0, 40).padEnd(40)} | PU: ${first(pu).padEnd(34)} | DEL: ${first(del).padEnd(30)} ${flags.join(',')}`)
  } catch (e) {
    console.log(`✗ ${f.slice(0, 40)} : ${e.message.slice(0, 50)}`)
  }
}
