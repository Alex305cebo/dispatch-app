// Telegram через СОБСТВЕННЫЙ аккаунт диспетчера (MTProto, GramJS) — водители не
// делают ничего: они уже переписываются с этим аккаунтом. Бот не годится: бот не
// может написать первым, а водитель «Start» нажимать не будет (решение владельца).
//
// SERVER ONLY — GramJS тянет Node TCP; из клиентских компонентов не импортировать.
//
// PER-USER: каждый пользователь (диспетчер/админ) подключает СВОЙ аккаунт. Всё,
// что относится к аккаунту, хранится в settings под ключом с суффиксом ":{userId}"
// (tg_session:{uid}, tg_shown_chats:{uid}, …). Один процесс держит по одному живому
// клиенту на каждый подключённый аккаунт (Map, keyed by uid).

import { randomUUID } from 'node:crypto'
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { sql } from './db'
import { deleteSetting, getSetting, setSetting } from './settings'

export { getSetting, setSetting }

const k = (base: string, uid: number) => `${base}:${uid}`

/* ---------- which accounts are connected ---------- */

/** Every user id that has a stored Telegram session — the intake/POD-chase jobs
 * loop over all of them so a driver can message whichever dispatcher they know. */
export async function connectedTgUserIds(): Promise<number[]> {
  const rows = (await sql`SELECT key FROM settings WHERE key LIKE 'tg_session:%'`) as { key: string }[]
  return rows.map((r) => Number(r.key.slice('tg_session:'.length))).filter((n) => Number.isFinite(n))
}

/* ---------- client ---------- */

async function creds(uid: number): Promise<{ apiId: number; apiHash: string; session: string } | null> {
  const [id, hash, session] = await Promise.all([
    getSetting(k('tg_api_id', uid)),
    getSetting(k('tg_api_hash', uid)),
    getSetting(k('tg_session', uid)),
  ])
  return id && hash && session ? { apiId: Number(id), apiHash: hash, session } : null
}

export async function tgConnected(uid: number): Promise<boolean> {
  return (await creds(uid)) !== null
}

/** Drops this user's stored session so /telegram shows the connect form again — for
 * switching which Telegram account they've hooked up (wrong account connected). */
export async function disconnectTelegram(uid: number): Promise<void> {
  await Promise.all([
    deleteSetting(k('tg_session', uid)),
    deleteSetting(k('tg_api_id', uid)),
    deleteSetting(k('tg_api_hash', uid)),
    // Curation is meaningless without the account — clear it too so a reconnect of a
    // DIFFERENT account doesn't inherit stale chat→truck links / shown-chat ids.
    deleteSetting(k('tg_shown_chats', uid)),
    deleteSetting(k('tg_chat_truck', uid)),
    deleteSetting(k('tg_last_seen', uid)),
  ])
  // Kill any live OR in-flight client AFTER the settings are gone — a connect that was
  // mid-flight (between creds() and clients.set()) would otherwise leave a live client
  // for an account we just reported disconnected. Let the in-flight connect settle
  // (it either set a client with the now-stale session, or threw once creds vanished),
  // then drop whatever ended up in the map.
  const inflight = connecting.get(uid)
  if (inflight) await inflight.catch(() => {})
  const c = clients.get(uid)
  if (c) await c.disconnect().catch(() => {})
  clients.delete(uid)
  connecting.delete(uid)
  dialogsCache.delete(uid)
}

/** Whose Telegram this actually is — shown on /telegram so "wrong account connected"
 * (like Alex vs. Mike Keller) is obvious without guessing from dialogs. */
export async function tgAccountInfo(
  uid: number,
): Promise<{ name: string; phone: string | null; username: string | null } | null> {
  if (!(await tgConnected(uid))) return null
  return withClient(uid, async (c) => {
    const me = await c.getMe()
    const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username || 'Без имени'
    return { name, phone: me.phone ?? null, username: me.username ?? null }
  })
}

/* ---------- which chats show up in the app (per user) ---------- */

