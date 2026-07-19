// Warnings surfaced from a parsed rate con — the things a dispatcher must check
// before committing a driver. Pure: keyword scan of the raw text + sanity checks
// on the parsed fields. Used on the truck page and the import page.

import type { RateConFields } from './ratecon'

export type RcWarning = { level: 'danger' | 'warn' | 'info'; text: string }

// [regex, level, message]. Order = display priority within a level.
const RULES: [RegExp, RcWarning['level'], string][] = [
  [/\bteam\b/i, 'danger', 'Требуется team (два водителя) — проверь, потянет ли один.'],
  [/\bhazmat|hazardous\b/i, 'danger', 'Hazmat / опасный груз — нужен эндорсмент и допуск.'],
  [/\breefer|temperature|keep frozen|continuous|\b-?\d{1,2}\s*°?\s*f\b/i, 'warn', 'Рефрижератор / температурный режим — проверь настройку и pre-cool.'],
  [/\bdetention\b/i, 'warn', 'Указан detention — зафиксируй время in/out, уточни ставку ожидания.'],
  [/\blumper\b/i, 'warn', 'Lumper (платная разгрузка) — сохрани чек, добавь в инвойс возмещением.'],
  [/\btonu\b|truck order not used/i, 'warn', 'Есть условие TONU — если груз отменят, потребуй оплату за подачу.'],
  [/\bappointment|appt\b|scheduled\b/i, 'warn', 'Загрузка/выгрузка строго по записи (appointment) — опоздание = проблемы.'],
  [/\bfcfs|first come\b/i, 'info', 'FCFS (живая очередь) — заложи время на ожидание.'],
  [/\bdriver (assist|unload|load|touch)|hand (un)?load|lumper\b/i, 'warn', 'Возможна разгрузка/погрузка силами водителя — уточни заранее.'],
  [/\bpallet (exchange|jack)\b/i, 'info', 'Обмен паллет / pallet jack — уточни условия.'],
  [/\bliftgate\b/i, 'info', 'Нужен liftgate — проверь, есть ли на трейлере.'],
  [/\btarp|flatbed|step\s?deck\b/i, 'info', 'Флэтбед / тент (tarp) — проверь оснащение.'],
  [/\bresidential\b/i, 'info', 'Доставка в жилую зону (residential) — часто медленно и тесно.'],
  [/\b(charge\s?back|penalty|late fee|fine)\b/i, 'danger', 'В договоре есть штрафы/chargeback — прочитай условия внимательно.'],
  [/\bfcfs|scale ticket|weigh\b/i, 'info', 'Нужен scale ticket / взвешивание — не забудь.'],
]

export function rcWarnings(fields: RateConFields, rawText: string): RcWarning[] {
  const out: RcWarning[] = []
  const seen = new Set<string>()
  for (const [re, level, text] of RULES) {
    if (re.test(rawText) && !seen.has(text)) {
      seen.add(text)
      out.push({ level, text })
    }
  }

  // Field sanity — the fields the economics depend on.
  if (!fields.rate) out.push({ level: 'danger', text: 'Ставка не распозналась — впиши вручную, иначе расчёт неверный.' })
  if (!fields.loadedMiles) out.push({ level: 'warn', text: 'Мили не распознались — уточни («мили по карте» в грузе).' })

  const miles = fields.loadedMiles?.value
  const rate = fields.rate?.value
  if (rate && miles && miles > 0) {
    const rpm = rate / miles
    if (rpm < 1.5) out.push({ level: 'danger', text: `Низкая ставка: $${rpm.toFixed(2)}/милю — на грани убытка, проверь.` })
    else if (rpm < 2) out.push({ level: 'warn', text: `Ставка $${rpm.toFixed(2)}/милю — ниже рынка, взвесь.` })
  }

  const w = fields.weight?.value
  const lbs = w ? Number(w.replace(/[^\d.]/g, '')) : 0
  if (lbs > 44000) out.push({ level: 'warn', text: `Тяжёлый груз (${w}) — проверь развес по осям и scale.` })

  // danger → warn → info
  const order = { danger: 0, warn: 1, info: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level])
}
