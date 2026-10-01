'use client'

import { useTransition } from 'react'
import { setUserDisabled, type Workspace } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'

/** Свои кабинеты диспетчеров с dispatch4you.pro. Владелец видит, кто завёл кабинет и
 * сколько в нём траков и грузов, и может закрыть вход — сами данные кабинета не здесь. */
export function WorkspaceList({ items }: { items: Workspace[] }) {
  const locale = useLocale()
  const [pending, start] = useTransition()

  if (!items.length) return <p className="text-base text-t3">{t(locale, 'admin.workspaces.empty')}</p>

  function toggle(w: Workspace) {
    start(async () => {
      const res = await setUserDisabled(w.userId, !w.disabledAt)
      if (res && 'error' in res) notify('error', res.error)
      else notify('ok', w.disabledAt ? t(locale, 'admin.users.accessEnabled') : t(locale, 'admin.users.accessDisabled'))
    })
  }

  return (
    <ul className="divide-y divide-white/8">
      {items.map((w) => (
        <li key={w.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-md font-medium">{w.name}</span>
              {w.disabledAt && (
                <span className="rounded-full bg-bad-500/15 px-1.5 py-0.5 text-2xs font-medium text-bad-400">
                  {t(locale, 'admin.users.disabledBadge')}
                </span>
              )}
            </div>
            <div className="truncate text-sm text-t3">
              {w.email} · {usDate(w.createdAt)} ·{' '}
              {t(locale, 'admin.workspaces.counts').replace('{trucks}', String(w.trucks)).replace('{loads}', String(w.loads))}
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(w)}
            className={`rounded-lg border px-2.5 py-1.5 text-sm transition-colors disabled:opacity-40 ${
              w.disabledAt
                ? 'border-good-500/25 text-good-400 hover:border-good-500/50'
                : 'border-bad-500/25 text-bad-400 hover:border-bad-500/50'
            }`}
          >
            {w.disabledAt ? t(locale, 'admin.users.enable') : t(locale, 'admin.users.disable')}
          </button>
        </li>
      ))}
    </ul>
  )
}
