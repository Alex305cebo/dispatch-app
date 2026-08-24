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
  tgMessages,
  type TgMsg,
} from '@/lib/telegram'
import { intakeDriverMedia, remindMissingPods, resolveTruckForChat } from '@/lib/tg-intake'
import { activeLoadForTruck } from '@/lib/loads'
import { createLoadFromRc } from '@/app/actions'
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
/**
 * Файл из чата — в дело.
 *
 * Раньше здесь было одно правило: что бы ни прислали, подшить к ТЕКУЩЕМУ грузу трака.
 * Для POD и BOL это верно — они всегда про тот рейс, что трак везёт. Для рейткона
 * неверно всегда: он описывает СВОЙ рейс, обычно следующий. На экране это выглядело
 * так, что рейткон на Северную Каролину → Флориду оказывался документом груза
 * Уолпол → Фредерик, а сам рейс в системе не появлялся.
 *
 * Теперь рейткон читается, и по прочитанному решается:
 *  • номер груза брокера или маршрут совпал с уже заведённым рейсом этого трака —
 *    бумага ложится к нему (водитель просто переслал то, что уже есть);
 *  • не совпал — заводится НОВЫЙ груз по самой бумаге, как при перетаскивании
 *    рейткона на карточку трака.
 *
 * Если распознать не удалось (нет ключа ИИ, нечитаемый скан) — файл всё равно
 * сохранён за траком, и на его странице стоит кнопка «Создать груз из рейт-кона».
 * Потерять документ нельзя ни в одной ветке.
 */
export async function tgAttachToLoad(
  chatId: string,
  msgId: number,
  driverPhone: string | null,
): Promise<{ ok: true; loadId: number; loadRoute: string; created?: boolean } | { error: string }> {
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
  if (!truck) return { error: t(locale, 'telegram.actions.noTruckLinked') }

  const media = await tgMedia(user.id, chatId, msgId).catch(() => null)
  if (!media) return { error: t(locale, 'telegram.actions.downloadFailed') }

  const kind =
    media.mime.startsWith('image/') || media.mime === 'application/pdf'
      ? await classifyDocument(media.bytes.toString('base64'), media.mime)
      : 'other'
  const ext = media.mime.includes('pdf') ? 'pdf' : 'jpg'

  // Telegram is real-accounts-only (never the public demo sandbox) — see the REAL
  // constant + comment in lib/tg-intake.ts.
  if (kind === 'ratecon') return attachRateCon(truck, media, ext, locale)

  const load = await activeLoadForTruck('default', truck.truckId)
  if (!load) return { error: t(locale, 'telegram.actions.noActiveLoad') }

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

/** Тот же город с точностью до регистра и лишних пробелов — «WALPOLE, MA» и
 * «Walpole, MA» это одно место. */
const sameCity = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

async function attachRateCon(
  truck: { truckId: number; number: string | null },
  media: { mime: string; bytes: Buffer },
  ext: string,
  locale: Awaited<ReturnType<typeof getLocale>>,
): Promise<{ ok: true; loadId: number; loadRoute: string; created?: boolean } | { error: string }> {
  // Сначала сохраняем, потом читаем: чтение сканa у ИИ занимает до полутора минут, и
  // упасть на нём означало бы потерять присланный документ совсем.
  const rows = (await sql`
    INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data, company_id)
    VALUES (NULL, ${truck.truckId}, 'ratecon',
            ${`RATECON #${truck.number} tg.${ext}`}, ${media.mime}, ${media.bytes.length},
            decode(${media.bytes.toString('hex')}, 'hex'), 'default')
    RETURNING id`) as { id: number }[]
  const docId = rows[0]!.id
  revalidatePath('/docs')
  revalidatePath(`/trucks/${truck.truckId}`)

  const { geminiExtract } = await import('@/lib/ratecon-gemini')
  const read = await geminiExtract({ pdfBase64: media.bytes.toString('base64'), mime: media.mime })
  if ('error' in read) return { error: t(locale, 'telegram.actions.rcSavedNotRead') }

  const { aiToFields } = await import('@/lib/ratecon-ai-contract')
  const { toQrLoad, formatDriverInfo } = await import('@/lib/ratecon')
  const fields = aiToFields(read.fields, read.model)
  const load = toQrLoad(fields)

  // Тот же рейс уже заведён? Номер груза у брокера — признак точный; маршрут —
  // запасной, на случай рейткона без номера. Иначе пересланная водителем копия
  // плодила бы второй такой же груз.
  const mine = (await sql`
    SELECT id, origin, destination, reference_id FROM loads
    WHERE company_id = 'default' AND truck_id = ${truck.truckId} AND status <> 'cancelled'
    ORDER BY created_at DESC LIMIT 20`) as {
    id: number
    origin: string | null
    destination: string | null
    reference_id: string | null
  }[]
  const ref = load.referenceId?.trim().toLowerCase()
  const match = mine.find(
    (l) =>
      (!!ref && l.reference_id?.trim().toLowerCase() === ref) ||
      (sameCity(l.origin, load.origin) && sameCity(l.destination, load.destination)),
  )
  if (match) {
    await sql`UPDATE documents SET load_id = ${match.id} WHERE id = ${docId} AND load_id IS NULL`
    revalidatePath(`/loads/${match.id}`)
    return {
      ok: true,
      loadId: match.id,
      loadRoute: `${match.origin ?? ''} → ${match.destination ?? ''}`,
    }
  }

  const created = await createLoadFromRc(truck.truckId, load, docId, formatDriverInfo(fields))
  if ('error' in created) return { error: created.error }
  return {
    ok: true,
    loadId: created.loadId,
    loadRoute: `${load.origin ?? ''} → ${load.destination ?? ''}`,
    created: true,
  }
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

/** Messages of ONE open chat, for the client-side poll.
 *
 * The chat pane used to stay fresh by calling router.refresh() every 15 seconds, which
 * re-rendered the whole /telegram route: the dialog list from the Telegram API, the
 * account info, the truck map, listTrucks, AND one resolveTruckForChat call per dialog
 * — an N+1 over live API calls — all to find out whether one conversation had a new
 * line. This returns just that conversation. */
export async function tgPollMessages(chatId: string): Promise<{ msgs: TgMsg[] } | { error: string }> {
  const user = await getCurrentUser()
  if (!user || !(await can(user, 'telegram'))) return { error: t(await getLocale(), 'telegram.actions.noAccess') }
  try {
    return { msgs: await tgMessages(user.id, chatId) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
