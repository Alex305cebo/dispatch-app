'use client'

import Link from 'next/link'
import { LinkPending } from '@/components/link-pending'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Notifier } from '@/components/notifier'
import { ThemeToggle } from '@/components/theme-toggle'
import { LocaleToggle } from '@/components/locale-toggle'
import { autoRefreshFleet } from '@/app/actions'
import { UserPanel, TileSlot } from '@/components/user-panel'
import type { CurrentUser } from '@/lib/session'
import { useLocale } from '@/components/locale-provider'
import { t, type MsgKey } from '@/lib/i18n'

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
  shield: 'M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6z M9 12l2 2 4-4',
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

/** Extracted so the same control can appear on the phone row and inside the desktop
 * account menu without the markup being written twice and drifting apart. */
function JournalLink({
  pathname,
  locale,
  collapsed = false,
}: {
  pathname: string
  locale: ReturnType<typeof useLocale>
  collapsed?: boolean
}) {
  const active = pathname.startsWith('/logins')
  return (
    <Link
      href="/logins"
      title={t(locale, 'nav.journal')}
      aria-label={t(locale, 'nav.journal')}
      aria-current={active ? 'page' : undefined}
      className={`nav-icon-btn flex size-9 items-center justify-center rounded-full border ${collapsed ? 'is-collapsed' : ''} ${
        active
          ? 'border-haul-500/50 text-haul-400'
          : 'border-white/10 text-white/72 hover:border-white/25 hover:text-white/90'
      }`}
    >
      <Icon d={icons.history} />
    </Link>
  )
}

type Item = { href: string; labelKey: MsgKey; icon: string; soon?: boolean; desktopOnly?: boolean }

const ITEMS: Item[] = [
  { href: '/', labelKey: 'nav.overview', icon: 'dash' },
  { href: '/loads', labelKey: 'nav.loads', icon: 'loads' },
  { href: '/trucks', labelKey: 'nav.trucks', icon: 'settings' },
  { href: '/tracking', labelKey: 'nav.tracking', icon: 'track' },
  { href: '/docs', labelKey: 'nav.docs', icon: 'docs' },
  // Phone tab bar fits 6 — Brokers rides the desktop sidebar, reachable on phone
  // via load/import links.
  { href: '/brokers', labelKey: 'nav.brokers', icon: 'shield', desktopOnly: true },
  { href: '/telegram', labelKey: 'nav.telegram', icon: 'chat' },
  // The phone tab bar fits 6 — this stays reachable from dashboard/load pages there.
  { href: '/invoices', labelKey: 'nav.finances', icon: 'money', desktopOnly: true },
]

