'use client'

// Публичное демо на экране входа. Две разные вещи в одном блоке, и это намеренно:
//
// • переключатель — показывать ли демо ЭТОЙ установки (нужно нашей витрине);
// • адрес — куда вести, если демо живёт ОТДЕЛЬНО.
//
// Второе и есть обычный случай у клиента: свою базу демо-данными засорять незачем,
// а показать приложение до покупки надо. Адрес указан — на входе появляется кнопка,
// ведущая на отдельную установку, и база клиента при этом не участвует вообще.

import { useState, useTransition } from 'react'
import { Button } from '@/components/button'
import { setDemoConfig } from './actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function DemoToggle({ enabled, url }: { enabled: boolean; url: string }) {
  const locale = useLocale()
  const [on, setOn] = useState(enabled)
  const [addr, setAddr] = useState(url)
  const [pending, start] = useTransition()

  function save(nextOn: boolean, nextAddr: string) {
    start(async () => {
      const res = await setDemoConfig({ enabled: nextOn, url: nextAddr })
      if (res?.error) {
        notify('error', res.error)
        return
      }
      setOn(nextOn)
      notify('ok', t(locale, nextOn ? 'admin.demoPublic.turnedOn' : 'admin.demoPublic.turnedOff'))
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] leading-relaxed text-white/65">
          {on ? t(locale, 'admin.demoPublic.currentlyOn') : t(locale, 'admin.demoPublic.currentlyOff')}
        </p>
        <button
          disabled={pending}
          onClick={() => save(!on, addr)}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
            on
              ? 'border-bad-500/25 text-bad-400 hover:border-bad-500/50'
              : 'border-good-500/25 text-good-400 hover:border-good-500/50'
          }`}
        >
          {on ? t(locale, 'admin.demoPublic.turnOff') : t(locale, 'admin.demoPublic.turnOn')}
        </button>
      </div>

      <div>
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/55">
          {t(locale, 'admin.demoPublic.urlLabel')}
        </span>
        <div className="flex gap-2">
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="https://demo.example.com"
            className="w-full rounded-lg border border-white/8 bg-ink-950/80 px-2.5 py-1.5 text-[13px] outline-none focus:border-haul-500"
          />
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => save(on, addr)}>
            {t(locale, 'common.save')}
          </Button>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">{t(locale, 'admin.demoPublic.urlHint')}</p>
      </div>
    </div>
  )
}
