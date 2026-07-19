'use client'

// Pulls the text out of a broker's PDF, in the browser. The file never leaves the
// phone or the laptop — no upload, no server, no API, no cost.

/** One positioned text fragment. Geometry matters: see extractPdf below. */
export type PdfItem = { x: number; y: number; s: string }

export type PdfContent = {
  /** Reading-order text — labels, rate and mileage are found in this. */
  text: string
  /**
   * Every fragment with coordinates. Real rate cons lay the stop address out as a
   * COLUMN beside a spec table, so reading-order text shreds it:
   *   x=34 y=364  ST. CHARLES TRADING, INC.     x=254 y=359  Max Lading Length
   *   x=34 y=356  1400 MADELINE LANE            x=254 y=351  Max Lading Width
   *   x=34 y=348  ELGIN, IL 60124 US
   * Reading by line interleaves the two. Reading down the column recovers the
   * address the driver actually needs.
   */
  items: PdfItem[]
}

export async function extractPdf(file: File): Promise<PdfContent> {
  // Loaded on demand: pdf.js is ~1MB and only this page needs it.
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise

  const pages: string[] = []
  const items: PdfItem[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()

    // Page number keeps y monotonic across pages, so a stop on page 2 can't pick up
    // a neighbour from page 1 at the same height.
    const pageOffset = (doc.numPages - i) * 10000

    const rows = new Map<number, { x: number; s: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5] as number)
      const x = Math.round(item.transform[4] as number)
      items.push({ x, y: y + pageOffset, s: item.str.trim() })
      const row = rows.get(y) ?? []
      row.push({ x, s: item.str })
      rows.set(y, row)
    }

    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // PDF y grows upward; page reads top-down
      .map(([, row]) =>
        row
          .sort((a, b) => a.x - b.x)
          .map((c) => c.s)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean)

    pages.push(lines.join('\n'))
  }

  return { text: pages.join('\n'), items }
}

/** Scanned rate cons have no text layer — say so instead of failing silently. */
export function looksScanned(text: string): boolean {
  return text.replace(/\s/g, '').length < 40
}