/** This user's allow list — their connected account can have ~100 dialogs, mostly
 * noise (personal chats, randoms), so nothing shows until they approve it. Empty
 * set = nothing approved yet = show nothing. */
export async function tgShownChats(uid: number): Promise<Set<string>> {
  const raw = (await getSetting(k('tg_shown_chats', uid))) ?? '[]'
  try {
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export async function setTgShownChats(uid: number, ids: string[]): Promise<void> {
  await setSetting(k('tg_shown_chats', uid), JSON.stringify(ids))
}

/** Manual chat → truck override for this user's account — for groups (no phone at
 * all) or a driver whose Telegram number doesn't match the phone on file. Takes
 * priority over the automatic phone match wherever a truck is resolved for a chat. */
export async function tgChatTruckMap(uid: number): Promise<Record<string, number>> {
  const raw = (await getSetting(k('tg_chat_truck', uid))) ?? '{}'
  try {
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return {}
  }
}

export async function setTgChatTruck(uid: number, chatId: string, truckId: number | null): Promise<void> {
  const map = await tgChatTruckMap(uid)
  if (truckId === null) delete map[chatId]
  else map[chatId] = truckId
  await setSetting(k('tg_chat_truck', uid), JSON.stringify(map))
}

// One kept-alive connection per account for the whole process, instead of a fresh
// MTProto handshake per request — connecting per-call was fine for one page load's
// two requests, but every attachment image is its own request too, and a handshake
// takes real time; done concurrently they queued up and started timing each other
// out on Telegram's end (seen live: a burst of "Error: TIMEOUT" in prod).
const clients = new Map<number, TelegramClient>()
const connecting = new Map<number, Promise<TelegramClient>>()

async function withClient<T>(uid: number, fn: (c: TelegramClient) => Promise<T>): Promise<T> {
  const cached = clients.get(uid)
  const c =
    cached?.connected
      ? cached
      : await (connecting.get(uid) ?? (() => {
          const p = connectClient(uid)
          connecting.set(uid, p)
          return p
        })())
  try {
    return await fn(c)
  } catch (e) {
    // AUTH_KEY_DUPLICATED: the same session connected from somewhere else at the same
    // time (e.g. localhost open while prod is also live) — Telegram kills this side.
    // Drop the cached client so the NEXT call reconnects instead of reusing a
    // connection that will keep failing the same way forever.
    if (String(e).includes('AUTH_KEY_DUPLICATED') && clients.get(uid) === c) {
      await c.disconnect().catch(() => {})
      clients.delete(uid)
      dialogsCache.delete(uid)
    }
    throw e
  }
}

// getDialogs is called once per exported function just to resolve a chat entity —
// fine alone, but opening a chat with several photos fires it once per thumbnail in
// a burst, and Telegram flood-waits GetDialogs specifically. Short TTL cache, per
// account, so a burst for the same open chat reuses one fetch instead of five.
const dialogsCache = new Map<number, { at: number; dialogs: Awaited<ReturnType<TelegramClient['getDialogs']>> }>()
const DIALOGS_TTL_MS = 5000

async function cachedDialogs(uid: number, client: TelegramClient) {
  const hit = dialogsCache.get(uid)
  if (hit && Date.now() - hit.at < DIALOGS_TTL_MS) return hit.dialogs
  const dialogs = await client.getDialogs({ limit: 30 })
  dialogsCache.set(uid, { at: Date.now(), dialogs })
  return dialogs
}

function connectClient(uid: number): Promise<TelegramClient> {
  return (async () => {
    const c = await creds(uid)
    if (!c) throw new Error('Telegram не подключён')
    const tc = new TelegramClient(new StringSession(c.session), c.apiId, c.apiHash, {
      connectionRetries: 3,
    })
    await tc.connect()
    clients.set(uid, tc)
    return tc
  })().finally(() => {
    connecting.delete(uid)
  })
}

/* ---------- one-time login flow ---------- */

const pending = new Map<
  string,
  { client: TelegramClient; phone: string; codeHash: string; apiId: number; apiHash: string; uid: number }
>()

export async function startLogin(
  uid: number,
  apiId: number,
  apiHash: string,
  phone: string,
): Promise<{ token: string; deliveryHint: string }> {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  })
  await client.connect()
  const sent = await client.sendCode({ apiId, apiHash }, phone)
  const token = randomUUID()
  pending.set(token, { client, phone, codeHash: sent.phoneCodeHash, apiId, apiHash, uid })
  // GramJS's sendCode returns its OWN simplified shape — {phoneCodeHash, isCodeViaApp} —
  // NOT the raw auth.SentCode, so there is no `.type.className` to read here (verified
  // by dumping the live response). isCodeViaApp is the only channel signal available.
  const deliveryHint = sent.isCodeViaApp
    ? `Telegram отправил код СООБЩЕНИЕМ В САМ TELEGRAM — в чат «Telegram» аккаунта с номером ${phone}. Не SMS.`
    : `Telegram отправил код SMS-кой на ${phone}.`
  console.log('[tg] sendCode ok — isCodeViaApp:', sent.isCodeViaApp, 'phone:', phone)
  return { token, deliveryHint }
}

