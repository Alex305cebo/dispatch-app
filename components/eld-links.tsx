'use client'

import { Button } from '@/components/button'
// Tracking links (one per truck) → we pull GPS from them, no vendor key needed.
// Deliberately generic and instruction-free in the UI: the owner sets this up once,
// and no third-party product should be named or explained on their screen.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveEldShareLinks } from '@/app/actions'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function EldLinks({ count }: { count: number }) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()

  function save() {
    start(async () => {
      const res = await saveEldShareLinks(text)
      if ('error' in res) notify('error', res.error)
      else {
        notify(
          res.updated > 0 ? 'ok' : 'warn',
          `${t(locale, 'tracking.linksSavedPrefix')}${res.saved}${t(locale, 'tracking.updatedTrucksMid')}${res.updated}` +
            (res.errors.length ? `${t(locale, 'tracking.errorsSuffix')}${res.errors.length}` : ''),
        )
        router.refresh()
      }
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
          <p className="mb-2 text-[11px] leading-relaxed text-white/55">
            {t(locale, 'tracking.eldLinksInfo')}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={t(locale, 'tracking.eldLinksPlaceholder')}
            className="w-full rounded-lg border border-white/8 bg-ink-900/80 px-3 py-2 text-[12px] text-white outline-none focus:border-haul-500"
          />
          <Button variant="primary" size="sm" className="mt-2" disabled={pending || !text.trim()}
            onClick={save}>
            {pending ? t(locale, 'tracking.savingUpdating') : t(locale, 'tracking.saveAndUpdate')}
          </Button>
        </div>
      )}
    </div>
  )
}
