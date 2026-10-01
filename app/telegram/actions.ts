'use server'

import { retitleDocuments } from '@/lib/doc-title'
import { revalidatePath } from 'next/cache'
import {
  confirmLogin,
  disconnectTelegram,
  tgStoredApp,
  setTgChatTruck,
  setTgShownChats,
  startLogin,
  tgMedia,
  tgSend,
  tgMessages,
  type TgMsg,
} from '@/lib/telegram'
import { intakeDriverMedia } from '@/lib/tg-intake'
import { activeLoadForTruck } from '@/lib/loads'
import { createLoadFromRc } from '@/app/actions'
import { classifyDocument, type DocClass } from '@/lib/ai-doc'
import { autoInvoiceIfReady } from '@/lib/invoice'
import { sql } from '@/lib/db'
import { demoReadOnly, getCurrentUser, verifyMyPassword, type CurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { deleteSetting, getSetting, setSetting } from '@/lib/settings'
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
  // Повторный вход (сессия сброшена) — поля api_id/api_hash не показываются, берём
  // сохранённые.
  const stored = !apiId.trim() && !apiHash.trim() ? await tgStoredApp(user.id) : null
  const id = stored?.apiId ?? Number(apiId.trim())
  const hash = stored?.apiHash ?? apiHash.trim()
  const locale = await getLocale()
  if (!id || !hash || !phone.trim()) return { error: t(locale, 'telegram.actions.needCreds') }
  try {
    return await startLogin(user.id, id, hash, phone.trim())
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
export async function tgCheckNow(): Promise<{ attached: number; skipped: number } | { error: string }> {
  try {
    await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  const intake = await intakeDriverMedia()
  if ('error' in intake) return { error: intake.error }
  revalidatePath('/telegram')
  revalidatePath('/loads')
  return { attached: intake.attached, skipped: intake.skipped }
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
 * auto-intake deliberately skips (rate cons, anything not pod/bol, group chats). */
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
export type TgFileTarget = number | 'new' | 'truck'

/**
 * Куда класть файл — решает диспетчер, а не привязка чата.
 *
 * Раньше кнопка брала трак из привязки чата, и общий чат (например «RATE CONS MAYA»,
 * однажды привязанный к траку) отправлял любой Rate Con этому одному траку. Теперь
 * водитель (трак) приходит с кнопки явно: в личном чате водителя он подставлен
 * страницей, в остальных чатах его выбирают из списка. Без водителя — ничего не
 * подшивается.
 */
export type TgAttachOpts = {
  truckId: number
  kind?: DocClass | 'auto'
  target?: TgFileTarget
  /** Личный чат без привязки: запомнить выбранного водителя за этим чатом. */
  remember?: boolean
}

async function realTruck(truckId: number): Promise<{ truckId: number; number: string | null } | undefined> {
  const rows = (await sql`
    SELECT id, number FROM trucks WHERE id = ${truckId} AND company_id = 'default'`) as {
    id: number
    number: string | null
  }[]
  return rows[0] ? { truckId: rows[0].id, number: rows[0].number } : undefined
}

export type TgLoadChoice = { id: number; route: string; status: string; pickup: string | null }

/** Грузы водителя для выбора «к какому грузу»: сначала тот, что везут, потом
 * взятые наперёд, дальше свежие по дате заведения. */
export async function tgFileTargets(truckId: number): Promise<{ loads: TgLoadChoice[] } | { error: string }> {
  try {
    await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  const truck = await realTruck(truckId)
  if (!truck) return { error: t(await getLocale(), 'telegram.actions.pickDriver') }
  const rows = (await sql`
    SELECT id, origin, destination, status, DATE_FORMAT(pickup_date, '%m/%d/%y') AS pickup FROM loads
    WHERE company_id = 'default' AND truck_id = ${truck.truckId} AND status <> 'cancelled'
    ORDER BY (status = 'in_transit') DESC, (status = 'booked') DESC, created_at DESC LIMIT 10`) as {
    id: number
    origin: string | null
    destination: string | null
    status: string
    pickup: string | null
  }[]
  return {
    loads: rows.map((r) => ({
      id: r.id,
      route: `${r.origin ?? '—'} → ${r.destination ?? '—'}`,
      status: r.status,
      pickup: r.pickup,
    })),
  }
}

export async function tgAttachToLoad(
  chatId: string,
  msgId: number,
  opts: TgAttachOpts,
): Promise<{ ok: true; loadId: number | null; loadRoute: string; created?: boolean } | { error: string }> {
  const ro = await demoReadOnly()
  if (ro) return ro
  let user: CurrentUser
  try {
    user = await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  const locale = await getLocale()
  const truck = await realTruck(opts.truckId)
  if (!truck) return { error: t(locale, 'telegram.actions.pickDriver') }
  if (opts.remember) {
    await setTgChatTruck(user.id, chatId, truck.truckId)
    revalidatePath('/telegram')
  }

  const media = await tgMedia(user.id, chatId, msgId).catch(() => null)
  if (!media) return { error: t(locale, 'telegram.actions.downloadFailed') }

  const ext = media.mime.includes('pdf') ? 'pdf' : 'jpg'
  // Тип: либо назвал диспетчер, либо определяем сами. Названный вручную не
  // перепроверяется — человек видит бумагу, а ИИ её угадывает.
  const chosen = opts.kind && opts.kind !== 'auto' ? opts.kind : null
  const guessed =
    chosen ??
    (media.mime.startsWith('image/') || media.mime === 'application/pdf'
      ? await classifyDocument(media.bytes.toString('base64'), media.mime)
      : 'other')
  // Определить не удалось (кончился дневной лимит ИИ) — не подшиваем наугад. Раньше
  // такой файл молча становился «Другое» и уезжал к текущему грузу; теперь просим
  // выбрать тип рядом стоящей стрелкой, благо выбор там есть.
  if (guessed === null) return { error: t(locale, 'ai.err.kindUnknown') }
  const kind: DocClass = guessed

  const save = async (loadId: number | null) => {
    const ins = await sql`
      INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data, company_id)
      VALUES (${loadId}, ${truck.truckId}, ${kind},
              ${`${kind.toUpperCase()} #${truck.number} tg.${ext}`}, ${media.mime}, ${media.bytes.length},
              UNHEX(${media.bytes.toString('hex')}), 'default')`
    if (ins.insertId) await retitleDocuments({ ids: [ins.insertId] })
    revalidatePath('/docs')
    revalidatePath(`/trucks/${truck.truckId}`)
    if (loadId) revalidatePath(`/loads/${loadId}`)
  }

  // Telegram is real-accounts-only (never the public demo sandbox) — see the REAL
  // constant + comment in lib/tg-intake.ts.
  const target = opts.target

  // «В файлы трака» — когда груза для этой бумаги ещё нет или он тут ни при чём
  // (страховка, чек за ремонт). Документ виден на карточке трака.
  if (target === 'truck') {
    await save(null)
    return { ok: true, loadId: null, loadRoute: '' }
  }

  // «Новый груз» — читаем бумагу и заводим рейс по ней, не сверяясь с имеющимися:
  // диспетчер уже сказал, что это другой груз.
  if (target === 'new') return attachRateCon(truck, media, ext, locale, true)

  if (typeof target === 'number') {
    const rows = (await sql`
      SELECT id, origin, destination FROM loads
      WHERE id = ${target} AND truck_id = ${truck.truckId} AND company_id = 'default'`) as {
      id: number
      origin: string | null
      destination: string | null
    }[]
    const picked = rows[0]
    if (!picked) return { error: t(locale, 'telegram.actions.noActiveLoad') }
    await save(picked.id)
    if (kind === 'pod') await autoInvoiceIfReady('default', picked.id)
    return { ok: true, loadId: picked.id, loadRoute: `${picked.origin ?? ''} → ${picked.destination ?? ''}` }
  }

  if (kind === 'ratecon') return attachRateCon(truck, media, ext, locale, false)

  const load = await activeLoadForTruck('default', truck.truckId)
  if (!load) return { error: t(locale, 'telegram.actions.noActiveLoad') }
  await save(load.id)
  if (kind === 'pod') await autoInvoiceIfReady('default', load.id)
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
  /** Диспетчер выбрал «новый груз» — сверять с имеющимися нечего. */
  forceNew: boolean,
): Promise<{ ok: true; loadId: number; loadRoute: string; created?: boolean } | { error: string }> {
  // Сначала сохраняем, потом читаем: чтение сканa у ИИ занимает до полутора минут, и
  // упасть на нём означало бы потерять присланный документ совсем.
  const rows = (await sql`
    INSERT INTO documents (load_id, truck_id, kind, title, mime, size_bytes, data, company_id)
    VALUES (NULL, ${truck.truckId}, 'ratecon',
            ${`RATECON #${truck.number} tg.${ext}`}, ${media.mime}, ${media.bytes.length},
            UNHEX(${media.bytes.toString('hex')}), 'default')
    RETURNING id`) as { id: number }[]
  const docId = rows[0]!.id
  await retitleDocuments({ ids: [docId] })
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
  const match = forceNew
    ? undefined
    : mine.find(
        (l) =>
          (!!ref && l.reference_id?.trim().toLowerCase() === ref) ||
          (sameCity(l.origin, load.origin) && sameCity(l.destination, load.destination)),
      )
  if (match) {
    await sql`UPDATE documents SET load_id = ${match.id} WHERE id = ${docId} AND load_id IS NULL`
    await retitleDocuments({ ids: [docId] })
    revalidatePath(`/loads/${match.id}`)
    return {
      ok: true,
      loadId: match.id,
      loadRoute: `${match.origin ?? ''} → ${match.destination ?? ''}`,
    }
  }

  const created = await createLoadFromRc(truck.truckId, load, docId, formatDriverInfo(fields), fields.stops)
  if ('error' in created) return { error: created.error }
  return {
    ok: true,
    loadId: created.loadId,
    loadRoute: `${load.origin ?? ''} → ${load.destination ?? ''}`,
    created: true,
  }
}

/** Сколько отправка открыта после пароля. Окно у клиента то же (tg-chat.tsx UNLOCK_MS);
 * здесь на полминуты длиннее — клиент начинает отсчёт уже ПОСЛЕ ответа сервера, и
 * последнее сообщение перед концом его окна не должно упираться в наше. */
const TG_UNLOCK_MS = 2 * 60 * 1000 + 30_000
const tgUnlockKey = (userId: number) => `tg_send_unlock:${userId}`

/** Gate for sending a Telegram message — the dispatcher confirms with their OWN login
 * password. The client re-checks this once per unlock window (2 min), not per message.
 *
 * Окно раньше жило только в sessionStorage браузера: tgSendMessage пароль не
 * спрашивал, и прямой вызов действия отправлял водителю что угодно без него. Теперь
 * срок окна записан на сервере по пользователю, и отправка его проверяет. */
export async function verifyTgSendPassword(password: string): Promise<{ ok: true } | { error: string }> {
  const check = await verifyMyPassword(password)
  if ('error' in check) return { error: check.error }
  await setSetting(tgUnlockKey(check.user.id), String(Date.now() + TG_UNLOCK_MS))
  return { ok: true }
}

export async function tgSendMessage(
  chatId: string,
  text: string,
): Promise<{ error: string; locked?: true } | void> {
  const locale = await getLocale()
  if (!text.trim()) return { error: t(locale, 'telegram.actions.emptyMessage') }
  let user: CurrentUser
  try {
    user = await requireTgUser()
  } catch (e) {
    return { error: msg(e) }
  }
  const until = Number(await getSetting(tgUnlockKey(user.id)))
  if (!(until > Date.now())) {
    await deleteSetting(tgUnlockKey(user.id)).catch(() => {})
    return { error: t(locale, 'telegram.actions.sendLocked'), locked: true }
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
