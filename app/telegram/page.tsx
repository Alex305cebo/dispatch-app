import Link from 'next/link'
import { Link2, MessageCircle, MessagesSquare, MailWarning } from 'lucide-react'
import { getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale } from '@/lib/i18n'
import {
  tgAccountInfo,
  tgChatTruckMap,
  isDeadTgSession,
  tgConnected,
  tgDialogs,
  tgNeedsRelogin,
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
import type { TgDriver } from './tg-attach-button'
import { TgImage } from './tg-image'
import { TgChatSettings } from './tg-chat-settings'
import { TgAddChat } from './tg-add-chat'
import { PageHeader } from '@/components/page-header'
import { Stat } from '@/components/stat'
import { Cells } from '@/components/mini-charts'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { tileGrid } from '@/lib/tiles'
import { TELEGRAM_TILES } from '@/lib/tiles-core'
import { usDate } from '@/lib/fmt'

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
  return today ? d.toLocaleTimeString(dl, { hour: '2-digit', minute: '2-digit' }) : usDate(d)
}

/** Пока Telegram не подключён — та же ширина и та же шапка, что у всех разделов (план
 *  «Порядок в TMS», 10/09/26). Раньше эти экраны были уже и с мелким заголовком, и
 *  «Telegram» прыгал влево-вправо при переходе из меню. */
function Shell({ locale, subtitle, children }: { locale: Locale; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="page">
      <PageHeader title="Telegram" info={t(locale, 'telegram.page.tooltip')} subtitle={subtitle} />
      {children}
    </main>
  )
}