export async function confirmLogin(
  token: string,
  code: string,
  password?: string,
): Promise<{ ok: true } | { need2fa: true }> {
  const p = pending.get(token)
  if (!p) throw new Error('Сессия логина истекла — начни заново.')

  try {
    await p.client.invoke(
      new Api.auth.SignIn({ phoneNumber: p.phone, phoneCodeHash: p.codeHash, phoneCode: code }),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('SESSION_PASSWORD_NEEDED')) {
      // Wrong code / expired etc. — the one-off login client is now dead weight; drop
      // it and the pending entry so a retry starts clean instead of leaking a socket.
      await p.client.disconnect().catch(() => {})
      pending.delete(token)
      throw e
    }
    if (!password) return { need2fa: true }
    // 2FA: the owner types their own cloud password into their own app's setup form.
    const { computeCheck } = await import('telegram/Password.js')
    const pwd = await p.client.invoke(new Api.account.GetPassword())
    await p.client.invoke(new Api.auth.CheckPassword({ password: await computeCheck(pwd, password) }))
  }

  const session = (p.client.session as StringSession).save()
  await Promise.all([
    setSetting(k('tg_session', p.uid), session),
    setSetting(k('tg_api_id', p.uid), String(p.apiId)),
    setSetting(k('tg_api_hash', p.uid), p.apiHash),
  ])
  await p.client.disconnect().catch(() => {})
  pending.delete(token)
  return { ok: true }
}

/* ---------- data ---------- */

export type TgDialog = {
  id: string
  name: string
  unread: number
  last: string
  lastAt: string | null
  phone: string | null
  isUser: boolean
}

export type TgMsg = { id: number; out: boolean; text: string; at: string; media: 'image' | 'pdf' | 'other' | null }

function mediaKind(m: { media?: unknown }): TgMsg['media'] {
  if (!m.media) return null
  const media = m.media as { document?: { mimeType?: string }; photo?: unknown }
  const mime = media.document?.mimeType ?? (media.photo ? 'image/jpeg' : '')
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  return 'other'
}

export async function tgDialogs(uid: number): Promise<TgDialog[]> {
  return withClient(uid, async (client) => {
    const dialogs = await cachedDialogs(uid, client)
    return dialogs
      .filter((d) => d.id !== undefined)
      .map((d) => {
        const ent = d.entity as { phone?: string; className?: string } | undefined
        return {
          id: String(d.id),
          name: d.title || d.name || '—',
          unread: d.unreadCount ?? 0,
          last: (d.message?.message ?? '').slice(0, 80),
          lastAt: d.message?.date ? new Date(d.message.date * 1000).toISOString() : null,
          phone: ent?.phone ?? null,
          isUser: ent?.className === 'User',
        }
      })
  })
}

