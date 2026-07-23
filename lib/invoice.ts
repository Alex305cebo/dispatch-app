// Invoice + document packet — the #1 roadmap feature. Builds a broker invoice PDF
// from a load, then merges it with that load's rate con + POD into one PDF the
// dispatcher sends (or emails). SERVER ONLY (DB + pdf-lib).

import { revalidatePath } from 'next/cache'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { sql } from './db.ts'
import { getSetting } from './settings.ts'
import { getLoad } from './loads.ts'
import type { LoadRecord } from './map.ts'
import { t, type Locale } from './i18n.ts'

export type Company = {
  name: string
  owner: string // company owner / boss (e.g. Dubinsky Nick) — sometimes drives too
  mcdot: string
  address: string
  email: string
  phone: string
  remitTo: string // factoring remit-to; empty = pay us directly
}

export async function getCompany(): Promise<Company> {
  const [name, owner, mcdot, address, email, phone, remitTo] = await Promise.all([
    getSetting('co_name'),
    getSetting('co_owner'),
    getSetting('co_mcdot'),
    getSetting('co_address'),
    getSetting('co_email'),
    getSetting('co_phone'),
    getSetting('co_remit_to'),
  ])
  return {
    name: name ?? '',
    owner: owner ?? '',
    mcdot: mcdot ?? '',
    address: address ?? '',
    email: email ?? '',
    phone: phone ?? '',
    remitTo: remitTo ?? '',
  }
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

/** The single-page invoice sheet. */
async function invoicePdf(
  load: LoadRecord,
  co: Company,
  invoiceNumber: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([612, 792]) // US Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.1, 0.11, 0.13)
  const grey = rgb(0.4, 0.42, 0.46)
  let y = 740

  const text = (s: string, x: number, size = 11, f = font, color = ink) =>
    page.drawText(s, { x, y, size, font: f, color })

  text(co.name || 'Your Company', 50, 20, bold)
  y -= 16
  if (co.mcdot) { text(co.mcdot, 50, 10, font, grey); y -= 13 }
  if (co.address) { text(co.address, 50, 10, font, grey); y -= 13 }
  if (co.phone || co.email) { text([co.phone, co.email].filter(Boolean).join('  ·  '), 50, 10, font, grey); y -= 13 }

  y = 740
  page.drawText('INVOICE', { x: 440, y, size: 22, font: bold, color: ink })
  y -= 20
  page.drawText(`# ${invoiceNumber}`, { x: 440, y, size: 11, font, color: grey })
  y -= 14
  page.drawText(new Date().toISOString().slice(0, 10), { x: 440, y, size: 11, font, color: grey })

  y = 650
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 1, color: rgb(0.85, 0.86, 0.88) })

  const row = (label: string, value: string) => {
    page.drawText(label, { x: 50, y, size: 11, font: bold, color: ink })
    page.drawText(value, { x: 200, y, size: 11, font, color: ink })
    y -= 22
  }
  row('Load / Ref #', load.referenceId ?? String(load.id))
  row('Route', `${load.origin ?? '-'}  ->  ${load.destination ?? '-'}`)
  if (load.brokerMc) row('Broker MC', load.brokerMc)
  row('Delivered', new Date().toISOString().slice(0, 10))
  row('Terms', `Net ${load.paymentTermsDays ?? 30}`)

  y -= 10
  page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 562, y: y + 10 }, thickness: 1, color: rgb(0.85, 0.86, 0.88) })
  y -= 10
  page.drawText('Line haul', { x: 50, y, size: 12, font, color: ink })
  page.drawText(money(load.rate), { x: 470, y, size: 12, font, color: ink })
  y -= 26
  page.drawText('TOTAL DUE', { x: 50, y, size: 14, font: bold, color: ink })
  page.drawText(money(load.rate), { x: 460, y, size: 14, font: bold, color: ink })

  y -= 50
  if (co.remitTo) {
    page.drawText('REMIT TO (payment assigned — Notice of Assignment):', { x: 50, y, size: 10, font: bold, color: ink })
    y -= 14
    for (const line of co.remitTo.split('\n')) {
      page.drawText(line, { x: 50, y, size: 10, font, color: ink })
      y -= 13
    }
  } else {
    page.drawText('Remit payment to the address above.', { x: 50, y, size: 10, font, color: grey })
  }

  return pdf.save()
}

