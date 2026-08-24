// Warnings surfaced from a parsed rate con — the things a dispatcher must check
// before committing a driver. Pure: keyword scan of the raw text + sanity checks
// on the parsed fields. Used on the truck page and the import page.
//
// Главное правило этого файла: СЛОВО НЕ ЕСТЬ ФАКТ.
//
// Рейт-коны — это таблицы, и заголовок столбца печатается вместе с ответом:
// «Hazmat: Non-Hazardous», «Pallet Exchange: None», «Temperature» с пустой клеткой.
// Первая версия искала одни слова и на грузе мебели поднимала красное «Hazmat —
// нужен эндорсмент», потому что в документе встретилось «Non-Hazardous». Ложная
// тревога хуже молчания: её пролистывают вместе с настоящими.
//
// Поэтому у правила есть окно вокруг найденного слова и список отрицаний. Правило
// срабатывает, только если ХОТЯ БЫ ОДНО вхождение не отменено соседним «No»,
// «None», «Non-», «N/A», «not required».

import type { RateConFields } from './ratecon'
import { t, type Locale, type MsgKey } from './i18n.ts'

export type RcWarning = { level: 'danger' | 'warn' | 'info'; text: string }

type Rule = {
  re: RegExp
  level: RcWarning['level']
  key: MsgKey
  /** Отменяет срабатывание, если найдено в окне вокруг слова. */
  deny?: RegExp
  /** Отменяет по ВСЕМУ документу. Нужно там, где заголовок столбца и ответ стоят
   * далеко друг от друга: «Hazmat» в шапке таблицы, «Non-Hazardous» строкой ниже —
   * в окно они не попадают, а смысл у них общий и однозначный. */
  docDeny?: RegExp
  /** Сильнее любого отрицания: явная улика, что признак ВСЁ-ТАКИ есть. */
  force?: RegExp
}

/** Общие отрицания: печатаются сразу после названия признака в клетке таблицы. */
const NEGATIVE = /\b(?:no|none|non|n\/a|not\s+required|not\s+applicable|false|нет)\b/i

/** Сколько символов вокруг найденного слова считаем его клеткой. Заголовок и ответ
 * в этих документах стоят рядом; шире окно — начнём ловить соседние клетки. */
const BEFORE = 24
const AFTER = 40

// Order = display priority within a level. The dict key also doubles as the de-dup
// identity below (msgKey used to be the message text itself, before messages became
// locale-dependent).
const RULES: Rule[] = [
  { re: /\bteam\b/i, level: 'danger', key: 'rcWarn.team', deny: NEGATIVE },
  {
    re: /\bhazmat|hazardous\b/i,
    level: 'danger',
    key: 'rcWarn.hazmat',
    // «Non-Hazardous» и «Hazmat: No» — это ЗАЯВЛЕНИЕ, ЧТО ГРУЗ ОБЫЧНЫЙ. Ровно на
    // этом сгорела мебель из TQL.
    deny: /\bnon[-\s]?hazard|\bnon[-\s]?hazmat|hazmat\s*[:\-]?\s*n(?:o|one)\b|hazardous\s*[:\-]?\s*n(?:o|one)\b|\bno\s+hazmat\b/i,
    // В таблице TQL «Hazmat» стоит заголовком столбца, а ответ «Non-Hazardous» —
    // строкой ниже: в окно вокруг слова он не попадает, поэтому смотрим весь текст.
    docDeny: /\bnon[-\s]?hazard|hazmat\s*[:\-]?\s*no\b|\bno\s+hazmat\b/i,
    // Улики настоящей опасности: номер ООН, класс, плакарды, прямое «Hazmat: Yes».
    force: /hazmat\s*[:\-]?\s*yes\b|\bun\s?\d{4}\b|placard|hazard class|\bclass\s*[1-9]\b|emergency response/i,
  },
  {
    // Пустой заголовок «Temperature» — не режим. Нужен либо холодильник словом,
    // либо настоящая уставка в градусах.
    re: /\breefer|keep frozen|continuous\b|\btemp(?:erature)?\s*[:\-]?\s*-?\d{1,3}\s*°?\s*f?\b|-?\d{1,2}\s*°\s*f\b/i,
    level: 'warn',
    key: 'rcWarn.reefer',
    deny: NEGATIVE,
    docDeny: /temperature\s*controlled\s*[:\-]?\s*no|dry\s*van(?![^]*reefer)/i,
    force: /reefer|keep frozen|pre-?cool|set\s*point|continuous\s*temp/i,
  },
  { re: /\bdetention\b/i, level: 'warn', key: 'rcWarn.detention' },
  { re: /\blumper\b/i, level: 'warn', key: 'rcWarn.lumper', deny: NEGATIVE },
  { re: /\btonu\b|truck order not used/i, level: 'warn', key: 'rcWarn.tonu' },
  { re: /\bappointment|appt\b|scheduled\b/i, level: 'warn', key: 'rcWarn.appointment', deny: NEGATIVE },
  { re: /\bfcfs|first come\b/i, level: 'info', key: 'rcWarn.fcfs' },
  {
    re: /\bdriver (?:assist|unload|load|touch)|hand (?:un)?load\b/i,
    level: 'warn',
    key: 'rcWarn.driverAssist',
    // «Driver Load/Unload: No» — водитель НЕ грузит. Это противоположность тревоге.
    deny: NEGATIVE,
  },
  { re: /\bpallet (?:exchange|jack)\b/i, level: 'info', key: 'rcWarn.palletExchange', deny: NEGATIVE },
  { re: /\bliftgate\b/i, level: 'info', key: 'rcWarn.liftgate', deny: NEGATIVE },
  { re: /\btarp|flatbed|step\s?deck\b/i, level: 'info', key: 'rcWarn.flatbed', deny: NEGATIVE },
  { re: /\bresidential\b/i, level: 'info', key: 'rcWarn.residential', deny: NEGATIVE },
  { re: /\b(?:charge\s?back|penalty|late fee|fine)\b/i, level: 'danger', key: 'rcWarn.penalty' },
  {
    // Раньше сюда затесался \bfcfs — и КАЖДЫЙ груз с живой очередью требовал
    // взвешивания, о котором в документе нет ни слова.
    re: /\bscale ticket|\bweigh(?:ed|ing)?\b|\bcat scale\b/i,
    level: 'info',
    key: 'rcWarn.scaleTicket',
    deny: NEGATIVE,
  },
]

/** Есть ли у слова хоть одно НЕотменённое вхождение. */
function affirmed(text: string, rule: Rule): boolean {
  // Улика перевешивает отрицание: документ может сначала напечатать «Hazmat: No» в
  // шапке шаблона, а ниже — номер ООН по факту груза.
  if (rule.force?.test(text)) return true
  if (rule.docDeny?.test(text)) return false
  if (!rule.deny) return rule.re.test(text)
  const flags = rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g'
  for (const m of text.matchAll(new RegExp(rule.re.source, flags))) {
    const at = m.index ?? 0
    const window = text.slice(Math.max(0, at - BEFORE), at + m[0].length + AFTER)
    if (!rule.deny.test(window)) return true
  }
  return false
}

export function rcWarnings(fields: RateConFields, rawText: string, locale: Locale): RcWarning[] {
  const out: RcWarning[] = []
  const seen = new Set<string>()
  for (const rule of RULES) {
    if (affirmed(rawText, rule) && !seen.has(rule.key)) {
      seen.add(rule.key)
      out.push({ level: rule.level, text: t(locale, rule.key) })
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
