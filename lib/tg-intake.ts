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
} from './telegram.ts'
import { activeLoadForTruck } from './loads.ts'
import { classifyDocument, type DocClass } from './ai-doc.ts'
import { captionKind } from './caption-kind.ts'
import { autoInvoiceIfReady } from './invoice.ts'

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

// Telegram accounts are always real people talking to real drivers — the public demo
// sandbox never has one connected, and never should. Every truck/load lookup in this
// file is pinned to the real fleet explicitly, never derived from a session.
const REAL = 'default'

/** phone(last10) → {truckId, number}, from truck passports. */
export async function phoneMap(): Promise<Map<string, { truckId: number; number: string }>> {
  const rows = (await sql`
    SELECT m.truck_id, m.driver_phone, t.number FROM truck_meta m
    JOIN trucks t ON t.id = m.truck_id WHERE t.company_id = ${REAL} AND m.driver_phone IS NOT NULL`) as any[]
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
    const rows = (await sql`
      SELECT id, number FROM trucks WHERE id = ${manual} AND company_id = ${REAL}`) as { id: number; number: string }[]
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
      // nothing we file / duplicate) IS handled: advance so it's not reprocessed forever.
      let handled = true
      try {
        const truck = await resolveTruckForChat(uid, m.chatId, m.phone)
        const load = truck ? await activeLoadForTruck(REAL, truck.truckId) : null
        // Caption keyword wins (trusted label, no AI). Otherwise only INBOUND driver
        // media gets vision-classified — the dispatcher's own posts file solely by
        // caption, never guessed as a POD/BOL.
        const forced = captionKind(m.text)
        // Рейткон принимается и БЕЗ активного груза: он описывает будущий рейс, а не
        // текущий. POD и BOL — наоборот, они всегда про тот груз, что трак везёт.
        const kind: DocClass | null = !truck
          ? null
          : forced ?? (m.mine ? null : await classifyDocument(m.bytes.toString('base64'), m.mime))
        // Рейткон НИКОГДА не подшивается к текущему грузу. Он описывает СВОЙ рейс —
        // водитель присылает бумагу на завтрашний груз, а она вставала документом к
        // тому, что трак везёт сегодня: в грузе Уолпол→Фредерик лежал рейткон на
        // Северную Каролину → Флориду. Складываем его к траку без груза, и трак
        // предлагает «Создать груз из рейт-кона» (components/orphan-ratecons.tsx),
        // где рейс заводится по самой бумаге.
        const rcNoLoad = kind === 'ratecon'
        const target = rcNoLoad ? null : load
        // Лист водителя (TQL и другие шлют его вместе с рейт-коном) — такой же
        // нужный документ груза, как BOL: подшивается к текущему грузу.
        const filed = kind === 'pod' || kind === 'bol' || kind === 'ratecon' || kind === 'driverinfo'
        if (!truck || (!target && !rcNoLoad) || !filed) {
          skipped++
        } else {
          // A driver who sends the SAME photo to two dispatchers would otherwise file it
          // twice on one load — skip if an identical (same kind + byte size) doc already
          // sits on it. Cheap; dupes here are rare enough not to warrant an index.
          const dup = (await sql`
            SELECT 1 FROM documents
            WHERE truck_id = ${truck.truckId} AND kind = ${kind} AND size_bytes = ${m.bytes.length}
              AND deleted_at IS NULL LIMIT 1`) as unknown[]
          if (dup.length) {
            skipped++
          } else {
            const hex = m.bytes.toString('hex')
            const ext = m.mime.includes('pdf') ? 'pdf' : 'jpg'
            await sql`
              INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data, company_id)
              VALUES (${target ? target.id : null}, ${truck.truckId}, ${kind},
                      ${`${kind.toUpperCase()} #${truck.number} tg.${ext}`}, ${m.mime}, ${m.bytes.length},
                      decode(${hex}, 'hex'), ${REAL})`
            attached++
            // A dispatcher only ever has POD/BOL/rate con, never an "invoice" of their
            // own — the invoice is generated FROM the POD, so once it lands there's no
            // manual step.
            if (kind === 'pod' && target) await autoInvoiceIfReady(REAL, target.id)
            // Автоответа водителю здесь НЕТ и быть не должно. Раньше на каждый
            // присланный файл уходила квитанция («POD получил, спасибо 👍») от
            // имени диспетчера. Правило владельца: приложение не пишет в Telegram
            // само — ни при каких условиях. Всё, что уходит наружу, набирает
            // человек в чате портала (tgSendMessage).
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
 * Догонялка POD удалена НАМЕРЕННО (август 2026).
 *
 * Она сама писала водителям «Скинь фото POD — надо выставить счёт»: по разу на
 * груз, из аккаунта того диспетчера, у кого водитель есть в чатах. При первом же
 * подключении Telegram это выстрелило пачкой сообщений по грузам месячной
 * давности. Владелец правило задал прямо: НИКАКИХ автоматических сообщений,
 * пока он не попросит конкретно.
 *
 * Что видно вместо неё, без единого сообщения: «Доставлено, счёт не выставлен»
 * на странице Финансы — тот же список, только читает его диспетчер, а решает,
 * писать ли водителю, человек.
 */
