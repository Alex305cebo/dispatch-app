'use client'

// The step-by-step vetting checklist. The FMCSA result arrives all at once, but the
// panel reveals each check in sequence — "checking…" → ✓/⚠/⛔ — so it reads as a
// live run-through rather than a wall of fields.

import { useEffect, useState } from 'react'
import type { BrokerCheck } from '@/lib/fmcsa'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

type Status = 'ok' | 'warn' | 'bad' | 'info'
type Step = { label: string; value: string; status: Status }

function monthsSince(date: string | null): number | null {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

const MARK: Record<Status, string> = { ok: '✓', warn: '⚠', bad: '⛔', info: '·' }
const TONE: Record<Status, string> = {
  ok: 'text-good-400',
  warn: 'text-warn-400',
  bad: 'text-bad-400',
  info: 'text-white/45',
}

export function BrokerChecklist({ check }: { check: BrokerCheck }) {
  const locale = useLocale()

  const statusText =
    check.authorityStatus === 'active'
      ? t(locale, 'brokers.statusActive')
      : check.authorityStatus === 'inactive'
        ? t(locale, 'brokers.statusInactive')
        : check.authorityStatus === 'none'
          ? t(locale, 'brokers.statusNone')
          : t(locale, 'brokers.statusUnknown')

  const months = monthsSince(check.authorityGranted)
  const ageText =
    months === null
      ? t(locale, 'brokers.ageUnknown')
      : t(locale, 'brokers.ageMonths').replace('{months}', String(Math.round(months)))

  const steps: Step[] = [
    { label: t(locale, 'brokers.stepFound'), value: check.legalName ?? check.dbaName ?? '—', status: 'ok' },
    {
      label: t(locale, 'brokers.stepAuthority'),
      value: statusText,
      status: check.authorityStatus === 'active' ? 'ok' : check.authorityStatus === 'unknown' ? 'warn' : 'bad',
    },
    {
      label: t(locale, 'brokers.stepBond'),
      value: check.bondOnFile === true ? t(locale, 'brokers.bondYes') : check.bondOnFile === false ? t(locale, 'brokers.bondNo') : t(locale, 'brokers.bondUnknown'),
      status: check.bondOnFile === true ? 'ok' : check.bondOnFile === false ? 'bad' : 'warn',
    },
    {
      label: t(locale, 'brokers.stepAge'),
      value: ageText,
      status: months === null ? 'info' : months < 3 ? 'bad' : months < 6 ? 'warn' : 'ok',
    },
  ]
  if (check.dotNumber) steps.push({ label: 'DOT', value: check.dotNumber, status: 'info' })
  if (check.phone) steps.push({ label: t(locale, 'brokers.stepPhone'), value: check.phone, status: 'info' })

  // Reveal one step at a time. From cache there's nothing to "run", so show it all.
  const [revealed, setRevealed] = useState(check.cached ? steps.length : 0)
  useEffect(() => {
    if (check.cached) return
    setRevealed(0)
    let i = 0
    const id = setInterval(() => {
      i += 1
      setRevealed(i)
      if (i >= steps.length) clearInterval(id)
    }, 420)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check])

  const hasBlock = check.flags.some((f) => f.level === 'block')

  return (
    <div className="mt-3">
      <ul className="flex flex-col gap-1">
        {steps.map((s, i) => {
          const done = i < revealed
          const checking = i === revealed
          if (i > revealed) return null
          return (
            <li
              key={s.label}
              className="flex items-center gap-2.5 rounded-lg border border-white/6 bg-white/[0.015] px-3 py-2 text-[13px]"
            >
              <span className={`w-4 shrink-0 text-center font-semibold ${done ? TONE[s.status] : 'text-haul-400'}`}>
                {done ? MARK[s.status] : '…'}
              </span>
              <span className="text-white/60">{s.label}</span>
              <span className={`ml-auto text-right font-medium ${done ? 'text-white/90' : 'animate-pulse text-haul-400'}`}>
                {done ? s.value : t(locale, 'brokers.checking')}
              </span>
            </li>
          )
        })}
      </ul>

      {revealed >= steps.length && (
        <>
          {check.address && <p className="mt-2 px-1 text-[12px] text-white/45">{check.address}</p>}
          {check.flags.length > 0 ? (
            <div className="mt-2.5">
              <p className={`text-[12px] font-medium ${hasBlock ? 'text-bad-400' : 'text-warn-400'}`}>
                {t(locale, 'brokers.verdictFlags')}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {check.flags.map((f, i) => (
                  <li
                    key={i}
                    className={`rounded-lg px-3 py-2 text-[13px] ${
                      f.level === 'block' ? 'bg-bad-500/12 text-bad-400' : 'bg-warn-400/12 text-warn-400'
                    }`}
                  >
                    {f.level === 'block' ? '⛔ ' : '⚠ '}
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2.5 rounded-lg bg-good-500/12 px-3 py-2 text-[13px] text-good-400">
              {t(locale, 'brokers.verdictClean')}
            </p>
          )}
        </>
      )}
    </div>
  )
}
