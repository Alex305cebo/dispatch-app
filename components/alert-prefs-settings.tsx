'use client'

// «Настройки» → «Профиль» → «Уведомления» (19.11.26, просьба владельца): события
// по умолчанию только в колокольчике, без окон поверх экрана; «не оплачено» выключено.
// Каждый переключатель сохраняется сразу, без кнопки «Сохранить».

import { useState, useTransition } from 'react'
import { Bell } from 'lucide-react'
import { setAlertPrefs } from '@/app/account/actions'
import { useLocale } from '@/components/locale-provider'
import { ALERT_KINDS, type AlertPrefs } from '@/lib/alert-prefs'
import { notify } from '@/lib/notify'
import { t, type MsgKey } from '@/lib/i18n'

const ROWS: (keyof AlertPrefs)[] = ['popups', ...ALERT_KINDS]

function Switch({ on, label, disabled, onClick }: { on: boolean; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-base text-t1 transition-colors hover:bg-white/8 disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-haul-500' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function AlertPrefsSettings({ initial }: { initial: AlertPrefs }) {
  const locale = useLocale()
  const [prefs, setPrefs] = useState(initial)
  const [pending, start] = useTransition()

  function flip(k: keyof AlertPrefs) {
    const was = prefs
    const next = { ...prefs, [k]: !prefs[k] }
    setPrefs(next)
    start(async () => {
      const res = await setAlertPrefs(next)
      if (res?.error) {
        setPrefs(was)
        notify('error', res.error)
      }
    })
  }

  return (
    <div className="mt-3 border-t border-white/8 pt-2">
      <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-sm font-semibold text-t2">
        <Bell size={14} className="text-t3" /> {t(locale, 'alertPrefs.heading')}
      </p>
      <p className="px-2 pb-1 text-xs leading-relaxed text-t3">{t(locale, 'alertPrefs.hint')}</p>
      <div className="grid gap-x-6 md:grid-cols-2">
        {ROWS.map((k) => (
          <Switch key={k} on={prefs[k]} disabled={pending} label={t(locale, `alertPrefs.${k}` as MsgKey)} onClick={() => flip(k)} />
        ))}
      </div>
    </div>
  )
}
