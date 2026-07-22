import Link from 'next/link'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import {
  tgAccountInfo,
  tgChatTruckMap,
  tgConnected,
  tgDialogs,
  tgMessages,
  tgShownChats,
  type TgDialog,
  type TgMsg,
} from '@/lib/telegram'
import { resolveTruckForChat } from '@/lib/tg-intake'
import { listTrucks } from '@/lib/loads'
import { TgSetup } from './tg-setup'
import { TgSendBox } from './tg-chat'
import { TgCheckButton } from './tg-check-button'
import { TgDisconnectButton } from './tg-disconnect-button'
import { TgAttachButton } from './tg-attach-button'
import { TgImage } from './tg-image'
import { TgChatSettings } from './tg-chat-settings'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'
// Two round-trips to Telegram (dialogs + messages) don't fit the default 10s.
export const maxDuration = 60

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function when(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>
}) {
  const user = await getCurrentUser()

  // Under "open access" there's no signed-in user, so a personal Telegram account
  // can't be attached to anyone. Ask them to log in properly.
  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className="mb-5 text-[17px] font-semibold">Telegram</h1>
        <p className="panel p-4 text-[13px] text-white/65">
          Войди под своим аккаунтом, чтобы подключить личный Telegram.
        </p>
      </main>
    )
  }

  // Per-dispatcher capability (admin grants it). Admins always pass.
  if (!(await can(user, 'telegram'))) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className="mb-5 text-[17px] font-semibold">Telegram</h1>
        <p className="panel p-4 text-[13px] text-white/65">
          Доступ к этому разделу пока даёт только администратор.
        </p>
      </main>
    )
  }

  // Every user connects their OWN account — so the connect form is self-service now,
  // not admin-only.
  if (!(await tgConnected(user.id))) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className="mb-5 text-[17px] font-semibold">Telegram</h1>
        <TgSetup />
      </main>
    )
  }

  const chatId = (await searchParams).chat
  let allDialogs: TgDialog[] = []
  let msgs: TgMsg[] | null = null
  let error: string | null = null
  let account: Awaited<ReturnType<typeof tgAccountInfo>> = null
  let shown = new Set<string>()
  let chatTruck: Record<string, number> = {}
  try {
    ;[allDialogs, shown, chatTruck, account] = await Promise.all([
      tgDialogs(user.id),
      tgShownChats(user.id),
      tgChatTruckMap(user.id),
      tgAccountInfo(user.id),
    ])
    if (chatId) msgs = await tgMessages(user.id, chatId)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  // Telegram is real-accounts-only — always the real fleet, never the demo sandbox.
  const trucks = (await listTrucks('default')).map((t) => ({ id: t.id, number: t.number ?? t.name }))
  // Only approved chats appear in the list; the settings panel sees them all.
  const dialogs = allDialogs.filter((d) => shown.has(d.id))

  // Chat ↔ truck within MY account: my manual pick wins, else driver's phone from
  // the truck passport.
  const truckByChat = new Map(
    await Promise.all(
      dialogs.map(async (d) => [d.id, (await resolveTruckForChat(user.id, d.id, d.phone))?.number] as const),
    ),
  )
  const open = chatId ? dialogs.find((d) => d.id === chatId) : undefined

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[17px] font-semibold">
            Telegram
            <Info side="bottom" text="Переписка с водителями прямо в приложении через ТВОЙ Telegram-аккаунт (не бот) — водителям ничего ставить и нажимать не нужно. У каждого диспетчера свой аккаунт со своими диалогами. Отметь в настройках, какие чаты показывать, и привяжи их к тракам — фото POD/BOL от водителя ИИ сам прикрепит к грузу." />
          </h1>
          <p className="text-[13px] text-white/65">
            Твой аккаунт{account?.phone ? ` · +${account.phone}` : ''}
            {account?.name ? ` · ${account.name}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <TgCheckButton />
          <TgDisconnectButton />
        </div>
      </header>

      <TgChatSettings dialogs={allDialogs} shown={[...shown]} chatTruck={chatTruck} trucks={trucks} />

      {error && <p className="panel mb-4 p-4 text-[13px] text-bad-400">{error}</p>}

      <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_2fr]">
        {/* Dialog list — on phones it hides once a chat is open (back link shows it). */}
        <div className={`panel overflow-hidden ${open ? 'max-md:hidden' : ''}`}>
          {dialogs.length === 0 && !error ? (
            <p className="p-4 text-[13px] text-white/55">
              Пока ни один чат не отмечен для показа — открой «Настроить, какие чаты показывать» выше.
            </p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto">
              {dialogs.map((d) => {
                const truck = truckByChat.get(d.id)
                return (
                  <li key={d.id}>
                    <Link
                      href={`/telegram?chat=${d.id}`}
                      className={`flex flex-col gap-0.5 border-b border-white/5 px-3.5 py-2.5 transition-colors hover:bg-white/4 ${
                        d.id === chatId ? 'bg-white/6' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                          {d.name}
                        </span>
                        {truck && (
                          <span className="shrink-0 rounded-full bg-haul-500/15 px-1.5 py-0.5 text-[10px] font-medium text-haul-400">
                            #{truck}
                          </span>
                        )}
                        {d.unread > 0 && (
                          <span className="nums shrink-0 rounded-full bg-haul-500 px-1.5 py-0.5 text-[10px] font-bold">
                            {d.unread}
                          </span>
                        )}
                        <span className="shrink-0 text-[11px] text-white/40">{when(d.lastAt)}</span>
                      </span>
                      <span className="truncate text-[12px] text-white/55">{d.last}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Conversation */}
        <div className="panel flex min-h-[50vh] flex-col overflow-hidden">
          {!open ? (
            <p className="m-auto p-8 text-[13px] text-white/50">Выбери диалог слева.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
                <Link href="/telegram" className="text-[13px] text-white/55 hover:text-white/85 md:hidden">
                  ←
                </Link>
                <span className="text-[14px] font-semibold">{open.name}</span>
                {open.phone && <span className="text-[12px] text-white/45">+{open.phone}</span>}
              </div>
              <div className="flex max-h-[58vh] flex-1 flex-col gap-1.5 overflow-y-auto p-4">
                {(msgs ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.out
                        ? 'self-end rounded-br-sm bg-haul-500/25 text-white'
                        : 'self-start rounded-bl-sm bg-white/8 text-white/90'
                    }`}
                  >
                    {m.media === 'image' && (
                      <>
                        <TgImage src={`/api/tg-media/${open.id}/${m.id}`} />
                        <TgAttachButton chatId={open.id} msgId={m.id} phone={open.phone} />
                      </>
                    )}
                    {m.media === 'pdf' && (
                      <>
                        <a
                          href={`/api/tg-media/${open.id}/${m.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mb-1 block overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-colors hover:bg-white/8"
                        >
                          {m.hasThumb && (
                            // Page-1 preview Telegram made for the file — "видно, что внутри".
                            <img
                              src={`/api/tg-media/${open.id}/${m.id}?thumb=1`}
                              alt="Превью PDF"
                              className="max-h-44 w-full object-cover object-top"
                            />
                          )}
                          <span className="flex items-center gap-2 px-2.5 py-2">
                            <span className="text-[17px]">📄</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-medium text-white/90">
                                {m.fileName || 'Документ.pdf'}
                              </span>
                              <span className="block text-[11px] text-white/45">
                                {m.fileSize ? `${humanSize(m.fileSize)} · ` : ''}Открыть PDF
                              </span>
                            </span>
                          </span>
                        </a>
                        <TgAttachButton chatId={open.id} msgId={m.id} phone={open.phone} />
                      </>
                    )}
                    {m.media === 'other' && !m.text && <span className="text-white/45">[вложение]</span>}
                    {m.text}
                    <span className="mt-0.5 block text-right text-[10px] text-white/40">
                      {when(m.at)}
                    </span>
                  </div>
                ))}
              </div>
              <TgSendBox chatId={open.id} />
            </>
          )}
        </div>
      </div>
    </main>
  )
}
