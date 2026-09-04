import Link from 'next/link'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale } from '@/lib/i18n'
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
import { phoneMap } from '@/lib/tg-intake'
import { listTrucks } from '@/lib/loads'
import { TgSetup } from './tg-setup'
import { TgSendBox } from './tg-chat'
import { TgMessages } from './tg-messages'
import { TgCheckButton } from './tg-check-button'
import { TgDisconnectButton } from './tg-disconnect-button'
import { TgAttachButton } from './tg-attach-button'
import { TgImage } from './tg-image'
import { TgChatSettings } from './tg-chat-settings'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

/** Phone → comparable digits, same normalisation phoneMap() keys by. */
const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '')
// Two round-trips to Telegram (dialogs + messages) don't fit the default 10s.
export const maxDuration = 60

function humanSize(bytes: number, locale: Locale): string {
  if (bytes < 1024) return `${bytes} ${t(locale, 'telegram.page.bytesUnit')}`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${t(locale, 'telegram.page.kbUnit')}`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t(locale, 'telegram.page.mbUnit')}`
}

function when(iso: string | null, locale: Locale): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  const dl = locale === 'ru' ? 'ru-RU' : 'en-US'
  return today
    ? d.toLocaleTimeString(dl, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(dl, { day: '2-digit', month: '2-digit' })
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>
}) {
  const user = await getCurrentUser()
  const locale = await getLocale()

  // Under "open access" there's no signed-in user, so a personal Telegram account
  // can't be attached to anyone. Ask them to log in properly.
  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className="mb-5 text-xl font-bold tracking-tight">Telegram</h1>
        <p className="panel p-4 text-[13px] text-white/65">
          {t(locale, 'telegram.page.needLogin')}
        </p>
      </main>
    )
  }

  // Per-dispatcher capability (admin grants it). Admins always pass.
  if (!(await can(user, 'telegram'))) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className="mb-5 text-xl font-bold tracking-tight">Telegram</h1>
        <p className="panel p-4 text-[13px] text-white/65">
          {t(locale, 'telegram.page.noAccess')}
        </p>
      </main>
    )
  }

  // Every user connects their OWN account — so the connect form is self-service now,
  // not admin-only.
  if (!(await tgConnected(user.id))) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <h1 className="mb-5 text-xl font-bold tracking-tight">Telegram</h1>
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
  //
  // Resolved here from two tables read ONCE, not by calling resolveTruckForChat per
  // dialog: that helper re-reads tgChatTruckMap (already fetched above as `chatTruck`)
  // and phoneMap on every call, so twenty chats meant forty avoidable round trips on
  // every render of this page.
  const phones = await phoneMap()
  const truckNumberById = new Map(trucks.map((tr) => [tr.id, tr.number]))
  const truckByChat = new Map(
    dialogs.map((d) => {
      const manual = chatTruck[d.id]
      const byPhone = d.phone ? phones.get(onlyDigits(d.phone).slice(-10))?.number : undefined
      return [d.id, (manual ? truckNumberById.get(manual) : undefined) ?? byPhone] as const
    }),
  )
  const open = chatId ? dialogs.find((d) => d.id === chatId) : undefined

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            Telegram
            <Info side="bottom" text={t(locale, 'telegram.page.tooltip')} />
          </h1>
          <p className="text-[13px] text-white/65">
            {t(locale, 'telegram.page.yourAccount')}{account?.phone ? ` · +${account.phone}` : ''}
            {account?.name ? ` · ${account.name}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <TgCheckButton />
          <TgDisconnectButton />
        </div>
      </header>

      {/* Ошибка — первой: сломанное подключение важнее любых настроек. */}
      {error && <p className="panel mb-4 p-4 text-[13px] text-bad-400">{error}</p>}

      <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_2fr]">
        {/* Dialog list — on phones it hides once a chat is open (back link shows it). */}
        <div className={`panel overflow-hidden ${open ? 'max-md:hidden' : ''}`}>
          {dialogs.length === 0 && !error ? (
            <p className="p-4 text-[13px] text-white/55">
              {t(locale, 'telegram.page.noneShownYet')}
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
                        <span className="shrink-0 text-[11px] text-white/40">{when(d.lastAt, locale)}</span>
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
            <p className="m-auto p-8 text-[13px] text-white/50">{t(locale, 'telegram.page.pickDialog')}</p>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
                <Link href="/telegram" className="text-[13px] text-white/55 hover:text-white/85 md:hidden">
                  ←
                </Link>
                <span className="text-[14px] font-semibold">{open.name}</span>
                {open.phone && <span className="text-[12px] text-white/45">+{open.phone}</span>}
              </div>
              <TgMessages chatId={open.id} phone={open.phone} initial={msgs ?? []} />
              <TgSendBox chatId={open.id} />
            </>
          )}
        </div>
      </div>

      {/* Какие чаты показывать — под перепиской: настраивают один раз при подключении,
          а диалоги открывают каждый день. Пока список пуст — это единственное, что
          здесь нужно, и на первом входе он и так почти наверху. */}
      <div className="mt-3">
        <TgChatSettings dialogs={allDialogs} shown={[...shown]} chatTruck={chatTruck} trucks={trucks} />
      </div>
    </main>
  )
}
