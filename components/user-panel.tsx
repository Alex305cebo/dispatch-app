'use client'

import { Button } from '@/components/button'
// The one account-menu entry point, visible at every screen width (it used to live
// only inside a `hidden md:flex` card, so on a narrower window there was no way to
// reach it at all). A round avatar button — consistent trigger everywhere — opens a
// popover with password change, admin link, and logout, instead of those being
// separate elements that could each independently vanish at some breakpoint.

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  DollarSign,
  KeyRound,
  LifeBuoy,
  LogOut,
  PackagePlus,
  RotateCw,
  Send,
  ShieldCheck,
  Truck as TruckIcon,
  Upload,
  Users,
} from 'lucide-react'
import { changeMyPassword, setRecoveryBirthday } from '@/app/account/actions'
import { signOut } from '@/app/login/actions'
import { notify } from '@/lib/notify'
import type { CurrentUser } from '@/lib/session'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

/** Caption above, control below. Exported because the language/theme/journal controls
 * are their own components and get captioned by the nav — every tile in this menu is
 * labelled, so none of them is a guess. */
export function TileSlot({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="w-full truncate text-center text-[11px] leading-none text-white/50">{label}</span>
      {children}
    </span>
  )
}

const TILE_BASE =
  'nav-icon-btn flex size-9 items-center justify-center rounded-full border transition-colors'
const TILE_OFF = 'border-white/10 text-white/72 hover:border-white/25 hover:text-white'
const TILE_ON = 'border-haul-500/50 bg-haul-500/15 text-haul-400'