/**
 * getDialogs first: it fills the entity cache with access hashes, so a fresh
 * stateless connection can address the chat. Slower than a cached entity, simpler
 * than persisting hashes.
 */
export async function tgMessages(uid: number, chatId: string): Promise<TgMsg[]> {
  return withClient(uid, async (client) => {
    const dialogs = await cachedDialogs(uid, client)
    const d = dialogs.find((x) => String(x.id) === chatId)
    if (!d?.entity) throw new Error('Чат не найден среди последних диалогов.')
    const msgs = await client.getMessages(d.entity, { limit: 40 })
    return msgs
      .map((m) => ({
        id: m.id,
        out: !!m.out,
        text: m.message ?? '',
        at: new Date(m.date * 1000).toISOString(),
        media: mediaKind(m),
      }))
      .reverse()
  })
}

/** On-demand download for one message's attachment — the chat view links here
 * instead of eagerly downloading every photo/PDF just to render the message list. */
export async function tgMedia(uid: number, chatId: string, msgId: number): Promise<{ bytes: Buffer; mime: string } | null> {
  return withClient(uid, async (client) => {
    const dialogs = await cachedDialogs(uid, client)
    const d = dialogs.find((x) => String(x.id) === chatId)
    if (!d?.entity) return null
    const [m] = await client.getMessages(d.entity, { ids: [msgId] })
    if (!m?.media) return null
    const doc = (m.media as { document?: { mimeType?: string } }).document
    const mime = doc?.mimeType ?? 'image/jpeg'
    const buf = (await client.downloadMedia(m)) as Buffer | undefined
    return buf?.length ? { bytes: buf, mime } : null
  })
}

export async function tgSend(uid: number, chatId: string, text: string): Promise<void> {
  await withClient(uid, async (client) => {
    const dialogs = await cachedDialogs(uid, client)
    const d = dialogs.find((x) => String(x.id) === chatId)
    if (!d?.entity) throw new Error('Чат не найден среди последних диалогов.')
    await client.sendMessage(d.entity, { message: text })
  })
}

export type InboundMedia = {
  chatId: string
  phone: string | null
  msgId: number
  bytes: Buffer
  mime: string
}

/**
 * New inbound photos/PDFs across one account's driver chats, since each chat's
 * last-seen id. `since` maps chatId → last processed msg id. Only USER chats (not
 * groups).
 */
export async function tgInboundMedia(uid: number, since: Record<string, number>): Promise<InboundMedia[]> {
  return withClient(uid, async (client) => {
    const out: InboundMedia[] = []
    const dialogs = await cachedDialogs(uid, client)
    for (const d of dialogs) {
      const ent = d.entity as { className?: string; phone?: string } | undefined
      if (ent?.className !== 'User' || !d.entity) continue
      const chatId = String(d.id)
      const last = since[chatId] ?? 0
      const msgs = await client.getMessages(d.entity, { limit: 15 })
      for (const m of msgs) {
        if (m.out || m.id <= last || !m.media) continue
        // photo → jpeg; document → its own mime (skip stickers/video by mime).
        const doc = (m.media as any)?.document
        const mime: string = doc?.mimeType ?? 'image/jpeg'
        if (!/^image\/|^application\/pdf/.test(mime)) continue
        const buf = (await client.downloadMedia(m)) as Buffer | undefined
        if (buf?.length) out.push({ chatId, phone: ent.phone ?? null, msgId: m.id, bytes: buf, mime })
      }
    }
    return out
  })
}

/** chatId → id for one account's dialogs, for the POD-chase reminder to find which
 * account can reach a given driver (by phone). */
export async function tgChatIdByPhone(uid: number): Promise<Map<string, string>> {
  const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
  const dialogs = await tgDialogs(uid).catch(() => [] as TgDialog[])
  return new Map(dialogs.filter((d) => d.phone).map((d) => [digits(d.phone).slice(-10), d.id]))
}
