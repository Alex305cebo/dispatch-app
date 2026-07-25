'use client'

// The step-by-step vetting checklist. The FMCSA result arrives all at once, but the
// panel reveals each check in sequence — grouped into Authority / Insurance /
// Identity / Safety — so it reads as a live run-through of everything the API gives.
// Up top, a safety meter fills to an overall 0–100 reliability score. Each section
// and the key fields carry an (i) explaining what it means.

import { useEffect, useMemo, useState } from 'react'
import type { BrokerCheck, Authority } from '@/lib/fmcsa'
import { Info } from '@/components/info'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale, type MsgKey } from '@/lib/i18n'

type Status = 'ok' | 'warn' | 'bad' | 'info'
type Row = { kind: 'row'; label: string; value: string; status: Status; info?: MsgKey }
type Entry = { kind: 'header'; label: string; info: MsgKey } | Row

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

/** 0–100 overall reliability. Any hard blocker drops it into the red; otherwise
 * start at 100 and dock for warnings, above-average OOS rates, and crashes. */
function safetyScore(c: BrokerCheck): number {
  const blocks = c.flags.filter((f) => f.level === 'block').length
  const warns = c.flags.filter((f) => f.level === 'warn').length
  if (blocks > 0) return Math.max(5, 22 - blocks * 6)
  let s = 100 - warns * 12
  if (c.driverOosRate != null && c.driverOosNational != null && c.driverOosRate > c.driverOosNational)
    s -= Math.min(15, c.driverOosRate - c.driverOosNational)
  if (c.vehicleOosRate != null && c.vehicleOosNational != null && c.vehicleOosRate > c.vehicleOosNational)
    s -= Math.min(15, c.vehicleOosRate - c.vehicleOosNational)
  if (c.crashTotal) s -= Math.min(15, c.crashTotal * 3)
  return Math.max(0, Math.min(100, Math.round(s)))
}

function SafetyMeter({ score }: { score: number }) {
  const locale = useLocale()
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setW(score), 60)
    return () => clearTimeout(id)
  }, [score])
  const zone = score >= 75 ? 'good' : score >= 45 ? 'warn' : 'bad'
  const bar = zone === 'good' ? 'bg-good-500' : zone === 'warn' ? 'bg-warn-400' : 'bg-bad-500'
  const tone = zone === 'good' ? 'text-good-400' : zone === 'warn' ? 'text-warn-400' : 'text-bad-400'
  const label = t(locale, zone === 'good' ? 'brokers.safe' : zone === 'warn' ? 'brokers.caution' : 'brokers.risky')
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
          {t(locale, 'brokers.safetyHeading')}
          <Info text={t(locale, 'brokers.safetyInfo')} />
        </span>
        <span className={`text-[13px] font-semibold ${tone}`}>
          {label} · {score}/100
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/8">
        <div className={`h-full rounded-full ${bar} transition-[width] duration-700 ease-out`} style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}