function MenuTile({
  label,
  children,
  href,
  active = false,
  onClick,
  onNavigate,
}: {
  label: string
  children: React.ReactNode
  href?: string
  active?: boolean
  onClick?: () => void
  onNavigate?: () => void
}) {
  const cls = `${TILE_BASE} ${active ? TILE_ON : TILE_OFF}`
  return (
    <TileSlot label={label}>
      {href ? (
        <Link href={href} onClick={onNavigate} title={label} className={cls}>
          {children}
        </Link>
      ) : (
        <button type="button" onClick={onClick} title={label} aria-pressed={active} className={cls}>
          {children}
        </button>
      )}
    </TileSlot>
  )
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

export function UserPanel({
  user,
  dockCollapsed = false,
  onExpandDock,
  showTelegram = false,
  showFinances = false,
  children,
}: {
  user: CurrentUser
  /** Same capability flags the nav uses to hide dead tabs. A tile pointing at a screen
   * this user is not allowed to open would be a promise the app then breaks. */
  showTelegram?: boolean
  showFinances?: boolean
  /** Whether the sibling icons (locale/notifications/journal/theme) are currently
   * tucked away (components/nav.tsx). When they are, the FIRST tap on the avatar
   * just brings them back instead of opening the profile popover — a second tap,
   * once they're out, opens it as before. */
  dockCollapsed?: boolean
  onExpandDock?: () => void
  /** Utility controls that stay on the phone's icon row but fold in here on desktop —
   * language, theme, journal. A navigation rail is the wrong home for four permanent
   * round buttons; the reference apps in this class keep the rail for navigation and
   * hang the switches off the account menu. Rendered on md+ only: on the phone the
   * same controls are still on the row itself, where the thumb already is. */
  children?: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  // Password form starts folded — its own tile opens it (see MenuTile below).
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [bdayOpen, setBdayOpen] = useState(false)
  const [bday, setBday] = useState('')
  const [pending, start] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape, or a click anywhere outside the popover, closes it — same as every other
  // popover in the app, it must never be able to trap the user with no way out.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function onAvatarClick() {
    // The "first tap only un-tucks the icons" rule belongs to the PHONE dock and
    // nowhere else: `.nav-icon-btn.is-collapsed` is reset at md, so on desktop nothing
    // was ever tucked away — yet the flag stayed true after the 5s idle timer and ate
    // the first click on the avatar anyway. Reported as "меню открывается не с первого
    // нажатия". Gate it on the same breakpoint the CSS uses.
    const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767.98px)').matches
    if (phone && dockCollapsed && onExpandDock) {
      onExpandDock()
      return
    }
    setOpen((v) => !v)
  }

  function savePassword() {
    start(async () => {
      const res = await changeMyPassword(pw)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'userPanel.passwordChanged'))
        setPw('')
      }
    })
  }

  function logout() {
    start(async () => {
      await signOut()
      router.refresh()
    })
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={onAvatarClick}
        title={user.name}
        aria-label={user.name}
        data-tour="avatar"
        className="nav-avatar-btn flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-haul-500 to-good-500 text-[12px] font-semibold text-white"
      >
        {initialsOf(user.name)}
      </button>

      {open && (
        // Positioned against the VIEWPORT, not the avatar.
        //
        // Anchoring to the trigger cannot work at any width: the avatar sits in the
        // middle of the nav's icon row, so a 16rem panel hangs off the LEFT edge when
        // anchored right (measured: left edge at -61px, which cut "CHANGE PASSWORD"
        // down to "E PASSWORD") and off the RIGHT edge when anchored left. Because
        // `html` sets overflow-x:hidden, the excess was silently clipped rather than
        // becoming scrollable — so it looked like broken text, not a layout overflow.
        //
        // Fixed with a gutter on both sides can't overflow at any width: it spans the
        // screen on a phone and settles to its natural 16rem beside the sidebar.
        <div className="user-menu fixed inset-x-3 bottom-24 z-[55] mx-auto max-w-sm rounded-xl border border-white/10 bg-ink-900 p-4 shadow-2xl md:bottom-16 md:left-3 md:right-auto md:mx-0 md:w-72 md:max-w-none">
          <button
            type="button"
            aria-label={t(locale, 'userPanel.close')}
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-[15px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
          >
            ✕
          </button>
          <p className="truncate pr-7 text-[13px] font-medium">{user.name}</p>
          <p className="text-[11px] text-white/45">
            {t(locale, user.role === 'admin' ? 'userPanel.roleAdmin' : 'userPanel.roleDispatcher')}
          </p>

          {/* Быстрые действия. Половина этих экранов иначе недостижима с телефона:
              «Брокеры» и «Финансы» помечены в навигации как desktopOnly (в нижнюю
              панель влезает только шесть вкладок), а «Импорта» нет в навигации
              вообще. То есть это не ярлыки к соседней кнопке, а единственный вход. */}
          <div className="mt-3 border-t border-white/8 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
              {t(locale, 'userPanel.actionsSection')}
            </p>
            <div className="grid grid-cols-4 gap-2">
              <MenuTile
                label={t(locale, 'userPanel.tileNewLoad')}
                href="/loads/new"
                onNavigate={() => setOpen(false)}
              >
                <PackagePlus size={15} />
              </MenuTile>
              <MenuTile
                label={t(locale, 'userPanel.tileNewTruck')}
                href="/trucks/new"
                onNavigate={() => setOpen(false)}
              >
                <TruckIcon size={15} />
              </MenuTile>
              <MenuTile
                label={t(locale, 'userPanel.tileBrokers')}
                href="/brokers"
                active={pathname.startsWith('/brokers')}
                onNavigate={() => setOpen(false)}
              >
                <ShieldCheck size={15} />
              </MenuTile>
              <MenuTile
                label={t(locale, 'userPanel.tileImport')}
                href="/loads/new"
                active={pathname.startsWith('/loads/new')}
                onNavigate={() => setOpen(false)}
              >
                <Upload size={15} />
              </MenuTile>
              {showFinances && (
                <MenuTile
                  label={t(locale, 'userPanel.tileFinances')}
                  href="/invoices"
                  active={pathname.startsWith('/invoices')}
                  onNavigate={() => setOpen(false)}
                >
                  <DollarSign size={15} />
                </MenuTile>
              )}
              {showTelegram && (
                <MenuTile
                  label={t(locale, 'userPanel.tileTelegram')}
                  href="/telegram"
                  active={pathname.startsWith('/telegram')}
                  onNavigate={() => setOpen(false)}
                >
                  <Send size={15} />
                </MenuTile>
              )}
              {/* Не ссылка, а механизм: перерисовать текущую страницу свежими данными,
                  не уходя с неё. До этого единственным способом был F5. */}
              <MenuTile
                label={t(locale, 'userPanel.tileRefresh')}
                onClick={() => {
                  router.refresh()
                  setOpen(false)
                }}
              >
                <RotateCw size={15} />
              </MenuTile>
            </div>
          </div>

          {/* Каждый пункт — подпись сверху, круг снизу. Подпись именно НАД кнопкой:
              иконка без слова заставляет гадать, а всплывающая подсказка на телефоне
              не появляется вовсе. */}
          <div className="mt-3 border-t border-white/8 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
              {t(locale, 'userPanel.quickSettings')}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {/* Язык и тема живут в собственных компонентах и на телефоне остаются
                  на панели снаружи — сюда они попадают только на десктопе. */}
              {children}
              <MenuTile
                label={t(locale, 'userPanel.tilePassword')}
                active={pwOpen}
                onClick={() => setPwOpen((v) => !v)}
              >
                <KeyRound size={15} />
              </MenuTile>
              {/* Дата рождения для «Забыли пароль?» — единственный путь назад, если
                  пароль забыт, а ты единственный админ. Хранится хешем; здесь её
                  можно задать или заменить (нужно аккаунтам, созданным до того,
                  как дата появилась в регистрации). */}
              <MenuTile
                label={t(locale, 'userPanel.tileRecovery')}
                active={bdayOpen}
                onClick={() => setBdayOpen((v) => !v)}
              >
                <LifeBuoy size={15} />
              </MenuTile>
            </div>

            {bdayOpen && (
              <div className="mt-2.5">
                <p className="mb-1.5 text-[11px] leading-relaxed text-white/55">
                  {t(locale, 'userPanel.recoveryHint')}
                </p>
                <input
                  type="date"
                  value={bday}
                  onChange={(e) => setBday(e.target.value)}
                  className="w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500"
                />
                <Button
                  variant="primary"
                  size="sm"
                  block
                  className="mt-2"
                  loading={pending}
                  disabled={pending || !bday}
                  onClick={() =>
                    start(async () => {
                      const res = await setRecoveryBirthday(bday)
                      if (res?.error) notify('error', res.error)
                      else {
                        notify('ok', t(locale, 'userPanel.recoverySaved'))
                        setBdayOpen(false)
                      }
                    })
                  }
                >
                  {t(locale, 'common.save')}
                </Button>
              </div>
            )}

            {/* Форма пароля раскрывается своей плиткой, а не занимает место всегда:
                пароль меняют раз в полгода, а меню открывают каждый день. */}
            {pwOpen && (
              <div className="mt-2.5">
                <input
                  type="password"
                  value={pw}
                  autoFocus
                  onChange={(e) => setPw(e.target.value)}
                  placeholder={t(locale, 'userPanel.newPasswordPlaceholder')}
                  className="w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500"
                />
                <Button
                  variant="primary"
                  size="sm"
                  block
                  className="mt-2"
                  loading={pending}
                  disabled={pending || pw.length < 8}
                  onClick={savePassword}
                >
                  {pending ? t(locale, 'common.saving') : t(locale, 'common.save')}
                </Button>
              </div>
            )}
          </div>

          {user.role === 'admin' && (
            <div className="mt-3 border-t border-white/8 pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                {t(locale, 'userPanel.adminSection')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <MenuTile
                  label={t(locale, 'userPanel.tileUsers')}
                  href="/admin"
                  active={pathname.startsWith('/admin')}
                  onNavigate={() => setOpen(false)}
                >
                  <Users size={15} />
                </MenuTile>
                <MenuTile
                  label={t(locale, 'userPanel.tileImport')}
                  href="/loads/new"
                  active={pathname.startsWith('/loads/new')}
                  onNavigate={() => setOpen(false)}
                >
                  <Upload size={15} />
                </MenuTile>
                {/* Ключи живут на той же странице, что и люди, но искать их за
                    кнопкой «Люди» никто не станет: слово ничего про ключи не
                    говорит. Своя плитка ведёт в тот же /admin, сразу к якорю. */}
                <MenuTile
                  label={t(locale, 'userPanel.tileKeys')}
                  href="/admin#keys"
                  active={false}
                  onNavigate={() => setOpen(false)}
                >
                  <KeyRound size={15} />
                </MenuTile>
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-white/8 pt-3">
            <button
              onClick={logout}
              disabled={pending}
              className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-[12.5px] text-white/70 transition-colors hover:bg-bad-500/10 hover:text-bad-400 disabled:opacity-40"
            >
              <LogOut size={14} />
              {pending ? '…' : t(locale, 'userPanel.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
