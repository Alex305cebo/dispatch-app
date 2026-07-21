'use server'

import { revalidatePath } from 'next/cache'
import { confirmLogin, disconnectTelegram, startLogin, tgMedia, tgSend } from '@/lib/telegram'
import { intakeDriverMedia, remindMissingPods, resolveTruckForChat } from '@/lib/tg-intake'
import { activeLoadForTruck } from '@/lib/loads'
import { classifyDocument } from '@/lib/ai-doc'
import { autoInvoiceIfReady } from '@/lib/invoice'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/session'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function tgStartLogin(
  apiId: string,
  apiHash: string,
  phone: string,
): Promise<{ token: string; deliveryHint: string } | { error: string }> {
  await requireAdmin()
  const id = Number(apiId.trim())
  if (!id || !apiHash.trim() || !phone.trim())
    return { error: 'Нужны api_id, api_hash и телефон.' }
  try {
    return await startLogin(id, apiHash.trim(), phone.trim())
  } catch (e) {
    return { error: `Не отправился код: ${msg(e)}` }
  }
}

export async function tgConfirmLogin(
  token: string,
  code: string,
  password?: string,
): Promise<{ ok: true } | { need2fa: true } | { error: string }> {
  await requireAdmin()
  try {
    const res = await confirmLogin(token, code.trim(), password || undefined)
    if ('ok' in res) revalidatePath('/telegram')
    return res
  } catch (e) {
    return { error: `Вход не удался: ${msg(e)}` }
  }
}

/** Manual trigger for the same work /api/tg-poll does on a schedule — lets the
 * dispatcher pull in a driver's photos right after connecting, without waiting on
 * the external cron ping to be set up. */
export async function tgCheckNow(): Promise<
  { attached: number; skipped: number; nudged: number } | { error: string }
> {
  const [intake, reminders] = await Promise.all([intakeDriverMedia(), remindMissingPods()])
  if ('error' in intake) return { error: intake.error }
  if ('error' in reminders) return { error: reminders.error }
  revalidatePath('/telegram')
  revalidatePath('/loads')
  return { attached: intake.attached, skipped: intake.skipped, nudged: reminders.nudged }
}

/** Wrong account connected — drop the session so the connect form comes back up. */
export async function tgDisconnectAccount(): Promise<void> {
  await requireAdmin()
  await disconnectTelegram()
  revalidatePath('/telegram')
}

/** Manual "file this to the driver's load" for one chat attachment — covers what
 * auto-intake deliberately skips (rate cons, anything not pod/bol), routed by the
 * open chat's phone match, same as the automatic path. */
export async function tgAttachToLoad(
  chatId: string,
  msgId: number,
  driverPhone: string | null,
): Promise<{ ok: true; loadId: number; loadRoute: string } | { error: string }> {
  const truck = await resolveTruckForChat(chatId, driverPhone)
  if (!truck)
    return { error: 'Этот чат не привязан ни к одному траку — укажи телефон в паспорте трака или привяжи чат в админке.' }
  const load = await activeLoadForTruck(truck.truckId)
  if (!load) return { error: 'У этого трака сейчас нет активного груза.' }

  const media = await tgMedia(chatId, msgId).catch(() => null)
  if (!media) return { error: 'Не удалось скачать файл из Telegram.' }

  const kind =
    media.mime.startsWith('image/') || media.mime === 'application/pdf'
      ? await classifyDocument(media.bytes.toString('base64'), media.mime)
      : 'other'
  const ext = media.mime.includes('pdf') ? 'pdf' : 'jpg'
  await sql`
    INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data)
    VALUES (${load.id}, ${truck.truckId}, ${kind},
            ${`${kind.toUpperCase()} #${truck.number} tg.${ext}`}, ${media.mime}, ${media.bytes.length},
            decode(${media.bytes.toString('hex')}, 'hex'))`
  if (kind === 'pod') await autoInvoiceIfReady(load.id)

  revalidatePath(`/loads/${load.id}`)
  revalidatePath('/docs')
  return { ok: true, loadId: load.id, loadRoute: `${load.origin ?? ''} → ${load.destination ?? ''}` }
}

/** Gate for sending a Telegram message — same shared PIN as guarded deletes. The
 * client re-checks this once per unlock window (2 min), not per message. */
export async function verifyTgSendPin(pin: string): Promise<{ ok: true } | { error: string }> {
  if (!process.env.APP_PIN) return { error: 'APP_PIN не настроен на сервере.' }
  if (pin !== process.env.APP_PIN) return { error: 'Неверный PIN.' }
  return { ok: true }
}

export async function tgSendMessage(
  chatId: string,
  text: string,
): Promise<{ error: string } | void> {
  if (!text.trim()) return { error: 'Пустое сообщение.' }
  try {
    await tgSend(chatId, text.trim())
    revalidatePath('/telegram')
  } catch (e) {
    return { error: `Не отправилось: ${msg(e)}` }
  }
}
