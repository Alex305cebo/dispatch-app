'use client'

// Collapsed by default — the "Driver Information" text block (lib/ratecon.ts
// formatDriverInfo) saved when the load's rate con was read. Lets a dispatcher come
// back and re-copy it any time (resend to the driver, a new driver on the load),
// not just once in the browser tab that did the original import.

import { useTransition } from 'react'
import { notify } from '@/lib/notify'
import { Info } from './info'

export function DriverInfoCard({ text }: { text: string }) {
  const [, startCopy] = useTransition()

  function copy() {
    startCopy(async () => {
      try {
        await navigator.clipboard.writeText(text)
        notify('ok', 'Скопировано — можно слать водителю')
      } catch {
        notify('warn', 'Браузер не дал буфер — выдели вручную')
      }
    })
  }

  return (
    <details className="group panel mt-4 p-4">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
        <span className="text-white/40 transition-transform group-open:rotate-90">▸</span>
        Инфо для водителя — скопировать
        <Info text="Готовый текст для водителя: адреса загрузки/выгрузки, время, номера, ставка, вес — собранный из rate con при распознавании. Разверни и нажми «Копировать», чтобы отправить снова." />
      </summary>
      <div className="mt-3">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={copy}
            className="rounded-lg bg-haul-500 px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-haul-400"
          >
            Копировать
          </button>
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-ink-900/60 p-3 font-mono text-[12px] leading-relaxed text-white/85">
          {text}
        </pre>
      </div>
    </details>
  )
}
