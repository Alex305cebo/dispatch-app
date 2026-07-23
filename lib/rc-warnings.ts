// Warnings surfaced from a parsed rate con — the things a dispatcher must check
// before committing a driver. Pure: keyword scan of the raw text + sanity checks
// on the parsed fields. Used on the truck page and the import page.

import type { RateConFields } from './ratecon'
import { t, type Locale, type MsgKey } from './i18n.ts'

export type RcWarning = { level: 'danger' | 'warn' | 'info'; text: string }

// [regex, level, dict key]. Order = display priority within a level. The dict key
// also doubles as the de-dup identity below (msgKey used to be the message text
// itself, before messages became locale-dependent).
const RULES: [RegExp, RcWarning['level'], MsgKey][] = [
  [/\bteam\b/i, 'danger', 'rcWarn.team'],
  [/\bhazmat|hazardous\b/i, 'danger', 'rcWarn.hazmat'],
  [/\breefer|temperature|keep frozen|continuous|\b-?\d{1,2}\s*°?\s*f\b/i, 'warn', 'rcWarn.reefer'],
  [/\bdetention\b/i, 'warn', 'rcWarn.detention'],
  [/\blumper\b/i, 'warn', 'rcWarn.lumper'],
  [/\btonu\b|truck order not used/i, 'warn', 'rcWarn.tonu'],
  [/\bappointment|appt\b|scheduled\b/i, 'warn', 'rcWarn.appointment'],
  [/\bfcfs|first come\b/i, 'info', 'rcWarn.fcfs'],
  [/\bdriver (assist|unload|load|touch)|hand (un)?load|lumper\b/i, 'warn', 'rcWarn.driverAssist'],
  [/\bpallet (exchange|jack)\b/i, 'info', 'rcWarn.palletExchange'],
  [/\bliftgate\b/i, 'info', 'rcWarn.liftgate'],
  [/\btarp|flatbed|step\s?deck\b/i, 'info', 'rcWarn.flatbed'],
  [/\bresidential\b/i, 'info', 'rcWarn.residential'],
  [/\b(charge\s?back|penalty|late fee|fine)\b/i, 'danger', 'rcWarn.penalty'],
  [/\bfcfs|scale ticket|weigh\b/i, 'info', 'rcWarn.scaleTicket'],
]

export function rcWarnings(fields: RateConFields, rawText: string, locale: Locale): RcWarning[] {
  const out: RcWarning[] = []
  const seen = new Set<string>()
  for (const [re, level, key] of RULES) {
    if (re.test(rawText) && !seen.has(key)) {
      seen.add(key)
      out.push({ level, text: t(locale, key) })
    }
  }

  // Field sanity — the fields the economics depend on.
  if (!fields.rate) out.push({ level: 'danger', text: t(locale, 'rcWarn.rateNotParsed') })
  if (!fields.loadedMiles) out.push({ level: 'warn', text: t(locale, 'rcWarn.milesNotParsed') })

  const miles = fields.loadedMiles?.value
  const rate = fields.rate?.value
  if (rate && miles && miles > 0) {
    const rpm = rate / miles
    const rpmStr = `$${rpm.toFixed(2)}`
    if (rpm < 1.5) out.push({ level: 'danger', text: t(locale, 'rcWarn.lowRate').replace('{rpm}', rpmStr) })
    else if (rpm < 2) out.push({ level: 'warn', text: t(locale, 'rcWarn.belowMarketRate').replace('{rpm}', rpmStr) })
  }

  const w = fields.weight?.value
  const lbs = w ? Number(w.replace(/[^\d.]/g, '')) : 0
  if (lbs > 44000) out.push({ level: 'warn', text: t(locale, 'rcWarn.heavyLoad').replace('{weight}', w!) })

  // danger → warn → info
  const order = { danger: 0, warn: 1, info: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level])
}
