import Link from 'next/link'
import { sql } from '@/lib/db'
import { tgConnected, tgDialogs, tgHiddenChats, tgMessages, type TgDialog, type TgMsg } from '@/lib/telegram'
import { TgSetup } from './tg-setup'
import { TgSendBox } from './tg-chat'
import { TgCheckButton } from './tg-check-button'
import { TgDisconnectButton } from './tg-disconnect-button'
import { TgAttachButton } from './tg-attach-button'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'
// Two round-trips to Telegram (dialogs + messages) don't fit the default 10s.
export const maxDuration = 60

const digits = (s: string | null) => (s ?? '').replace(/\D/g, '')

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
  if (!(await tgConnected())) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className="mb-5 text-[17px] font-semibold">Telegram</h1>
        <TgSetup />
      </main>
    )
  }

  const chatId = (await searchParams).chat
  let dialogs: TgDialog[] = []
  let msgs: TgMsg[] | null = null
  let error: string | null = null
  try {
    const [all, hidden] = await Promise.all([tgDialogs(), tgHiddenChats()])
    // Admin-curated in the admin panel — same list for every dispatcher, not per-viewer.
    dialogs = all.filter((d) => !hidden.has(d.id))
    if (chatId) msgs = await tgMessages(chatId)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  // Chat ↔ truck match by the driver's phone from the truck passport.
  const phones = (await sql`
    SELECT m.driver_phone, t.number FROM truck_meta m
    JOIN trucks t ON t.id = m.truck_id WHERE m.driver_phone IS NOT NULL`) as {
    driver_phone: string
    number: string
  }[]
  const truckByPhone = new Map(phones.map((p) => [digits(p.driver_phone), p.number]))
  const open = chatId ? dialogs.find((d) => d.id === chatId) : undefined

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[17px] font-semibold">
            Telegram
            <Info side="bottom" text="Переписка с водителями прямо в приложении через твой Telegram-аккаунт (не бот) — водителям ничего ставить и нажимать не нужно. Чат с чипом #трака — если телефон водителя указан в паспорте трака. Фото POD/BOL от водителя ИИ сам прикрепит к грузу." />
          </h1>
          <p className="text-[13px] text-white/65">
            Переписка с водителями — прямо здесь, через твой аккаунт.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <TgCheckButton />
          <TgDisconnectButton />
        </div>
      </header>

      {error && <p className="panel mb-4 p-4 text-[13px] text-bad-400">{error}</p>}

      <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_2fr]">
        {/* Dialog list — on phones it hides once a chat is open (back link shows it). */}
        <div className={`panel overflow-hidden ${open ? 'max-md:hidden' : ''}`}>
          {dialogs.length === 0 && !error ? (
            <p className="p-4 text-[13px] text-white/55">Диалогов не видно.</p>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto">
              {dialogs.map((d) => {
                const truck = truckByPhone.get(digits(d.phone))
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
                        <a href={`/api/tg-media/${open.id}/${m.id}`} target="_blank" rel="noreferrer" className="mb-1 block">
                          <img
                            src={`/api/tg-media/${open.id}/${m.id}`}
                            alt="Вложение"
                            className="max-h-64 rounded-lg"
                          />
                        </a>
                        <TgAttachButton chatId={open.id} msgId={m.id} phone={open.phone} />
                      </>
                    )}
                    {m.media === 'pdf' && (
                      <>
                        <a
                          href={`/api/tg-media/${open.id}/${m.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mb-1 flex items-center gap-1.5 text-haul-300 underline"
                        >
                          📄 Открыть PDF
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
