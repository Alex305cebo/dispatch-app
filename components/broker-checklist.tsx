'use client'

// The step-by-step vetting checklist. The FMCSA result arrives all at once, but the
// panel reveals each check in sequence — grouped into Authority / Insurance /
// Identity / Safety — so it reads as a live run-through of everything the API gives.

import { useEffect, useMemo, useState } from 'react'
import type { BrokerCheck, Authority } from '@/lib/fmcsa'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale, type MsgKey } from '@/lib/i18n'

type Status = 'ok' | 'warn' | 'bad' | 'info'
type Entry = { kind: 'header'; label: string } | { kind: 'row'; label: string; value: string; status: Status }

const MARK: Record<Status, string> = { ok: '✓', warn: '⚠', bad: '⛔', info: '·' }
const TONE: Record<Status, string> = {
  ok: 'text-good-400',
  warn: 'text-warn-400',
  bad: 'text-bad-400',
  info: 'text-white/45',
}

function monthsSince(date: string | null): number | null {
  if (!date) return null
  const d = new Date(date)
  if (isNaN(d.getTime())) return null
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

function authText(a: Authority, locale: Locale): string {
  return a === 'active'
    ? t(locale, 'brokers.statusActive')
    : a === 'inactive'
      ? t(locale, 'brokers.statusInactive')
      : a === 'none'
        ? t(locale, 'brokers.statusNone')
        : t(locale, 'brokers.statusUnknown')
}
const authTone = (a: Authority): Status => (a === 'active' ? 'ok' : a === 'unknown' ? 'info' : 'bad')
const usd = (thousands: number) => `$${(thousands * 1000).toLocaleString('en-US')}`

function buildEntries(c: BrokerCheck, locale: Locale): Entry[] {
  const e: Entry[] = []
  const row = (label: string, value: string, status: Status) => e.push({ kind: 'row', label, value, status })
  const header = (label: string) => e.push({ kind: 'header', label })
  const T = (k: MsgKey) => t(locale, k)

  // ── Authority & status ──
  header(T('brokers.secAuthority'))
  row(T('brokers.stepFound'), c.legalName ?? c.dbaName ?? '—', 'ok')
  row(T('brokers.rowOperating'), authText(c.operatingStatus, locale), authTone(c.operatingStatus))
  row(T('brokers.rowBrokerAuth'), authText(c.authorityStatus, locale), authTone(c.authorityStatus))
  row(T('brokers.rowCommonAuth'), authText(c.commonAuthority, locale), 'info')
  row(T('brokers.rowContractAuth'), authText(c.contractAuthority, locale), 'info')
  row(T('brokers.rowOos'), c.outOfService ? (c.oosDate ?? T('brokers.valYes')) : T('brokers.valNo'), c.outOfService ? 'bad' : 'ok')

  // ── Insurance & bond ──
  header(T('brokers.secInsurance'))
  const bondVal =
    c.bondOnFile === true && c.bondAmount != null
      ? `${usd(c.bondAmount)} ${T('brokers.onFile')}`
      : c.bondOnFile === false
        ? T('brokers.bondMissing')
        : c.bondRequired === false
          ? T('brokers.notRequired')
          : T('brokers.statusUnknown')
  row(T('brokers.rowBond'), bondVal, c.bondOnFile === true ? 'ok' : c.bondOnFile === false ? 'bad' : 'info')
  if (c.cargoOnFile != null)
    row(T('brokers.rowCargo'), c.cargoOnFile > 0 ? usd(c.cargoOnFile) : T('brokers.na'), 'info')
  if (c.bipdOnFile != null)
    row(T('brokers.rowBipd'), c.bipdOnFile > 0 ? usd(c.bipdOnFile) : T('brokers.na'), 'info')

  // ── Identity ──
  header(T('brokers.secIdentity'))
  if (c.dotNumber) row(T('brokers.rowDot'), c.dotNumber, 'info')
  if (c.ein) row(T('brokers.rowEin'), c.ein, 'info')
  if (c.dbaName && c.dbaName !== c.legalName) row(T('brokers.rowDba'), c.dbaName, 'info')
  if (c.operation) row(T('brokers.rowOperation'), c.operation, 'info')
  if (c.mcs150Current != null)
    row(T('brokers.rowMcs150'), c.mcs150Current ? T('brokers.valYes') : T('brokers.valNo'), c.mcs150Current ? 'ok' : 'warn')

  // ── Safety & fleet ──
  header(T('brokers.secSafety'))
  row(T('brokers.rowSafetyRating'), c.safetyRating ?? T('brokers.notRated'), c.safetyRating ? 'ok' : 'info')
  if (c.powerUnits != null) row(T('brokers.rowPowerUnits'), String(c.powerUnits), 'info')
  if (c.drivers != null) row(T('brokers.rowDrivers'), String(c.drivers), 'info')
  if (c.crashTotal != null) row(T('brokers.rowCrashes'), String(c.crashTotal), c.crashTotal > 0 ? 'warn' : 'ok')
  if (c.vehicleOosRate != null)
    row(
      T('brokers.rowVehicleOos'),
      `${c.vehicleOosRate}%${c.vehicleOosNational != null ? ` · ${T('brokers.vsNational').replace('{n}', String(c.vehicleOosNational))}` : ''}`,
      'info',
    )
  if (c.driverOosRate != null)
    row(
      T('brokers.rowDriverOos'),
      `${c.driverOosRate}%${c.driverOosNational != null ? ` · ${T('brokers.vsNational').replace('{n}', String(c.driverOosNational))}` : ''}`,
      'info',
    )

  // MC age rides in Authority if we resolved a grant date.
  const months = monthsSince(c.authorityGranted)
  if (months !== null) {
    e.splice(6, 0, {
      kind: 'row',
      label: t(locale, 'brokers.stepAge'),
      value: t(locale, 'brokers.ageMonths').replace('{months}', String(Math.round(months))),
      status: months < 3 ? 'bad' : months < 6 ? 'warn' : 'ok',
    })
  }

  return e
}

export function BrokerChecklist({ check }: { check: BrokerCheck }) {
  const locale = useLocale()
  const entries = useMemo(() => buildEntries(check, locale), [check, locale])
  const hasBlock = check.flags.some((f) => f.level === 'block')

  // Reveal one entry at a time. From cache there's nothing to "run", so show it all.
  const [revealed, setRevealed] = useState(check.cached ? entries.length : 0)
  useEffect(() => {
    if (check.cached) return
    setRevealed(0)
    let i = 0
    const id = setInterval(() => {
      i += 1
      setRevealed(i)
      if (i >= entries.length) clearInterval(id)
    }, 160)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check])

  return (
    <div className="mt-3">
      <div className="flex flex-col gap-1">
        {entries.map((en, i) => {
          if (i > revealed) return null
          if (en.kind === 'header')
            return (
              <p key={i} className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/40 first:mt-0">
                {en.label}
              </p>
            )
          const done = i < revealed
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-lg border border-white/6 bg-white/[0.015] px-3 py-1.5 text-[13px]"
            >
              <span className={`w-4 shrink-0 text-center font-semibold ${done ? TONE[en.status] : 'text-haul-400'}`}>
                {done ? MARK[en.status] : '…'}
              </span>
              <span className="text-white/60">{en.label}</span>
              <span className={`ml-auto text-right font-medium ${done ? 'text-white/90' : 'animate-pulse text-haul-400'}`}>
                {done ? en.value : t(locale, 'brokers.checking')}
              </span>
            </div>
          )
        })}
      </div>

      {revealed >= entries.length && (
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
