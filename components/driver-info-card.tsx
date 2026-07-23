'use client'

import { Button } from '@/components/button'
// Collapsed by default — the "Driver Information" text block (lib/ratecon.ts
// formatDriverInfo) saved when the load's rate con was read. Lets a dispatcher come
// back and re-copy it any time (resend to the driver, a new driver on the load),
// not just once in the browser tab that did the original import.

import { useTransition } from 'react'
import { notify } from '@/lib/notify'
import { t, type Locale } from '@/lib/i18n'
import { Info } from './info'

export function DriverInfoCard({ text, locale = 'en' }: { text: string; locale?: Locale }) {
  const [, startCopy] = useTransition()

  function copy() {
    startCopy(async () => {
      try {
        await navigator.clipboard.writeText(text)
        notify('ok', t(locale, 'trucks.driverInfo.copied'))
      } catch {
        notify('warn', t(locale, 'trucks.driverInfo.copyFailed'))
      }
    })
  }

  return (
    <details className="group panel mt-4 p-4">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
        <span className="text-white/40 transition-transform group-open:rotate-90">▸</span>
        {t(locale, 'trucks.driverInfo.heading')}
        <Info text={t(locale, 'trucks.driverInfo.info')} />
      </summary>
      <div className="mt-3">
        <div className="mb-2 flex justify-end">
          <Button variant="primary" size="sm" type="button"
            onClick={copy}>
            {t(locale, 'trucks.driverInfo.copyButton')}
          </Button>
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-ink-900/60 p-3 font-mono text-[12px] leading-relaxed text-white/85">
          {text}
        </pre>
      </div>
    </details>
  )
}
