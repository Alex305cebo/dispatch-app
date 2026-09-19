'use client'

// Проверка брокера в реестре FMCSA по MC или DOT — форма, которая была на старой
// странице «Брокеры» и пропала при переделке 16.09.2026. Вернулась на «Рынок»
// 19.09.2026: незнакомый номер можно ввести и в общий поиск, но форму с двумя
// переключателями видно сразу, а поиск догадаться не помогает.

import { useState, useTransition } from 'react'
import { runBrokerCheck } from '@/app/actions'
import type { BrokerCheck } from '@/lib/fmcsa'
import { BrokerChecklist } from '@/components/broker-checklist'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export function BrokerCheckForm() {
  const locale = useLocale()
  const [by, setBy] = useState<'mc' | 'dot'>('mc')
  const [value, setValue] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'nokey' | 'error'>('idle')
  const [data, setData] = useState<BrokerCheck | null>(null)
  const [err, setErr] = useState('')
  const [, start] = useTransition()

  const check = () => {
    const val = value.replace(/\D/g, '')
    if (!val) return
    setState('loading')
    setData(null)
    setErr('')
    start(async () => {
      const res = await runBrokerCheck(by, val)
      if ('error' in res) {
        if (res.error === 'no_key') setState('nokey')
        else {
          setErr(res.error)
          setState('error')
        }
      } else {
        setData(res)
        setState('done')
      }
    })
  }

  return (
    <section className="panel h-full p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
        {t(locale, 'brokers.checkHeading')}
        <Info text={t(locale, 'brokers.checkInfo')} />
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border border-white/10">
          {(['mc', 'dot'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={by === k}
              onClick={() => setBy(k)}
              className={`min-h-9 px-3 text-sm font-medium transition-colors max-md:min-h-11 ${
                by === k ? 'bg-haul-500 text-white' : 'text-t2 hover:text-t1'
              }`}
            >
              {t(locale, k === 'mc' ? 'brokers.byMc' : 'brokers.byDot')}
            </button>
          ))}
        </div>
        <input
          value={value}
          inputMode="numeric"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          placeholder={t(locale, by === 'mc' ? 'brokers.mcPlaceholder' : 'brokers.dotPlaceholder')}
          aria-label={t(locale, 'brokers.checkHeading')}
          className="nums min-h-9 min-w-0 flex-1 basis-40 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-base text-white outline-none focus:border-haul-500/60 max-md:min-h-11"
        />
        <button
          type="button"
          onClick={check}
          disabled={state === 'loading' || !value.trim()}
          className="min-h-9 rounded-xl bg-haul-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-haul-400 disabled:opacity-50 max-md:min-h-11"
        >
          {state === 'loading' ? t(locale, 'brokers.checking') : t(locale, 'brokers.checkButton')}
        </button>
      </div>
      {state === 'nokey' && (
        <p className="mt-3 rounded-lg bg-warn-400/10 px-3 py-2 text-sm leading-relaxed text-warn-400">{t(locale, 'brokers.noKey')}</p>
      )}
      {state === 'error' && <p className="mt-3 text-sm text-bad-400">{err}</p>}
      {state === 'done' && data && <BrokerChecklist check={data} />}
    </section>
  )
}