export default async function Page({ searchParams }: { searchParams: Promise<{ chat?: string; truck?: string }> }) {
  const user = await getCurrentUser()
  const locale = await getLocale()

  // Under "open access" there's no signed-in user, so a personal Telegram account
  // can't be attached to anyone. Ask them to log in properly.
  if (!user) {
    return (
      <Shell locale={locale} subtitle={t(locale, 'telegram.help.what')}>
        <div className="panel p-4">
          <p className="text-base text-t2">{t(locale, 'telegram.page.needLogin')}</p>
          <a
            href="/login"
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-haul-500 px-4 text-base font-semibold text-white hover:bg-haul-400"
          >
            {t(locale, 'telegram.help.login')}
          </a>
        </div>
      </Shell>
    )
  }

  // Per-dispatcher capability (admin grants it). Admins always pass.
  // Без доступа — не тупик, а инструкция: кто и где его включает. В демо Telegram
  // не подключается вовсе (это чужой, общий аккаунт) — там предлагаем войти в свой.
  if (!(await can(user, 'telegram'))) {
    return (
      // Что это за раздел — строкой под заголовком, как у всех; в карточке — только почему
      // он закрыт и что сделать.
      <Shell locale={locale} subtitle={t(locale, 'telegram.help.what')}>
        <section className="panel p-4 sm:p-5">
          <h2 className="text-base font-semibold leading-6 text-t1">
            {t(locale, user.isDemo ? 'telegram.help.demoTitle' : 'telegram.help.noAccessTitle')}
          </h2>
          {user.isDemo ? (
            <>
              <p className="mt-1 text-base leading-relaxed text-t2">{t(locale, 'telegram.help.demoText')}</p>
              <a
                href="/login"
                className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-haul-500 px-4 text-base font-semibold text-white hover:bg-haul-400"
              >
                {t(locale, 'telegram.help.login')}
              </a>
            </>
          ) : (
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-base leading-relaxed text-t1">
              <li>{t(locale, 'telegram.help.step1')}</li>
              <li>{t(locale, 'telegram.help.step2')}</li>
              <li>{t(locale, 'telegram.help.step3')}</li>
            </ol>
          )}
        </section>
      </Shell>
    )
  }

  // Every user connects their OWN account — so the connect form is self-service now,
  // not admin-only.
  if (!(await tgConnected(user.id))) {
    return (
      <Shell locale={locale} subtitle={t(locale, 'telegram.help.what')}>
        <TgSetup relogin={await tgNeedsRelogin(user.id)} />
      </Shell>
    )
  }

  const sp = await searchParams
  let chatId = sp.chat
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
  } catch (e) {
    // Ключ убит (406 AUTH_KEY_DUPLICATED и т.п.) — withClient уже стёр мёртвую сессию;
    // вместо сырого кода ошибки сразу короткий повторный вход.
    if (isDeadTgSession(e)) {
      return (
        <Shell locale={locale} subtitle={t(locale, 'telegram.help.what')}>
          <TgSetup relogin />
        </Shell>
      )
    }
    error = e instanceof Error ? e.message : String(e)
  }

  // Telegram is real-accounts-only — always the real fleet, never the demo sandbox.
  const trucks = (await listTrucks('default')).map((t) => ({ id: t.id, number: t.number ?? t.name, driver: t.driverName }))
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
  // С карточки груза: «?truck=<id>» — чат этого трака среди ВСЕХ чатов аккаунта, не только
  // отмеченных в списке: ручная привязка, иначе телефон водителя из паспорта трака.
  const wantTruck = sp.truck ? Number(sp.truck) : null
  if (!chatId && wantTruck) {
    const num = truckNumberById.get(wantTruck)
    chatId =
      allDialogs.find((d) => chatTruck[d.id] === wantTruck)?.id ??
      allDialogs.find((d) => d.phone && num && phones.get(onlyDigits(d.phone).slice(-10))?.number === num)?.id
  }
  if (chatId && !error) msgs = await tgMessages(user.id, chatId).catch(() => null)
  const open = chatId ? allDialogs.find((d) => d.id === chatId) : undefined
  const truckChatMissing = !!wantTruck && !open && !error

  // Кому прикреплять файлы из открытого чата. Водитель подставлен только в его ЛИЧНОМ
  // чате (один на один, привязан вручную или по телефону из паспорта трака). В общих
  // чатах — группы вроде «RATE CONS MAYA», даже привязанные когда-то к траку, — водителя
  // выбирают руками: иначе любой Rate Con оттуда молча уезжал одному траку.
  const truckIdOf = (d: (typeof allDialogs)[number]) =>
    chatTruck[d.id] ?? (d.phone ? phones.get(onlyDigits(d.phone).slice(-10))?.truckId : undefined)
  const openTruckId = open?.isUser ? truckIdOf(open) : undefined
  const openTruck = openTruckId ? trucks.find((tr) => tr.id === openTruckId) : undefined
  const withChat = new Set(allDialogs.filter((d) => d.isUser).map(truckIdOf).filter(Boolean))
  const drivers: TgDriver[] = trucks
    .map((tr) => ({ truckId: tr.id, number: tr.number ?? null, driver: tr.driver ?? null, hasChat: withChat.has(tr.id) }))
    .sort((a, b) => Number(b.hasChat) - Number(a.hasChat))

  // Счётчики над перепиской — своими маленькими плитками. Непрочитанные считаем по
  // показанным чатам: остальные в списке и не видны.
  const unread = dialogs.reduce((n, d) => n + d.unread, 0)
  const linked = dialogs.filter((d) => truckByChat.get(d.id)).length
  // Плитки — как на «Грузах», «Траках» и «Amazon»: подпись, значок, число, под ним
  // клетки — чат списка на клетку: где ждут ответа, какие привязаны к траку.
  const icon = { size: 15, strokeWidth: 2.5 }
  const waiting = dialogs.filter((d) => d.unread > 0).length
  const widgets: Widget[] = [
    {
      id: 'chats',
      node: <Stat compact surface="panel" accent="haul" icon={<MessageCircle {...icon} />} label={t(locale, 'telegram.tiles.chats')} value={String(dialogs.length)} />,
    },
    {
      id: 'unread',
      node: (
        <Stat
          compact
          surface="panel"
          accent={unread > 0 ? 'warn' : 'haul'}
          icon={<MailWarning {...icon} />}
          label={t(locale, 'telegram.tiles.unread')}
          value={String(unread)}
        >
          <Cells total={dialogs.length} lit={waiting} tone="warn" />
        </Stat>
      ),
    },
    {
      id: 'linked',
      node: (
        <Stat compact surface="panel" accent="good" icon={<Link2 {...icon} />} label={t(locale, 'telegram.tiles.linked')} value={String(linked)}>
          <Cells total={dialogs.length} lit={linked} tone="good" />
        </Stat>
      ),
    },
    {
      id: 'all-chats',
      node: (
        <Stat compact surface="panel" accent="haul" icon={<MessagesSquare {...icon} />} label={t(locale, 'telegram.tiles.allChats')} value={String(allDialogs.length)} />
      ),
    },
    {
      id: 'chat',
      // Список чатов и открытая переписка — ОДНА плитка: делить их нельзя, слева
      // список, справа чат, и работают они только вместе.
      node: (
        <div>
          <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_2fr]">
            {/* Dialog list — on phones it hides once a chat is open (back link shows it). */}
            <div className={`panel overflow-hidden ${open ? 'max-md:hidden' : ''}`}>
              {!error && <TgAddChat dialogs={allDialogs} shown={[...shown]} />}
              {dialogs.length === 0 && !error ? (
                <p className="p-4 text-base text-t3">{t(locale, 'telegram.page.noneShownYet')}</p>
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
                            <span className="min-w-0 flex-1 truncate text-md font-medium">{d.name}</span>
                            {truck && (
                              <span className="shrink-0 rounded-full bg-haul-500/15 px-1.5 py-0.5 text-2xs font-medium text-haul-400">
                                #{truck}
                              </span>
                            )}
                            {d.unread > 0 && (
                              <span className="nums shrink-0 rounded-full bg-haul-500 px-1.5 py-0.5 text-2xs font-bold">
                                {d.unread}
                              </span>
                            )}
                            <span className="shrink-0 text-xs text-t3">{when(d.lastAt, locale)}</span>
                          </span>
                          <span className="truncate text-sm text-t3">{d.last}</span>
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
                <p className="m-auto max-w-sm p-8 text-center text-base text-t3">
                  {truckChatMissing ? t(locale, 'telegram.page.noTruckChat') : t(locale, 'telegram.page.pickDialog')}
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
                    <Link href="/telegram" className="text-base text-t3 hover:text-t1 md:hidden">
                      ←
                    </Link>
                    <span className="text-md font-semibold">{open.name}</span>
                    {open.phone && <span className="text-sm text-t3">+{open.phone}</span>}
                  </div>
                  <TgMessages
                    chatId={open.id}
                    initial={msgs ?? []}
                    attach={{
                      driver: openTruck
                        ? { truckId: openTruck.id, number: openTruck.number ?? null, driver: openTruck.driver ?? null, hasChat: true }
                        : null,
                      personal: open.isUser,
                      drivers,
                    }}
                  />
                  <TgSendBox chatId={open.id} />
                </>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'settings',
      // Какие чаты показывать: настраивают один раз при подключении, а диалоги
      // открывают каждый день — поэтому исходно ниже переписки.
      node: (
        <div>
          <TgChatSettings dialogs={allDialogs} shown={[...shown]} chatTruck={chatTruck} trucks={trucks} />
        </div>
      ),
    },
  ]
  const grid = await tileGrid('telegram', TELEGRAM_TILES, locale)

  return (
    <main className="page">
      <PageHeader
        title="Telegram"
        info={t(locale, 'telegram.page.tooltip')}
        subtitle={
          <>
            {t(locale, 'telegram.page.yourAccount')}
            {account?.phone ? ` · +${account.phone}` : ''}
            {account?.name ? ` · ${account.name}` : ''}
            {/* «Не тот аккаунт?» — про этот аккаунт, поэтому рядом с ним, а не второй
                кнопкой справа: там одна главная — «Проверить сейчас» (план «Порядок в TMS»). */}
            {' · '}
            <TgDisconnectButton />
          </>
        }
        actions={<TgCheckButton />}
      />

      {/* Ошибка — первой: сломанное подключение важнее любых настроек. */}
      {error && <p className="panel mb-4 p-4 text-base text-bad-400">{error}</p>}
      <WidgetGrid
        {...grid}
        widgets={widgets}
      />
    </main>
  )
}
