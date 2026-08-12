'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { runBrokerCheck } from '@/app/actions'
import type { BrokerCheck } from '@/lib/fmcsa'
import type { OurBroker } from '@/lib/brokers'
import type { TopBroker } from '@/lib/brokers-top'
import { BrokerChecklist } from '@/components/broker-checklist'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

const input =
  'w-full rounded-xl border border-white/10 bg-ink-950/70 px-3 py-2 text-[14px] text-white outline-none focus:border-haul-500'

export function BrokersClient({ ourBrokers, topBrokers }: { ourBrokers: OurBroker[]; topBrokers: TopBroker[] }) {
  const locale = useLocale()
  const [by, setBy] = useState<'mc' | 'dot'>('mc')
  const [value, setValue] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'nokey' | 'error'>('idle')
  const [data, setData] = useState<BrokerCheck | null>(null)
  const [err, setErr] = useState('')
  const [, start] = useTransition()

  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<TopBroker | null>(null)

  // Escape closes the history bubble (plus the always-visible ✕ and click-outside).
  useEffect(() => {
    if (!history) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHistory(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [history])

  function check(kind: 'mc' | 'dot', v: string) {
    const val = v.trim()
    if (!val) return
    setBy(kind)
    setValue(val)
    setState('loading')
    setData(null)
    setErr('')
    start(async () => {
      const res = await runBrokerCheck(kind, val)
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

  const filtered = useMemo(() => {
    const q = query.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!q) return ourBrokers
    const qDigits = q.replace(/\D/g, '')
    return ourBrokers.filter(
      (b) =>
        (b.name ?? '').toLowerCase().includes(q) ||
        (!!qDigits && (b.mc ?? '').includes(qDigits)) ||
        (!!qDigits && (b.phone ?? '').replace(/\D/g, '').includes(qDigits)),
    )
  }, [ourBrokers, query])

  return (
    <>
      {/* ── Check form ─────────────────────────────────────── */}
      <section className="panel p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'brokers.checkHeading')}
          <Info text={t(locale, 'brokers.checkInfo')} />
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-white/10">
            {(['mc', 'dot'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setBy(k)}
                className={`px-3 py-2 text-[13px] font-medium transition-colors ${
                  by === k ? 'bg-haul-500 text-white' : 'text-white/60 hover:text-white/85'
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
            onKeyDown={(e) => e.key === 'Enter' && check(by, value)}
            placeholder={t(locale, by === 'mc' ? 'brokers.mcPlaceholder' : 'brokers.dotPlaceholder')}
            className={`${input} max-w-[240px] flex-1`}
          />
          <button
            type="button"
            onClick={() => check(by, value)}
            disabled={state === 'loading' || !value.trim()}
            className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400 disabled:opacity-50"
          >
            {state === 'loading' ? t(locale, 'brokers.checking') : t(locale, 'brokers.checkButton')}
          </button>
        </div>

        {state === 'nokey' && (
          <p className="mt-3 rounded-lg bg-warn-400/10 px-3 py-2 text-[12.5px] leading-relaxed text-warn-400">
            {t(locale, 'brokers.noKey')}
          </p>
        )}
        {state === 'error' && <p className="mt-3 text-[13px] text-bad-400">{err}</p>}
        {state === 'done' && data && <BrokerChecklist check={data} />}
      </section>

      {/* ── Our brokers ────────────────────────────────────── */}
      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'brokers.dbHeading')}
          <Info text={t(locale, 'brokers.dbInfo')} />
          <span className="ml-auto rounded-full bg-white/8 px-2 py-0.5 text-[11px] normal-case text-white/60">
            {ourBrokers.length}
          </span>
        </h2>

        {ourBrokers.length === 0 ? (
          <p className="text-[13px] text-white/50">{t(locale, 'brokers.empty')}</p>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(locale, 'brokers.searchPlaceholder')}
              className={`${input} mb-3`}
            />
            {filtered.length === 0 ? (
              <p className="text-[13px] text-white/45">{t(locale, 'brokers.noMatch')}</p>
            ) : (
              <ul className="flex max-h-[22rem] flex-col gap-1.5 overflow-y-auto pr-1">
                {filtered.map((b) => (
                  <li
                    key={(b.mc ?? b.name ?? '') + b.loadCount}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/6 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[14px] font-medium">{b.name ?? '—'}</span>
                        <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/60">
                          {b.mc ? `MC ${b.mc}` : t(locale, 'brokers.noMc')}
                        </span>
                        {b.authorityStatus && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              b.authorityStatus === 'active'
                                ? 'bg-good-500/15 text-good-400'
                                : 'bg-bad-500/15 text-bad-400'
                            }`}
                          >
                            {b.authorityStatus === 'active'
                              ? t(locale, 'brokers.statusActive')
                              : t(locale, 'brokers.statusInactive')}
                          </span>
                        )}
                        {/* Кто реально платит: рейт-кон почти всегда называет платёжный
                            сервис, а публичного справочника «MC → факторинг» не существует. */}
                        {b.payVia && (
                          <span className="shrink-0 rounded-full bg-haul-500/15 px-2 py-0.5 text-[10px] font-medium text-haul-300">
                            {t(locale, 'brokers.payVia').replace('{name}', b.payVia)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-white/45">
                        {b.phone && <span>{b.phone}</span>}
                        {b.email && <span className="truncate">{b.email}</span>}
                        <span>{t(locale, 'brokers.loadsCount').replace('{n}', String(b.loadCount))}</span>
                        {b.lastLoad && <span>{t(locale, 'brokers.lastLoad').replace('{date}', b.lastLoad)}</span>}
                      </div>
                    </div>
                    {b.mc && (
                      <button
                        type="button"
                        onClick={() => check('mc', b.mc!)}
                        className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] text-white/70 transition-colors hover:border-haul-500/50 hover:text-haul-300"
                      >
                        {t(locale, 'brokers.recheck')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ── Largest brokers (reference) ────────────────────── */}
      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'brokers.topHeading')}
          <Info text={t(locale, 'brokers.topInfo')} />
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {topBrokers.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => setHistory(b)}
              className="rounded-full border border-white/8 bg-white/[0.02] px-2.5 py-1 text-[12px] text-white/70 transition-colors hover:border-haul-500/50 hover:text-white"
            >
              {b.name}
              <span className="ml-1.5 text-white/35">{b.hq}</span>
            </button>
          ))}
        </div>
      </section>

      {/* History bubble — click a broker chip to read who they are. */}
      {history && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setHistory(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setHistory(null)}
              aria-label={t(locale, 'brokers.close')}
              className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
            <h3 className="pr-8 text-[17px] font-semibold">{history.name}</h3>
            <p className="mt-0.5 text-[12px] uppercase tracking-wider text-white/40">{history.hq}</p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-white/75">
              {locale === 'en' ? history.historyEn : history.history}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
