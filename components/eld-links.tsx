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
import { ChevronDown, Radio } from 'lucide-react'
import { clearTracking, saveTracking } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function EldLinks({ count, eldOn = false }: { count: number; eldOn?: boolean }) {
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
    // Та же панель, что и остальные секции страницы: раньше это была плоская
    // полоса с текстовым «▼», выглядела чужой и сломанной.
    <section className="panel mt-4 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
          <Radio size={13} strokeWidth={2.2} className="text-haul-300" />
          {t(locale, 'tracking.trackingHeader')}
        </span>
        {(eldOn || count > 0) && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-good-500/30 bg-good-500/10 px-2.5 py-0.5 text-[11.5px] font-medium text-good-400">
            <span className="h-1.5 w-1.5 rounded-full bg-good-400" />
            {eldOn ? t(locale, 'tracking.eldConnected') : `${t(locale, 'tracking.connectedShort')} ${count}`}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-white/50">
          {t(locale, open ? 'tracking.setupHide' : 'tracking.setupShow')}
          <ChevronDown size={15} strokeWidth={2.2} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
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
    </section>
  )
}
