'use client'

import { Button } from '@/components/button'
// Подключение отслеживания — одно поле на всё.
//
// Было два: «ссылки» для ZigZag и «токен» для Samsara. Владелец спросил, зачем
// первое, если у него Samsara, — и был прав: у парка ОДИН ELD, и половина экрана
// всегда чужая. Теперь вставляют то, что есть, а разбирается сервер
// (app/actions.ts → saveTracking): ссылка это, токен или вовсе ссылка на
// страницу-приложение Samsara, из которой данных не достать.

import { useState, useTransition } from 'react'
import { clearTracking, saveTracking } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function EldLinks({ count }: { count: number }) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const res = await saveTracking(text)
      if ('error' in res) {
        notify('error', res.error)
        return
      }
      setText('')
      notify(
        res.updated > 0 ? 'ok' : 'warn',
        `${t(locale, 'tracking.updatedTrucks')}${res.updated}` +
          (res.errors.length ? `${t(locale, 'tracking.errorsSuffix')}${res.errors.length}` : ''),
      )
    })
  }

  function clear() {
    start(async () => {
      await clearTracking()
      notify('ok', t(locale, 'tracking.cleared'))
    })
  }

  return (
    <div className="mb-4 rounded-xl border border-white/8 bg-ink-900/50 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-[12px] font-semibold text-white/70"
      >
        <span>
          {t(locale, 'tracking.trackingHeader')} {count > 0 && `${t(locale, 'tracking.connectedSuffix')}${count}`}
        </span>
        <span className="text-white/45">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] leading-relaxed text-white/55">{t(locale, 'tracking.setupInfo')}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={t(locale, 'tracking.setupPlaceholder')}
            className="w-full rounded-lg border border-white/8 bg-ink-900/80 px-3 py-2 text-[12px] text-white outline-none focus:border-haul-500"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" size="sm" disabled={pending || !text.trim()} onClick={save}>
              {pending ? t(locale, 'tracking.savingUpdating') : t(locale, 'tracking.saveAndUpdate')}
            </Button>
            {count > 0 && (
              <button
                disabled={pending}
                onClick={clear}
                className="text-[11.5px] text-white/45 transition-colors hover:text-bad-400 disabled:opacity-40"
              >
                {t(locale, 'tracking.disconnect')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
