// Telegram через СОБСТВЕННЫЙ аккаунт диспетчера (MTProto, GramJS) — водители не
// делают ничего: они уже переписываются с этим аккаунтом. Бот не годится: бот не
// может написать первым, а водитель «Start» нажимать не будет (решение владельца).
//
// SERVER ONLY — GramJS тянет Node TCP; из клиентских компонентов не импортировать.
//
// Сессия: StringSession в таблице settings. Одноразовый логин (телефон → код →
// [пароль 2FA]) делается ЛОКАЛЬНО на dev-сервере: между «отправить код» и «ввести
// код» клиент живёт в module-scope Map, что переживает запросы только в одном
// процессе. После логина session string работает где угодно, включая Vercel.

import { randomUUID } from 'node:crypto'
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { getSetting, setSetting } from './settings'

export { getSetting, setSetting }

/* ---------- client ---------- */

async function creds(): Promise<{ apiId: number; apiHash: string; session: string } | null> {
  const [id, hash, session] = await Promise.all([
    getSetting('tg_api_id'),
    getSetting('tg_api_hash'),
    getSetting('tg_session'),
  ])
  return id && hash && session ? { apiId: Number(id), apiHash: hash, session } : null
}

export async function tgConnected(): Promise<boolean> {
  return (await creds()) !== null
}

/** Connect → run → disconnect. A connection per request is slow-ish but stateless. */
async function withClient<T>(fn: (c: TelegramClient) => Promise<T>): Promise<T> {
  const c = await creds()
  if (!c) throw new Error('Telegram не подключён')
  const client = new TelegramClient(new StringSession(c.session), c.apiId, c.apiHash, {
    connectionRetries: 3,
  })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.disconnect().catch(() => {})
  }
}

/* ---------- one-time login flow ---------- */

const pending = new Map<
  string,
  { client: TelegramClient; phone: string; codeHash: string; apiId: number; apiHash: string }
>()

export async function startLogin(
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
  pending.set(token, { client, phone, codeHash: sent.phoneCodeHash, apiId, apiHash })
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
    if (!msg.includes('SESSION_PASSWORD_NEEDED')) throw e
    if (!password) return { need2fa: true }
    // 2FA: the owner types their own cloud password into their own app's setup form.
    const { computeCheck } = await import('telegram/Password.js')
    const pwd = await p.client.invoke(new Api.account.GetPassword())
    await p.client.invoke(new Api.auth.CheckPassword({ password: await computeCheck(pwd, password) }))
  }

  const session = (p.client.session as StringSession).save()
  await Promise.all([
    setSetting('tg_session', session),
    setSetting('tg_api_id', String(p.apiId)),
    setSetting('tg_api_hash', p.apiHash),
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

export async function tgDialogs(): Promise<TgDialog[]> {
  return withClient(async (client) => {
    const dialogs = await client.getDialogs({ limit: 30 })
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
export async function tgMessages(chatId: string): Promise<TgMsg[]> {
  return withClient(async (client) => {
    const dialogs = await client.getDialogs({ limit: 30 })
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
export async function tgMedia(chatId: string, msgId: number): Promise<{ bytes: Buffer; mime: string } | null> {
  return withClient(async (client) => {
    const dialogs = await client.getDialogs({ limit: 30 })
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

export async function tgSend(chatId: string, text: string): Promise<void> {
  await withClient(async (client) => {
    const dialogs = await client.getDialogs({ limit: 30 })
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
 * New inbound photos/PDFs across driver chats, since each chat's last-seen id.
 * `since` maps chatId → last processed msg id. Only USER chats (not groups).
 */
export async function tgInboundMedia(since: Record<string, number>): Promise<InboundMedia[]> {
  return withClient(async (client) => {
    const out: InboundMedia[] = []
    const dialogs = await client.getDialogs({ limit: 30 })
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
