// Reproduce the APP's rate-con reading in Node: extract with pdfjs exactly like
// lib/pdf-text.ts, then run the real parser. Usage:
//   node scripts/rc-check.mjs "C:/path/one.pdf" "C:/path/two.pdf"
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { parseRateCon, formatDriverInfo } from '../lib/ratecon.ts'

const require = createRequire(import.meta.url)
// Legacy build is the Node-friendly one (no DOM, no worker needed).
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

// Mirror lib/pdf-text.ts extractPdf() so parser input matches the app byte-for-byte.
async function extractPdf(path) {
  const data = new Uint8Array(await readFile(path))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const pages = []
  const items = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const pageOffset = (doc.numPages - i) * 10000
    const rows = new Map()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const x = Math.round(item.transform[4])
      items.push({ x, y: y + pageOffset, s: item.str.trim() })
      const row = rows.get(y) ?? []
      row.push({ x, s: item.str })
      rows.set(y, row)
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((c) => c.s).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    pages.push(lines.join('\n'))
  }
  return { text: pages.join('\n'), items }
}

for (const path of process.argv.slice(2)) {
  console.log('\n========================================')
  console.log('FILE:', path.split(/[\\/]/).pop())
  try {
    const { text, items } = await extractPdf(path)
    const f = parseRateCon(text, items)
    console.log('--- ORIGIN/DEST (city) ---')
    console.log('origin      :', f.origin?.value ?? '—')
    console.log('destination :', f.destination?.value ?? '—')
    console.log('--- PICKUP block ---\n' + (f.pickupStop.block ?? '—'))
    console.log('--- DELIVERY block ---\n' + (f.deliveryStop.block ?? '—'))
    console.log('rate:', f.rate?.value ?? '—', '| miles:', f.loadedMiles?.value ?? '—', '| ref:', f.referenceId?.value ?? '—')
    if (process.env.SHOW_TEXT) console.log('\n--- TEXT (first 1600) ---\n' + text.slice(0, 1600))
  } catch (e) {
    console.log('ERROR:', e.message)
  }
}
