'use server'

import { revalidatePath } from 'next/cache'
import {
  confirmLogin,
  disconnectTelegram,
  setTgChatTruck,
  setTgShownChats,
  startLogin,
  tgMedia,
  tgSend,
} from '@/lib/telegram'
import { intakeDriverMedia, remindMissingPods, resolveTruckForChat } from '@/lib/tg-intake'
import { activeLoadForTruck } from '@/lib/loads'
import { classifyDocument } from '@/lib/ai-doc'
import { autoInvoiceIfReady } from '@/lib/invoice'
import { sql } from '@/lib/db'
import { getCurrentUser, type CurrentUser } from '@/lib/session'
import { getSetting } from '@/lib/settings'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Everyone connects/manages their OWN account, so these aren't admin-only — but a
 * dispatcher can only reach Telegram at all when the admin's master toggle is on
 * (same gate the nav + page use). Returns the acting user, or throws. */
async function requireTgUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Нужно войти.')
  if (user.role !== 'admin' && (await getSetting('tg_dispatcher_access')) !== '1')
    throw new Error('Доступ к Telegram пока даёт только администратор.')
  return user
}

export async function tgStartLogin(
  apiId: string,
  apiHash: string,
  phone: string,
): Promise<{ token: string; deliveryHint: string } | { error: string }> {
  let user: CurrentUser
  try {
    user = await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  const id = Number(apiId.trim())
  if (!id || !apiHash.trim() || !phone.trim())
    return { error: 'Нужны api_id, api_hash и телефон.' }
  try {
    return await startLogin(user.id, id, apiHash.trim(), phone.trim())
  } catch (e) {
    return { error: `Не отправился код: ${msg(e)}` }
  }
}

export async function tgConfirmLogin(
  token: string,
  code: string,
  password?: string,
): Promise<{ ok: true } | { need2fa: true } | { error: string }> {
  try {
    await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  try {
    // confirmLogin resolves the target user from the login token itself (set in
    // startLogin), so it always writes the session under the user who started it.
    const res = await confirmLogin(token, code.trim(), password || undefined)
    if ('ok' in res) revalidatePath('/telegram')
    return res
  } catch (e) {
    return { error: `Вход не удался: ${msg(e)}` }
  }
}

/** Manual trigger for the same work /api/tg-poll does on a schedule. It fans out
 * across ALL connected accounts (sending acks/nudges from other people's Telegram),
 * so it MUST be gated — the automated path is already CRON_SECRET-protected; this
 * manual convenience needs at least a permitted Telegram user behind it. */
export async function tgCheckNow(): Promise<
  { attached: number; skipped: number; nudged: number } | { error: string }
> {
  try {
    await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  const [intake, reminders] = await Promise.all([intakeDriverMedia(), remindMissingPods()])
  if ('error' in intake) return { error: intake.error }
  if ('error' in reminders) return { error: reminders.error }
  revalidatePath('/telegram')
  revalidatePath('/loads')
  return { attached: intake.attached, skipped: intake.skipped, nudged: reminders.nudged }
}

/** Disconnect MY account — drops my session so the connect form comes back up. */
export async function tgDisconnectAccount(): Promise<void> {
  const user = await requireTgUser()
  await disconnectTelegram(user.id)
  revalidatePath('/telegram')
}

/** Self-service: which of MY chats show up on /telegram (allow list). */
export async function setMyShownChats(shownIds: string[]): Promise<{ error: string } | void> {
  let user: CurrentUser
  try {
    user = await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  await setTgShownChats(user.id, shownIds)
  revalidatePath('/telegram')
}

/** Self-service: attach one of MY chats to a truck (manual override over phone). */
export async function setMyChatTruck(chatId: string, truckId: number | null): Promise<{ error: string } | void> {
  let user: CurrentUser
  try {
    user = await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  await setTgChatTruck(user.id, chatId, truckId)
  revalidatePath('/telegram')
}

/** Manual "file this to the driver's load" for one chat attachment — covers what
 * auto-intake deliberately skips (rate cons, anything not pod/bol), routed by the
 * open chat's truck link/phone match within MY account. */
export async function tgAttachToLoad(
  chatId: string,
  msgId: number,
  driverPhone: string | null,
): Promise<{ ok: true; loadId: number; loadRoute: string } | { error: string }> {
  let user: CurrentUser
  try {
    user = await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  const truck = await resolveTruckForChat(user.id, chatId, driverPhone)
  if (!truck)
    return { error: 'Этот чат не привязан ни к одному траку — укажи телефон в паспорте трака или привяжи чат к траку.' }
  const load = await activeLoadForTruck(truck.truckId)
  if (!load) return { error: 'У этого трака сейчас нет активного груза.' }

  const media = await tgMedia(user.id, chatId, msgId).catch(() => null)
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
  if (!process.env.APP_PIN) return { error: 'PIN не настроен — обратись к администратору.' }
  if (pin !== process.env.APP_PIN) return { error: 'Неверный PIN.' }
  return { ok: true }
}

export async function tgSendMessage(chatId: string, text: string): Promise<{ error: string } | void> {
  if (!text.trim()) return { error: 'Пустое сообщение.' }
  let user: CurrentUser
  try {
    user = await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  try {
    await tgSend(user.id, chatId, text.trim())
    revalidatePath('/telegram')
  } catch (e) {
    return { error: `Не отправилось: ${msg(e)}` }
  }
}
