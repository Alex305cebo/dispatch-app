// Telegram intake: driver sends a photo in the chat → we classify it (Gemini) →
// attach to that driver's active load as BOL/POD. Plus POD-chasing reminders.
// SERVER ONLY. Safe no-op when Telegram isn't connected.

import { sql } from './db.ts'
import { getSetting, setSetting } from './settings.ts'
import { tgConnected, tgInboundMedia, tgSend } from './telegram.ts'
import { activeLoadForTruck } from './loads.ts'
import { classifyDocument } from './ai-doc.ts'

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** phone(last10) → {truckId, number}, from truck passports. */
async function phoneMap(): Promise<Map<string, { truckId: number; number: string }>> {
  const rows = (await sql`
    SELECT m.truck_id, m.driver_phone, t.number FROM truck_meta m
    JOIN trucks t ON t.id = m.truck_id WHERE m.driver_phone IS NOT NULL`) as any[]
  return new Map(rows.map((r) => [digits(r.driver_phone).slice(-10), { truckId: r.truck_id, number: r.number }]))
}

/**
 * Pull new inbound media, file BOL/POD to the sender's active load. Returns a
 * summary. Idempotent via per-chat last-processed message id in settings.
 */
export async function intakeDriverMedia(): Promise<{ attached: number; skipped: number } | { error: string }> {
  if (!(await tgConnected())) return { error: 'not_connected' }

  const seenRaw = (await getSetting('tg_last_seen')) ?? '{}'
  const since: Record<string, number> = JSON.parse(seenRaw)
  const phones = await phoneMap()

  let media
  try {
    media = await tgInboundMedia(since)
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }

  let attached = 0
  let skipped = 0
  const maxSeen: Record<string, number> = { ...since }

  for (const m of media) {
    maxSeen[m.chatId] = Math.max(maxSeen[m.chatId] ?? 0, m.msgId)
    const truck = m.phone ? phones.get(digits(m.phone).slice(-10)) : undefined
    if (!truck) {
      skipped++
      continue // not a known driver — leave it alone
    }
    const load = await activeLoadForTruck(truck.truckId)
    if (!load) {
      skipped++
      continue
    }
    const base64 = m.bytes.toString('base64')
    const kind = await classifyDocument(base64, m.mime)
    // Only file real load paperwork; ignore fuel receipts / random photos.
    if (kind !== 'pod' && kind !== 'bol') {
      skipped++
      continue
    }
    const hex = m.bytes.toString('hex')
    const ext = m.mime.includes('pdf') ? 'pdf' : 'jpg'
    await sql`
      INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data)
      VALUES (${load.id}, ${truck.truckId}, ${kind},
              ${`${kind.toUpperCase()} #${truck.number} tg.${ext}`}, ${m.mime}, ${m.bytes.length},
              decode(${hex}, 'hex'))`
    attached++
    // Acknowledge like a human dispatcher would — short, so the channel stays trusted.
    await tgSend(m.chatId, kind === 'pod' ? 'POD получил, спасибо 👍' : 'BOL получил, спасибо').catch(() => {})
  }

  await setSetting('tg_last_seen', JSON.stringify(maxSeen))
  return { attached, skipped }
}

/**
 * Chase missing PODs: loads delivered ≥45 min ago, not invoiced, no POD attached,
 * whose truck has a driver phone/chat → one nudge (once, tracked per load).
 */
export async function remindMissingPods(): Promise<{ nudged: number } | { error: string }> {
  if (!(await tgConnected())) return { error: 'not_connected' }

  const rows = (await sql`
    SELECT l.id, l.origin, l.destination, t.number, m.driver_phone
    FROM loads l
    JOIN trucks t ON t.id = l.truck_id
    LEFT JOIN truck_meta m ON m.truck_id = t.id
    WHERE l.status = 'delivered' AND l.invoiced_at IS NULL
      AND l.created_at < now() - interval '45 minutes'
      AND m.driver_phone IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.load_id = l.id AND d.kind = 'pod')`) as any[]

  const notified: number[] = JSON.parse((await getSetting('pod_nudged')) ?? '[]')
  const set = new Set(notified)

  // Need the chat id for each driver phone — resolve via dialogs once.
  const { tgDialogs } = await import('./telegram.ts')
  const dialogs = await tgDialogs().catch(() => [])
  const chatByPhone = new Map(dialogs.filter((d) => d.phone).map((d) => [digits(d.phone).slice(-10), d.id]))

  let nudged = 0
  for (const r of rows) {
    if (set.has(r.id)) continue
    const chat = chatByPhone.get(digits(r.driver_phone).slice(-10))
    if (!chat) continue
    await tgSend(
      chat,
      `Скинь, пожалуйста, фото POD по грузу ${r.origin ?? ''} → ${r.destination ?? ''} — надо выставить счёт.`,
    ).catch(() => {})
    set.add(r.id)
    nudged++
  }
  await setSetting('pod_nudged', JSON.stringify([...set].slice(-200)))
  return { nudged }
}