export function Nav({
  companyName,
  user,
  showTelegram,
  showFinances,
  urgentDocs,
}: {
  companyName: string
  user: CurrentUser | null
  /** Capability-gated (admin panel → per-dispatcher). Hidden when the user lacks it;
   * the page itself also refuses, so this just avoids showing a dead tab. */
  showTelegram: boolean
  showFinances: boolean
  /** Count of truck/driver documents overdue or ≤30 days out — badged on Траки so
   * it's visible from any page, not just the one banner on the dashboard. */
  urgentDocs: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const brand = brandName(companyName)

  // Phone only (see the md: reset in globals.css's .nav-icon-btn): the icon row
  // starts open, same as before, then tucks itself behind the avatar after a few
  // idle seconds so it stops competing with the page for thumb space. Tapping the
  // avatar while collapsed brings it back (UserPanel intercepts that first tap);
  // any tap inside the row — including that reveal — restarts the countdown.
  const [dockExpanded, setDockExpanded] = useState(true)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Desktop sidebar fold. Starts expanded to match the server render (no hydration
  // mismatch); an effect then reads the saved choice and toggles .nav-collapsed on
  // <html>, which the CSS variable --sidebar-w keys off for both the rail and the
  // content offset. ponytail: a one-frame flash for users who had it folded is fine.
  const [railFolded, setRailFolded] = useState(false)
  useEffect(() => {
    if (localStorage.getItem('nav-folded') === '1') setRailFolded(true)
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('nav-collapsed', railFolded)
    localStorage.setItem('nav-folded', railFolded ? '1' : '0')
  }, [railFolded])

  function bumpDockTimer() {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(() => setDockExpanded(false), 5000)
  }

  useEffect(() => {
    bumpDockTimer()
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function expandDock() {
    setDockExpanded(true)
    bumpDockTimer()
  }
  const hidden = new Set<string>()
  if (!showTelegram) hidden.add('/telegram')
  if (!showFinances) hidden.add('/invoices')
  const items = hidden.size ? ITEMS.filter((it) => !hidden.has(it.href)) : ITEMS

  // Every login and every section switch is a chance to nudge GPS forward — no
  // external cron ever got set up, so this was the only thing actually keeping
  // Live Share data from going stale between manual "Обновить" clicks. Polling GPS
  // into the DB is useless on its own though — the page already on screen was
  // rendered with the OLD snapshot and nothing tells it to re-fetch, so a truck could
  // sit shown "in the wrong place" indefinitely. router.refresh() re-renders the
  // current route once fresh data actually landed (skipped entirely if throttled).
  useEffect(() => {
    if (!user) return
    autoRefreshFleet()
      .then((refreshed) => refreshed && router.refresh())
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user?.id])

  return (
    <nav
      className={[
        // Phone: bottom bar (utility strip + tabs). Desktop: left sidebar. Same
        // element — but only the sidebar carries a panel of its own now. On the
        // phone, nothing here has a background at all: every tab and icon button
        // floats directly over the page, relying on its own text/icon contrast
        // (and, for the top icon row, its own shadow-only 3D look) to read —
        // there's no bar underneath any of it to lean on.
        'fixed inset-x-0 bottom-0 z-50 flex flex-col',
        'px-2 pt-1',
        'md:inset-y-0 md:right-auto md:w-[var(--sidebar-w)] md:justify-start md:border-r md:border-white/8 md:bg-ink-950/80 md:p-3 md:backdrop-blur-xl md:transition-[width] md:duration-200 md:ease-out',
      ].join(' ')}
      // A fixed bar sits against the viewport, so body's safe-area padding does not
      // protect it — without this it lands under the iPhone home indicator.
      style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
    >
      {/* Brand row doubles as the fold toggle (desktop only). Click the logo — or the
          chevron — to collapse the sidebar to an icon rail and back. */}
      <button
        type="button"
        onClick={() => setRailFolded((f) => !f)}
        title={t(locale, railFolded ? 'nav.expand' : 'nav.collapse')}
        aria-label={t(locale, railFolded ? 'nav.expand' : 'nav.collapse')}
        aria-expanded={!railFolded}
        className="nav-brand-row group mb-4 mt-1 hidden w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left hover:bg-white/5 md:flex"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-haul-500 to-good-500 text-[15px] font-bold">
          {brand.charAt(0)}
        </div>
        <span className="nav-brand-name min-w-0 flex-1 text-[14px] font-semibold leading-tight">{brand}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-4 shrink-0 text-white/40 transition-transform group-hover:text-white/70 ${
            railFolded ? 'rotate-180' : ''
          }`}
          aria-hidden
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {/* Tabs: a floating glass dock on the phone (see .nav-dock), a plain column in the
          sidebar. */}
      <div className="nav-dock flex items-stretch justify-around gap-0.5 md:flex-col md:gap-0.5">
        {items.map((it) => {
        const active = !it.soon && (it.href === '/' ? pathname === '/' : pathname.startsWith(it.href))

        const body = (
          <>
            <span className="relative inline-flex">
              <Icon d={icons[it.icon]} />
              {it.href === '/trucks' && urgentDocs > 0 && (
                <span
                  className="nums absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-bad-500 text-[8px] font-bold text-white"
                  title={`${t(locale, 'nav.urgentDocs')}: ${urgentDocs}`}
                >
                  {urgentDocs > 9 ? '9+' : urgentDocs}
                </span>
              )}
            </span>
            <span className="nav-label max-w-full truncate text-[11px] font-medium md:text-[13px]">
              {t(locale, it.labelKey)}
            </span>
            {it.soon && (
              <span className="nav-label ml-auto hidden rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/62 md:inline">
                {t(locale, 'nav.soon')}
              </span>
            )}
          </>
        )

        const shape =
          'nav-tab-btn relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2 md:flex-none md:flex-row md:gap-3 md:px-3 md:py-2.5'

        if (it.soon) {
          return (
            <div
              key={it.href}
              aria-disabled
              title={t(locale, 'nav.notDoneYet')}
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
            title={t(locale, it.labelKey)}
            aria-current={active ? 'page' : undefined}
            className={`${shape} ${it.desktopOnly ? 'max-md:hidden' : ''} ${
              active ? 'text-haul-400 md:text-white' : 'text-white/70 hover:text-white/90'
            }`}
          >
            {body}
            {/* The tab answers for itself while the next page is on its way. Absolute,
                so the phone dock — where every tab is a few pixels wide — doesn't
                reflow the moment it appears. Renders nothing at rest. */}
            <LinkPending className="absolute right-1 top-1" />
          </Link>
        )
        })}
      </div>

      {/* Account row — one round icon set, visible at every width. Used to be split
          into a mobile-only bell/theme strip and a separate desktop-only card, which
          meant the account menu, Журнал and even the logout button were completely
          unreachable below the md breakpoint (reported live: "the block disappeared,
          can't do anything"). Admin/logout now live inside UserPanel's own popover. */}
      <div
        className="nav-account-row order-first mb-1.5 flex items-center justify-end px-1 pb-1 md:order-none md:mt-auto md:justify-start md:px-0 md:pb-0"
        // Bubbles up from any button inside (locale/bell/journal/theme, and the
        // avatar's own reveal tap) — any interaction in the row restarts the
        // 5-second idle countdown, not just the tap that first opened it.
        onClickCapture={bumpDockTimer}
      >
        {/* Phone keeps all four out where the thumb is. Desktop shows only the bell —
            it is the one control that reports something (alert tints) rather than just
            offering a switch — and folds language, journal and theme into the account
            menu, which is where this class of app puts them. `contents` so the wrapper
            adds no box of its own; `md:hidden` then removes the group wholesale. */}
        <span className="contents md:hidden">
          <LocaleToggle collapsed={!dockExpanded} />
          {user && <JournalLink pathname={pathname} locale={locale} collapsed={!dockExpanded} />}
          <ThemeToggle collapsed={!dockExpanded} />
        </span>
        {/* Avatar first, bell to its RIGHT: the account button is the anchor of this
            row — it is what opens the menu — and an anchor belongs at the end of the
            group it owns, not buried mid-row. */}
        {user && (
          <UserPanel
            user={user}
            dockCollapsed={!dockExpanded}
            onExpandDock={expandDock}
            showTelegram={showTelegram}
            showFinances={showFinances}
          >
            <TileSlot label={t(locale, 'userPanel.tileLang')}>
              <LocaleToggle />
            </TileSlot>
            <TileSlot label={t(locale, 'userPanel.tileJournal')}>
              <JournalLink pathname={pathname} locale={locale} />
            </TileSlot>
            <TileSlot label={t(locale, 'userPanel.tileTheme')}>
              <ThemeToggle />
            </TileSlot>
          </UserPanel>
        )}
        <Notifier collapsed={!dockExpanded} />
      </div>
    </nav>
  )
}
