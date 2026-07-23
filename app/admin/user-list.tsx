'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createUser,
  resetUserPassword,
  setDispatcherCapability,
  setUserDisabled,
  setUserRole,
  type AdminUser,
} from './actions'
import { CAPABILITIES, capabilityMeta } from '@/lib/capabilities'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

const input =
  'w-full rounded-lg border border-white/10 bg-ink-950/70 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-haul-500'

export function UserList({ users, currentUserId }: { users: AdminUser[]; currentUserId: number }) {
  const locale = useLocale()
  const ROLE_LABEL = { admin: t(locale, 'userPanel.roleAdmin'), dispatcher: t(locale, 'userPanel.roleDispatcher') }
  const capMeta = capabilityMeta(locale)
  const router = useRouter()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'dispatcher'>('dispatcher')
  const [resetFor, setResetFor] = useState<number | null>(null)
  const [resetPw, setResetPw] = useState('')

  function submitNew() {
    start(async () => {
      const res = await createUser(name, email, password, role)
      if (res?.error) {
        notify('error', res.error)
        return
      }
      notify('ok', t(locale, 'admin.users.addedOk'))
      setName('')
      setEmail('')
      setPassword('')
      setRole('dispatcher')
      setAdding(false)
      router.refresh()
    })
  }

  function toggleDisabled(u: AdminUser) {
    start(async () => {
      const res = await setUserDisabled(u.id, !u.disabledAt)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', u.disabledAt ? t(locale, 'admin.users.accessEnabled') : t(locale, 'admin.users.accessDisabled'))
        router.refresh()
      }
    })
  }

  function changeRole(u: AdminUser, next: 'admin' | 'dispatcher') {
    start(async () => {
      const res = await setUserRole(u.id, next)
      if (res?.error) notify('error', res.error)
      else router.refresh()
    })
  }

  function submitReset(userId: number) {
    start(async () => {
      const res = await resetUserPassword(userId, resetPw)
      if (res?.error) {
        notify('error', res.error)
        return
      }
      notify('ok', t(locale, 'admin.users.passwordReset'))
      setResetFor(null)
      setResetPw('')
    })
  }

  function toggleCap(userId: number, key: string, allowed: boolean) {
    start(async () => {
      const res = await setDispatcherCapability(userId, key, allowed)
      if (res?.error) notify('error', res.error)
      else {
        notify('ok', t(locale, 'admin.users.permsUpdated'))
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {users.map((u) => (
        <div key={u.id} className="rounded-xl border border-white/6 bg-white/[0.015] p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium">{u.name}</span>
                {u.id === currentUserId && (
                  <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] text-white/55">{t(locale, 'admin.users.you')}</span>
                )}
                {u.disabledAt && (
                  <span className="rounded-full bg-bad-500/15 px-1.5 py-0.5 text-[10px] font-medium text-bad-400">
                    {t(locale, 'admin.users.disabledBadge')}
                  </span>
                )}
              </div>
              <div className="text-[12px] text-white/55">{u.email}</div>
            </div>

            <select
              value={u.role}
              disabled={pending || u.id === currentUserId}
              onChange={(e) => changeRole(u, e.target.value as 'admin' | 'dispatcher')}
              className="rounded-lg border border-white/10 bg-ink-950/70 px-2 py-1.5 text-[12px] text-white outline-none disabled:opacity-40"
            >
              <option value="dispatcher">{ROLE_LABEL.dispatcher}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>

            <button
              disabled={pending}
              onClick={() => setResetFor(resetFor === u.id ? null : u.id)}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
            >
              {t(locale, 'admin.users.password')}
            </button>

            <button
              disabled={pending || u.id === currentUserId}
              onClick={() => toggleDisabled(u)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors disabled:opacity-40 ${
                u.disabledAt
                  ? 'border-good-500/25 text-good-400 hover:border-good-500/50'
                  : 'border-bad-500/25 text-bad-400 hover:border-bad-500/50'
              }`}
            >
              {u.disabledAt ? t(locale, 'admin.users.enable') : t(locale, 'admin.users.disable')}
            </button>
          </div>

          {resetFor === u.id && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-white/6 pt-2.5">
              <input
                type="password"
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
                placeholder={t(locale, 'userPanel.newPasswordPlaceholder')}
                className={`${input} max-w-xs`}
              />
              <button
                disabled={pending || resetPw.length < 8}
                onClick={() => submitReset(u.id)}
                className="rounded-lg bg-haul-500 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
              >
                {t(locale, 'admin.users.save')}
              </button>
            </div>
          )}

          {/* Per-dispatcher feature access. Admins have everything, so no toggles for
              them. New capabilities added to the registry show up here automatically. */}
          {u.capabilities && (
            <details className="mt-2.5 border-t border-white/6 pt-2.5">
              <summary className="cursor-pointer text-[12px] font-medium text-white/70">
                {t(locale, 'admin.users.dispatcherPerms')}
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {CAPABILITIES.map((c) => {
                  const on = u.capabilities![c.key]
                  const meta = capMeta[c.key]
                  return (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/6 bg-white/[0.015] px-3 py-2 select-none"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={pending}
                        onChange={() => toggleCap(u.id, c.key, !on)}
                        className="mt-0.5 size-4 shrink-0 accent-good-500"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{meta.label}</span>
                        <span className="block text-[11.5px] leading-snug text-white/55">{meta.description}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </details>
          )}
        </div>
      ))}

      {adding ? (
        <div className="mt-1 rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(locale, 'admin.users.namePlaceholder')}
              className={input}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t(locale, 'admin.users.emailPlaceholder')}
              className={input}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t(locale, 'admin.users.passwordPlaceholder')}
              className={input}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'dispatcher')}
              className={input}
            >
              <option value="dispatcher">{ROLE_LABEL.dispatcher}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              disabled={pending || !name || !email || password.length < 8}
              onClick={submitNew}
              className="rounded-lg bg-haul-500 px-4 py-1.5 text-[12px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-40"
            >
              {t(locale, 'admin.users.add')}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-lg px-4 py-1.5 text-[12px] text-white/70 transition-colors hover:text-white"
            >
              {t(locale, 'admin.users.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-1 rounded-xl border border-dashed border-white/15 px-4 py-2.5 text-[13px] text-white/60 transition-colors hover:border-white/30 hover:text-white/85"
        >
          {t(locale, 'admin.users.addUser')}
        </button>
      )}
    </div>
  )
}