/** Append a stored document (PDF pages or an image) into the packet. */
async function appendDoc(packet: PDFDocument, mime: string, bytes: Uint8Array) {
  if (mime === 'application/pdf') {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const pages = await packet.copyPages(src, src.getPageIndices())
    pages.forEach((p) => packet.addPage(p))
  } else if (mime.startsWith('image/')) {
    const img = mime.includes('png') ? await packet.embedPng(bytes) : await packet.embedJpg(bytes)
    const page = packet.addPage([612, 792])
    const scale = Math.min(512 / img.width, 692 / img.height)
    page.drawImage(img, {
      x: (612 - img.width * scale) / 2,
      y: (792 - img.height * scale) / 2,
      width: img.width * scale,
      height: img.height * scale,
    })
  }
}

/**
 * Build invoice + packet, store as a document, stamp the load as invoiced.
 * Blocks if no POD is attached — brokers won't pay without it.
 */
export async function buildInvoicePacket(
  load: LoadRecord,
  locale: Locale = 'en',
): Promise<{ docId: number; invoiceNumber: string } | { error: string }> {
  const co = await getCompany()
  if (!co.name || !co.mcdot)
    return { error: t(locale, 'finances.err.noCompany') }

  // POD gate.
  const docs = (await sql`
    SELECT kind, mime, encode(data,'base64') AS b64 FROM documents
    WHERE load_id = ${load.id} AND company_id = ${load.companyId} ORDER BY kind`) as { kind: string; mime: string; b64: string }[]
  if (!docs.some((d) => d.kind === 'pod'))
    return { error: t(locale, 'finances.err.noPod') }

  const invoiceNumber = load.referenceId ? `INV-${load.referenceId}` : `INV-${load.id}`
  const packet = await PDFDocument.create()

  // 1) invoice sheet
  const invBytes = await invoicePdf(load, co, invoiceNumber)
  const invDoc = await PDFDocument.load(invBytes)
  ;(await packet.copyPages(invDoc, invDoc.getPageIndices())).forEach((p) => packet.addPage(p))

  // 2) supporting docs: rate con, then POD/BOL — that's the order brokers expect.
  const order = ['ratecon', 'pod', 'bol']
  for (const kind of order) {
    for (const d of docs.filter((x) => x.kind === kind)) {
      await appendDoc(packet, d.mime, Buffer.from(d.b64, 'base64')).catch(() => {})
    }
  }

  const bytes = Buffer.from(await packet.save())
  const hex = bytes.toString('hex')
  const rows = await sql`
    INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data, company_id)
    VALUES (${load.id}, ${load.truckId}, 'invoice', ${`${invoiceNumber} packet.pdf`},
            'application/pdf', ${bytes.length}, decode(${hex}, 'hex'), ${load.companyId})
    RETURNING id`
  const docId = (rows[0] as { id: number }).id

  await sql`
    UPDATE loads SET invoice_number = ${invoiceNumber}, invoiced_at = now(),
      status = CASE WHEN status IN ('quoted','booked','in_transit','delivered') THEN 'delivered' ELSE status END
    WHERE id = ${load.id} AND company_id = ${load.companyId}`

  return { docId, invoiceNumber }
}

/** Best-effort auto-invoice: a dispatcher only ever HAS a POD/BOL/rate con, never
 * an "invoice" of their own to upload — the invoice itself is generated FROM those,
 * so once a POD lands (and company details are filled in) there's no reason to wait
 * on someone remembering a manual button. Silent no-op if company info or the rate
 * con isn't ready yet — buildInvoicePacket's own gates just don't fire, and the load
 * stays visible in the AR page's "не выставлен" bucket until they are. */
export async function autoInvoiceIfReady(companyId: 'default' | 'demo', loadId: number): Promise<void> {
  const load = await getLoad(companyId, loadId)
  if (!load || load.invoicedAt) return
  try {
    await buildInvoicePacket(load)
  } catch {
    // best-effort — can still be generated by hand from the load page
  }
  revalidatePath(`/loads/${loadId}`)
  revalidatePath('/invoices')
  revalidatePath('/')
}
