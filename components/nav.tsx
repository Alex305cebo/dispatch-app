'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Notifier } from '@/components/notifier'
import { ThemeToggle } from '@/components/theme-toggle'
import { autoRefreshFleet } from '@/app/actions'
import { UserPanel } from '@/components/user-panel'
import type { CurrentUser } from '@/lib/session'

// Hand-rolled 20px stroke icons — an icon library for seven glyphs is a dependency
// to render seven paths.
const icons: Record<string, string> = {
  dash: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  loads: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10',
  add: 'M12 5v14M5 12h14',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5 M12 12v6 M9 15l3-3 3 3',
  settings: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M11 16v4',
  track: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z M12 10h.01',
  docs: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  chat: 'M21 3L3 10.5l6.5 3L13 21z M9.5 13.5L21 3',
  who: 'M20 21a8 8 0 1 0-16 0 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  // Clock + counter-clockwise arrow — reads as "activity history", not "profile",
  // for the Журнал button (a person silhouette there looked like an account avatar).
  history: 'M12 8v4l3 3 M3.05 11a9 9 0 1 0 .5-4 M3 4v6h6',
  money: 'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      aria-hidden
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}

// "MAYA LOGISTICS INC" -> "Maya Logistics" — drop the legal suffix, title-case the rest.
function brandName(raw: string): string {
  const stripped = raw.replace(/\s+(inc\.?|llc\.?|corp\.?|co\.?)$/i, '').trim()
  if (!stripped) return 'Dispatch'
  return stripped
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

type Item = { href: string; label: string; icon: string; soon?: boolean; desktopOnly?: boolean }

const ITEMS: Item[] = [
  { href: '/', label: 'Обзор', icon: 'dash' },
  { href: '/loads', label: 'Грузы', icon: 'loads' },
  { href: '/trucks', label: 'Траки', icon: 'settings' },
  { href: '/tracking', label: 'Трекинг', icon: 'track' },
  { href: '/docs', label: 'Документы', icon: 'docs' },
  { href: '/telegram', label: 'Telegram', icon: 'chat' },
  // The phone tab bar fits 6 — this stays reachable from dashboard/load pages there.
  { href: '/invoices', label: 'Оплаты', icon: 'money', desktopOnly: true },
]

export function Nav({ companyName, user }: { companyName: string; user: CurrentUser | null }) {
  const pathname = usePathname()
  const brand = brandName(companyName)

  // Every login and every section switch is a chance to nudge GPS forward — no
  // external cron ever got set up, so this was the only thing actually keeping
  // Live Share data from going stale between manual "Обновить" clicks.
  useEffect(() => {
    if (!user) return
    autoRefreshFleet().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user?.id])

  return (
    <nav
      className={[
        // Phone: bottom bar (utility strip + tabs). Desktop: left sidebar. Same element.
        'fixed inset-x-0 bottom-0 z-50 flex flex-col border-t border-white/8',
        'bg-ink-950/80 px-2 pt-1 backdrop-blur-xl',
        'md:inset-y-0 md:right-auto md:w-52 md:justify-start md:border-r md:border-t-0 md:p-3',
      ].join(' ')}
      // A fixed bar sits against the viewport, so body's safe-area padding does not
      // protect it — without this it lands under the iPhone home indicator.
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mb-4 mt-1 hidden items-center gap-2.5 px-2 md:flex">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-haul-500 to-good-500 text-[15px] font-bold">
          {brand.charAt(0)}
        </div>
        <span className="truncate text-[15px] font-semibold">{brand}</span>
      </div>

      {/* Tabs: a row on the phone, a column in the sidebar. */}
      <div className="flex items-stretch justify-around gap-1 md:flex-col md:gap-0.5">
        {ITEMS.map((it) => {
        const active = !it.soon && (it.href === '/' ? pathname === '/' : pathname.startsWith(it.href))

        const body = (
          <>
            <Icon d={icons[it.icon]} />
            <span className="text-[10px] font-medium md:text-[13px]">{it.label}</span>
            {it.soon && (
              <span className="ml-auto hidden rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/62 md:inline">
                скоро
              </span>
            )}
          </>
        )

        const shape =
          'flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors md:flex-none md:flex-row md:gap-3 md:px-3 md:py-2.5'

        if (it.soon) {
          return (
            <div
              key={it.label}
              aria-disabled
              title="Ещё не сделано"
              className={`${shape} cursor-not-allowed text-white/45 max-md:hidden`}
            >
              {body}
            </div>
          )
        }

        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            className={`${shape} ${it.desktopOnly ? 'max-md:hidden' : ''} ${
              active
                ? 'bg-haul-500/12 text-haul-400 md:bg-white/6 md:text-white'
                : 'text-white/70 hover:text-white/90 md:hover:bg-white/4'
            }`}
          >
            {body}
          </Link>
        )
        })}
      </div>

      {/* Account row — one round icon set, visible at every width. Used to be split
          into a mobile-only bell/theme strip and a separate desktop-only card, which
          meant the account menu, Журнал and even the logout button were completely
          unreachable below the md breakpoint (reported live: "the block disappeared,
          can't do anything"). Admin/logout now live inside UserPanel's own popover. */}
      <div className="order-first mb-1.5 flex items-center justify-end gap-1.5 px-1 pb-1 md:order-none md:mt-auto md:justify-start md:px-0 md:pb-0">
        {user && (
          <>
            <UserPanel user={user} />
            <Link
              href="/logins"
              title="Журнал"
              aria-label="Журнал"
              aria-current={pathname.startsWith('/logins') ? 'page' : undefined}
              className={`flex size-9 items-center justify-center rounded-full border transition-colors ${
                pathname.startsWith('/logins')
                  ? 'border-haul-500/50 text-haul-400'
                  : 'border-white/10 bg-ink-800/80 text-white/72 hover:border-white/25 hover:text-white/90'
              }`}
            >
              <Icon d={icons.history} />
            </Link>
          </>
        )}
        <Notifier />
        <ThemeToggle />
      </div>
    </nav>
  )
}
