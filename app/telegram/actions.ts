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
import { demoReadOnly, getCurrentUser, verifyMyPassword, type CurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Everyone connects/manages their OWN account, so these aren't admin-only — but a
 * dispatcher needs the 'telegram' capability (admin grants it per user). Returns the
 * acting user, or throws. */
async function requireTgUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  const locale = await getLocale()
  if (!user) throw new Error(t(locale, 'telegram.actions.needLogin'))
  if (!(await can(user, 'telegram'))) throw new Error(t(locale, 'telegram.actions.noAccess'))
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
  const locale = await getLocale()
  if (!id || !apiHash.trim() || !phone.trim())
    return { error: t(locale, 'telegram.actions.needCreds') }
  try {
    return await startLogin(user.id, id, apiHash.trim(), phone.trim())
  } catch (e) {
    return { error: `${t(locale, 'telegram.actions.codeSendFailed')}: ${msg(e)}` }
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
    const locale = await getLocale()
    return { error: `${t(locale, 'telegram.actions.loginFailed')}: ${msg(e)}` }
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
  const ro = await demoReadOnly()
  if (ro) return ro
  let user: CurrentUser
  try {
    user = await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  const locale = await getLocale()
  const truck = await resolveTruckForChat(user.id, chatId, driverPhone)
  if (!truck)
    return { error: t(locale, 'telegram.actions.noTruckLinked') }
  // Telegram is real-accounts-only (never the public demo sandbox) — see the REAL
  // constant + comment in lib/tg-intake.ts.
  const load = await activeLoadForTruck('default', truck.truckId)
  if (!load) return { error: t(locale, 'telegram.actions.noActiveLoad') }

  const media = await tgMedia(user.id, chatId, msgId).catch(() => null)
  if (!media) return { error: t(locale, 'telegram.actions.downloadFailed') }

  const kind =
    media.mime.startsWith('image/') || media.mime === 'application/pdf'
      ? await classifyDocument(media.bytes.toString('base64'), media.mime)
      : 'other'
  const ext = media.mime.includes('pdf') ? 'pdf' : 'jpg'
  await sql`
    INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data, company_id)
    VALUES (${load.id}, ${truck.truckId}, ${kind},
            ${`${kind.toUpperCase()} #${truck.number} tg.${ext}`}, ${media.mime}, ${media.bytes.length},
            decode(${media.bytes.toString('hex')}, 'hex'), 'default')`
  if (kind === 'pod') await autoInvoiceIfReady('default', load.id)

  revalidatePath(`/loads/${load.id}`)
  revalidatePath('/docs')
  return { ok: true, loadId: load.id, loadRoute: `${load.origin ?? ''} → ${load.destination ?? ''}` }
}

/** Gate for sending a Telegram message — the dispatcher confirms with their OWN login
 * password. The client re-checks this once per unlock window (2 min), not per message. */
export async function verifyTgSendPassword(password: string): Promise<{ ok: true } | { error: string }> {
  const check = await verifyMyPassword(password)
  if ('error' in check) return { error: check.error }
  return { ok: true }
}

export async function tgSendMessage(chatId: string, text: string): Promise<{ error: string } | void> {
  const locale = await getLocale()
  if (!text.trim()) return { error: t(locale, 'telegram.actions.emptyMessage') }
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
    return { error: `${t(locale, 'telegram.actions.sendFailed')}: ${msg(e)}` }
  }
}
