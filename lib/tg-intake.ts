// Telegram intake: driver sends a photo in the chat → we classify it (Gemini) →
// attach to that driver's active load as BOL/POD. Plus POD-chasing reminders.
// SERVER ONLY. Safe no-op when no Telegram account is connected.
//
// PER-USER: each dispatcher connects their own account, so intake loops over every
// connected account — a driver can message whichever dispatcher they know.

import { sql } from './db.ts'
import { getSetting, setSetting } from './settings.ts'
import {
  connectedTgUserIds,
  tgChatIdByPhone,
  tgChatTruckMap,
  tgInboundMedia,
  tgSend,
} from './telegram.ts'
import { activeLoadForTruck } from './loads.ts'
import { classifyDocument } from './ai-doc.ts'
import { autoInvoiceIfReady } from './invoice.ts'

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** phone(last10) → {truckId, number}, from truck passports. */
export async function phoneMap(): Promise<Map<string, { truckId: number; number: string }>> {
  const rows = (await sql`
    SELECT m.truck_id, m.driver_phone, t.number FROM truck_meta m
    JOIN trucks t ON t.id = m.truck_id WHERE m.driver_phone IS NOT NULL`) as any[]
  return new Map(rows.map((r) => [digits(r.driver_phone).slice(-10), { truckId: r.truck_id, number: r.number }]))
}

/** Which truck a chat belongs to, within ONE account (uid): the dispatcher's manual
 * pick (needed for groups, which have no phone at all, and for phone mismatches) wins
 * over the automatic phone match against truck passports. */
export async function resolveTruckForChat(
  uid: number,
  chatId: string,
  phone: string | null,
): Promise<{ truckId: number; number: string } | undefined> {
  const manual = (await tgChatTruckMap(uid))[chatId]
  if (manual) {
    const rows = (await sql`SELECT id, number FROM trucks WHERE id = ${manual}`) as { id: number; number: string }[]
    if (rows[0]) return { truckId: rows[0].id, number: rows[0].number }
  }
  return phone ? (await phoneMap()).get(digits(phone).slice(-10)) : undefined
}

/**
 * Pull new inbound media across ALL connected accounts, file BOL/POD to the sender's
 * active load. Idempotent via a per-account, per-chat last-processed message id.
 */
export async function intakeDriverMedia(): Promise<{ attached: number; skipped: number } | { error: string }> {
  const uids = await connectedTgUserIds()
  if (uids.length === 0) return { error: 'not_connected' }

  let attached = 0
  let skipped = 0

  for (const uid of uids) {
    const seenRaw = (await getSetting(`tg_last_seen:${uid}`)) ?? '{}'
    let since: Record<string, number>
    try {
      since = JSON.parse(seenRaw)
    } catch {
      since = {}
    }

    let media
    try {
      media = await tgInboundMedia(uid, since)
    } catch {
      continue // one account down shouldn't stop the others
    }

    const maxSeen: Record<string, number> = { ...since }
    for (const m of media) {
      // `handled` stays false only if a TRANSIENT error threw (e.g. Gemini timeout on
      // classify) — in that case the cursor below doesn't advance, so this one message
      // is retried next run. A deliberate skip (not a known driver / no active load /
      // not pod-bol / duplicate) IS handled: advance so it's not reprocessed forever.
      let handled = true
      try {
        const truck = await resolveTruckForChat(uid, m.chatId, m.phone)
        const load = truck ? await activeLoadForTruck(truck.truckId) : null
        const kind = truck && load ? await classifyDocument(m.bytes.toString('base64'), m.mime) : null
        if (!truck || !load || (kind !== 'pod' && kind !== 'bol')) {
          skipped++
        } else {
          // A driver who sends the SAME photo to two dispatchers would otherwise file it
          // twice on one load — skip if an identical (same kind + byte size) doc already
          // sits on it. Cheap; dupes here are rare enough not to warrant an index.
          const dup = (await sql`
            SELECT 1 FROM documents
            WHERE load_id = ${load.id} AND kind = ${kind} AND size_bytes = ${m.bytes.length}
              AND deleted_at IS NULL LIMIT 1`) as unknown[]
          if (dup.length) {
            skipped++
          } else {
            const hex = m.bytes.toString('hex')
            const ext = m.mime.includes('pdf') ? 'pdf' : 'jpg'
            await sql`
              INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data)
              VALUES (${load.id}, ${truck.truckId}, ${kind},
                      ${`${kind.toUpperCase()} #${truck.number} tg.${ext}`}, ${m.mime}, ${m.bytes.length},
                      decode(${hex}, 'hex'))`
            attached++
            // A dispatcher only ever has POD/BOL/rate con, never an "invoice" of their
            // own — the invoice is generated FROM the POD, so once it lands there's no
            // manual step.
            if (kind === 'pod') await autoInvoiceIfReady(load.id)
            // Acknowledge like a human dispatcher would — short, keeps the channel trusted.
            await tgSend(uid, m.chatId, kind === 'pod' ? 'POD получил, спасибо 👍' : 'BOL получил, спасибо').catch(() => {})
          }
        }
      } catch {
        // One bad message must not abort the rest of this account or the other accounts.
        handled = false
        skipped++
      }
      if (handled) maxSeen[m.chatId] = Math.max(maxSeen[m.chatId] ?? 0, m.msgId)
    }

    await setSetting(`tg_last_seen:${uid}`, JSON.stringify(maxSeen))
  }

  return { attached, skipped }
}

/**
 * Chase missing PODs: loads delivered ≥45 min ago, not invoiced, no POD attached,
 * whose truck has a driver phone reachable from ANY connected account → one nudge
 * (once, tracked per load), sent from whichever account has that driver's chat.
 */
export async function remindMissingPods(): Promise<{ nudged: number } | { error: string }> {
  const uids = await connectedTgUserIds()
  if (uids.length === 0) return { error: 'not_connected' }

  const rows = (await sql`
    SELECT l.id, l.origin, l.destination, t.number, m.driver_phone
    FROM loads l
    JOIN trucks t ON t.id = l.truck_id
    LEFT JOIN truck_meta m ON m.truck_id = t.id
    WHERE l.status = 'delivered' AND l.invoiced_at IS NULL
      AND l.created_at < now() - interval '45 minutes'
      AND m.driver_phone IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.load_id = l.id AND d.kind = 'pod')`) as any[]
  if (rows.length === 0) return { nudged: 0 }

  const notified: number[] = JSON.parse((await getSetting('pod_nudged')) ?? '[]')
  const set = new Set(notified)

  // phone(last10) → { uid, chatId } across every connected account, so a nudge goes
  // out from whichever dispatcher actually has that driver in their chats.
  const reach = new Map<string, { uid: number; chatId: string }>()
  for (const uid of uids) {
    const byPhone = await tgChatIdByPhone(uid)
    for (const [phone10, chatId] of byPhone) if (!reach.has(phone10)) reach.set(phone10, { uid, chatId })
  }

  let nudged = 0
  for (const r of rows) {
    if (set.has(r.id)) continue
    const hit = reach.get(digits(r.driver_phone).slice(-10))
    if (!hit) continue
    await tgSend(
      hit.uid,
      hit.chatId,
      `Скинь, пожалуйста, фото POD по грузу ${r.origin ?? ''} → ${r.destination ?? ''} — надо выставить счёт.`,
    ).catch(() => {})
    set.add(r.id)
    nudged++
  }
  await setSetting('pod_nudged', JSON.stringify([...set].slice(-200)))
  return { nudged }
}
