'use client'

// The one account-menu entry point, visible at every screen width (it used to live
// only inside a `hidden md:flex` card, so on a narrower window there was no way to
// reach it at all). A round avatar button — consistent trigger everywhere — opens a
// popover with password change, admin link, and logout, instead of those being
// separate elements that could each independently vanish at some breakpoint.

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { changeMyPassword } from '@/app/account/actions'
import { signOut } from '@/app/login/actions'
import { notify } from '@/lib/notify'
import type { CurrentUser } from '@/lib/session'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

export function UserPanel({ user }: { user: CurrentUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
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
        onClick={() => setOpen((v) => !v)}
        title={user.name}
        aria-label={user.name}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-haul-500/35 to-good-500/25 text-[12px] font-semibold text-white/85 ring-1 ring-white/10 transition-colors hover:ring-white/25"
      >
        {initialsOf(user.name)}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-xl border border-white/10 bg-ink-900 p-3.5 pr-9 shadow-2xl">
          <button
            type="button"
            aria-label={t(locale, 'userPanel.close')}
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-[15px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/90"
          >
            ✕
          </button>
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="text-[11px] text-white/45">
            {t(locale, user.role === 'admin' ? 'userPanel.roleAdmin' : 'userPanel.roleDispatcher')}
          </p>

          <div className="mt-3 border-t border-white/8 pt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
              {t(locale, 'userPanel.changePassword')}
            </p>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t(locale, 'userPanel.newPasswordPlaceholder')}
              className="w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500"
            />
            <button
              disabled={pending || pw.length < 8}
              onClick={savePassword}
              className="mt-2 w-full rounded-lg bg-haul-500 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
            >
              {pending ? t(locale, 'common.saving') : t(locale, 'common.save')}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 border-t border-white/8 pt-3 text-[12px]">
            {user.role === 'admin' && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className={`transition-colors hover:text-white/85 ${
                  pathname.startsWith('/admin') ? 'text-haul-400' : 'text-white/70'
                }`}
              >
                {t(locale, 'userPanel.admin')}
              </Link>
            )}
            <button
              onClick={logout}
              disabled={pending}
              className="text-white/70 transition-colors hover:text-white/85 disabled:opacity-40"
            >
              {pending ? '…' : t(locale, 'userPanel.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