function buildEntries(c: BrokerCheck, locale: Locale): Entry[] {
  const e: Entry[] = []
  const row = (label: string, value: string, status: Status, info?: MsgKey) => e.push({ kind: 'row', label, value, status, info })
  const header = (label: string, info: MsgKey) => e.push({ kind: 'header', label, info })
  const T = (k: MsgKey) => t(locale, k)

  // ── Authority & status ──
  header(T('brokers.secAuthority'), 'brokers.secAuthorityInfo')
  row(T('brokers.stepFound'), c.legalName ?? c.dbaName ?? '—', 'ok')
  row(T('brokers.rowOperating'), authText(c.operatingStatus, locale), authTone(c.operatingStatus))
  row(T('brokers.rowBrokerAuth'), authText(c.authorityStatus, locale), authTone(c.authorityStatus), 'brokers.rowBrokerAuthInfo')
  row(T('brokers.rowCommonAuth'), authText(c.commonAuthority, locale), 'info', 'brokers.rowCarrierAuthInfo')
  row(T('brokers.rowContractAuth'), authText(c.contractAuthority, locale), 'info', 'brokers.rowCarrierAuthInfo')
  row(T('brokers.rowOos'), c.outOfService ? (c.oosDate ?? T('brokers.valYes')) : T('brokers.valNo'), c.outOfService ? 'bad' : 'ok', 'brokers.rowOosInfo')

  // ── Insurance & bond ──
  header(T('brokers.secInsurance'), 'brokers.secInsuranceInfo')
  const bondVal =
    c.bondOnFile === true && c.bondAmount != null
      ? `${usd(c.bondAmount)} ${T('brokers.onFile')}`
      : c.bondOnFile === false
        ? T('brokers.bondMissing')
        : c.bondRequired === false
          ? T('brokers.notRequired')
          : T('brokers.statusUnknown')
  row(T('brokers.rowBond'), bondVal, c.bondOnFile === true ? 'ok' : c.bondOnFile === false ? 'bad' : 'info', 'brokers.rowBondInfo')
  if (c.cargoOnFile != null) row(T('brokers.rowCargo'), c.cargoOnFile > 0 ? usd(c.cargoOnFile) : T('brokers.na'), 'info')
  if (c.bipdOnFile != null) row(T('brokers.rowBipd'), c.bipdOnFile > 0 ? usd(c.bipdOnFile) : T('brokers.na'), 'info')

  // ── Identity ──
  header(T('brokers.secIdentity'), 'brokers.secIdentityInfo')
  if (c.dotNumber) row(T('brokers.rowDot'), c.dotNumber, 'info', 'brokers.rowDotInfo')
  if (c.ein) row(T('brokers.rowEin'), c.ein, 'info', 'brokers.rowEinInfo')
  if (c.dbaName && c.dbaName !== c.legalName) row(T('brokers.rowDba'), c.dbaName, 'info')
  if (c.operation) row(T('brokers.rowOperation'), c.operation, 'info', 'brokers.rowOperationInfo')
  if (c.mcs150Current != null)
    row(T('brokers.rowMcs150'), c.mcs150Current ? T('brokers.valYes') : T('brokers.valNo'), c.mcs150Current ? 'ok' : 'warn', 'brokers.rowMcs150Info')

  // ── Safety & fleet ──
  header(T('brokers.secSafety'), 'brokers.secSafetyInfo')
  row(T('brokers.rowSafetyRating'), c.safetyRating ?? T('brokers.notRated'), c.safetyRating ? 'ok' : 'info', 'brokers.rowSafetyRatingInfo')
  if (c.powerUnits != null) row(T('brokers.rowPowerUnits'), String(c.powerUnits), 'info')
  if (c.drivers != null) row(T('brokers.rowDrivers'), String(c.drivers), 'info')
  if (c.crashTotal != null) row(T('brokers.rowCrashes'), String(c.crashTotal), c.crashTotal > 0 ? 'warn' : 'ok')
  if (c.vehicleOosRate != null)
    row(
      T('brokers.rowVehicleOos'),
      `${c.vehicleOosRate}%${c.vehicleOosNational != null ? ` · ${T('brokers.vsNational').replace('{n}', String(c.vehicleOosNational))}` : ''}`,
      'info',
      'brokers.rowVehicleOosInfo',
    )
  if (c.driverOosRate != null)
    row(
      T('brokers.rowDriverOos'),
      `${c.driverOosRate}%${c.driverOosNational != null ? ` · ${T('brokers.vsNational').replace('{n}', String(c.driverOosNational))}` : ''}`,
      'info',
      'brokers.rowDriverOosInfo',
    )

  // MC age rides in the Authority section when we resolved a grant date.
  const months = monthsSince(c.authorityGranted)
  if (months !== null)
    e.splice(6, 0, {
      kind: 'row',
      label: t(locale, 'brokers.stepAge'),
      value: t(locale, 'brokers.ageMonths').replace('{months}', String(Math.round(months))),
      status: months < 3 ? 'bad' : months < 6 ? 'warn' : 'ok',
    })

  return e
}

export function BrokerChecklist({ check }: { check: BrokerCheck }) {
  const locale = useLocale()
  const entries = useMemo(() => buildEntries(check, locale), [check, locale])
  const score = useMemo(() => safetyScore(check), [check])
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
      {/* The broker being checked, big and centered — the headline of the result. */}
      <div className="mb-3 text-center">
        <h3 className="text-[20px] font-semibold leading-tight sm:text-[23px]">
          {check.legalName ?? check.dbaName ?? '—'}
        </h3>
        {(check.mc || check.dotNumber) && (
          <p className="mt-1 text-[12px] tracking-wide text-white/45">
            {check.mc && `MC ${check.mc}`}
            {check.mc && check.dotNumber && ' · '}
            {check.dotNumber && `DOT ${check.dotNumber}`}
          </p>
        )}
      </div>

      <SafetyMeter score={score} />

      <div className="mt-3 flex flex-col gap-1">
        {entries.map((en, i) => {
          if (i > revealed) return null
          if (en.kind === 'header')
            return (
              <p key={i} className="mt-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/40 first:mt-0">
                {en.label}
                <Info text={t(locale, en.info)} />
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
              <span className="flex items-center gap-1 text-white/60">
                {en.label}
                {en.info && <Info text={t(locale, en.info)} />}
              </span>
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
