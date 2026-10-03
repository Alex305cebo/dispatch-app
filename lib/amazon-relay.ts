// Раздел «Amazon» (10/03/26): рейсы Amazon Relay. Диспетчер копирует рейс со страницы
// Relay и вставляет текст в TMS — открытого API для перевозчика у Relay нет, а ходить
// туда роботом под чужим логином — риск блокировки аккаунта. Поэтому разбор терпимый:
// берём то, что узнаём (VRID, тур, коды складов Amazon, время, деньги, мили, трейлер),
// а всё остальное диспетчер правит в форме до сохранения.
//
// Чисто, без базы — см. amazon-relay.test.ts.

export type AmazonStop = {
  /** Код склада Amazon: ONT8, MDW2, KRB1… */
  code: string | null
  /** «Moreno Valley, CA» — если рядом с кодом был город. */
  city: string | null
  /** yyyy-mm-dd */
  date: string | null
  /** HH:MM, 24 часа, как напечатано (пояс — в tz). */
  time: string | null
  tz: string | null
}

export type TrailerOwner = 'amazon' | 'own'
export type LoadKind = 'drop' | 'live'

export type AmazonTripDraft = {
  vrid: string | null
  tourId: string | null
  stops: AmazonStop[]
  rate: number | null
  miles: number | null
  trailerNo: string | null
  trailerOwner: TrailerOwner | null
  loadKind: LoadKind | null
}

export const AMAZON_STATUSES = ['booked', 'in_transit', 'delivered', 'cancelled'] as const
export type AmazonStatus = (typeof AMAZON_STATUSES)[number]

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const TZ = '(?:\\s*\\(?\\b(ET|EST|EDT|CT|CST|CDT|MT|MST|MDT|PT|PST|PDT|AKST|AKDT|HST|UTC)\\b\\)?)?'
const CLOCK = '(\\d{1,2}):(\\d{2})\\s*([AaPp][Mm])?'

const pad = (n: number) => String(n).padStart(2, '0')

function clock(h: string, m: string, ampm: string | undefined): string | null {
  let hh = Number(h)
  const mm = Number(m)
  if (mm > 59) return null
  if (ampm) {
    if (hh < 1 || hh > 12) return null
    const pm = ampm.toLowerCase() === 'pm'
    if (hh === 12) hh = pm ? 12 : 0
    else if (pm) hh += 12
  }
  if (hh > 23) return null
  return `${pad(hh)}:${pad(mm)}`
}

/** Год для даты без года: ближайший к сегодня (в декабре «Jan 3» — это следующий год). */
function guessYear(month: number, today: string): number {
  const [y, m] = today.split('-').map(Number) as [number, number]
  if (month - m > 6) return y - 1
  if (m - month > 6) return y + 1
  return y
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y)

type Found = { date: string | null; time: string | null; tz: string | null; index: number }

/** Все даты/время в строке по порядку. Понимает «Oct 6, 14:30 PDT», «Mon 10/06 2:30 PM»,
 * «10/06/2026 14:30», «2026-10-06 14:30» и голое «14:30 CDT». */
export function findDateTimes(line: string, today: string): Found[] {
  const out: Found[] = []
  const taken: [number, number][] = []
  const free = (a: number, b: number) => !taken.some(([x, y]) => a < y && b > x)
  const push = (m: RegExpExecArray, date: string | null, time: string | null, tz: string | undefined) => {
    if (!free(m.index, m.index + m[0].length)) return
    taken.push([m.index, m.index + m[0].length])
    out.push({ date, time, tz: tz ? tz.toUpperCase() : null, index: m.index })
  }
  const okDate = (y: number, mo: number, d: number) =>
    mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(mo)}-${pad(d)}` : null

  // 2026-10-06 14:30
  for (const m of line.matchAll(new RegExp(`\\b(\\d{4})-(\\d{2})-(\\d{2})(?:[T\\s,]+${CLOCK})?${TZ}`, 'g'))) {
    const date = okDate(Number(m[1]), Number(m[2]), Number(m[3]))
    if (date) push(m, date, m[4] ? clock(m[4], m[5]!, m[6]) : null, m[7])
  }
  // 10/06/2026 14:30 · 10/06 2:30 PM
  for (const m of line.matchAll(new RegExp(`\\b(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?(?:[\\s,]+${CLOCK})?${TZ}`, 'g'))) {
    const mo = Number(m[1])
    const y = m[3] ? fullYear(Number(m[3])) : guessYear(mo, today)
    const date = okDate(y, mo, Number(m[2]))
    if (date) push(m, date, m[4] ? clock(m[4], m[5]!, m[6]) : null, m[7])
  }
  // Oct 6, 2026 14:30 · Oct 06 2:30 PM
  for (const m of line.matchAll(
    new RegExp(`\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?:[\\s,@-]+${CLOCK})?${TZ}`, 'gi'),
  )) {
    const mo = MONTHS[m[1]!.toLowerCase()]!
    const y = m[3] ? Number(m[3]) : guessYear(mo, today)
    const date = okDate(y, mo, Number(m[2]))
    if (date) push(m, date, m[4] ? clock(m[4], m[5]!, m[6]) : null, m[7])
  }
  // Голое время
  for (const m of line.matchAll(new RegExp(`(?<![\\d/:])${CLOCK}${TZ}`, 'g'))) {
    const time = clock(m[1]!, m[2]!, m[3])
    if (time) push(m, null, time, m[4])
  }
  return out.sort((a, b) => a.index - b.index)
}

// Код склада Amazon: три буквы и цифра, иногда ещё буква или цифра (ONT8, MDW2, DFW6,
// HGR6, SBD1, XLX7, DCK6, VUX1). Слова-исключения — то, что в тексте рейса выглядит так
// же, но складом не является.
const FACILITY_RE = /\b([A-Z]{3}\d[A-Z0-9]?)\b/g
const NOT_FACILITY = new Set(['UTC0'])

const CITY_RE = /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}),\s*([A-Z]{2})\b(?:\s+\d{5})?/
// Подписи перед городом, которые регулярка иначе приклеит к названию.
const LABEL_WORDS = /^(?:pick\s*up|pickup|deliver(?:y)?|drop(?:\s*off)?|origin|destination|stop|from|to|load|unload|arrive|depart)$/i

function cityOf(line: string): string | null {
  const m = CITY_RE.exec(line)
  if (!m) return null
  const words = m[1]!.split(/\s+/)
  while (words.length > 1 && LABEL_WORDS.test(words[0]!)) words.shift()
  if (LABEL_WORDS.test(words[0]!)) return null
  return `${words.join(' ')}, ${m[2]}`
}

/** «$1,234.56» без «/mi» после — деньги рейса; берём самую большую сумму. */
function findRate(text: string): number | null {
  let best: number | null = null
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?!\d)(\s*(?:\/|per\s+)\s*mi)?/gi)) {
    if (m[3]) continue
    const v = Number(m[1]!.replace(/,/g, '') + (m[2] ?? ''))
    if (Number.isFinite(v) && v > 0 && (best == null || v > best)) best = v
  }
  return best
}

/** «512 mi», «1,203.4 miles» — самое большое: у тура есть и мили этапов, и общие. */
function findMiles(text: string): number | null {
  let best: number | null = null
  for (const m of text.matchAll(/(?<![$/\d.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(?:mi|miles|mile)\b/gi)) {
    const v = Number(m[1]!.replace(/,/g, '') + (m[2] ?? ''))
    if (Number.isFinite(v) && v > 0 && (best == null || v > best)) best = v
  }
  return best
}

/** Разобрать вставленный текст рейса. `today` — сегодня по ET, yyyy-mm-dd (год для дат без года). */
export function parseRelayText(raw: string, today: string): AmazonTripDraft {
  const text = raw.replace(/\r/g, '').replace(/ /g, ' ')

  const tourLabeled = /\b(?:tour|block)(?:\s*id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i.exec(text)?.[1]
  const tourId = (tourLabeled && /\d/.test(tourLabeled) ? tourLabeled : /\bT-[A-Z0-9]{6,}\b/.exec(text)?.[0]) ?? null

  let vrid = /\b(?:vrid|load\s*id|trip\s*id|vr\s*id)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i.exec(text)?.[1] ?? null
  if (vrid && !/\d/.test(vrid)) vrid = null
  if (!vrid) {
    // Без подписи: 8–10 знаков, есть и буквы, и цифры, не код склада и не тур.
    for (const m of text.matchAll(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,10}\b/g)) {
      if (m[0] !== tourId && !tourId?.endsWith(m[0])) {
        vrid = m[0]
        break
      }
    }
  }

  const ids = new Set([vrid, tourId].filter(Boolean) as string[])
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const stops: AmazonStop[] = []
  let cur: AmazonStop | null = null
  /** Остановки из последней строки с кодами: время со следующих строк — первой без времени. */
  let group: AmazonStop[] = []
  let carry = 0
  for (const line of lines) {
    const codes = [...line.matchAll(FACILITY_RE)]
      .map((m) => m[1]!)
      .filter((c) => !NOT_FACILITY.has(c) && ![...ids].some((id) => id.includes(c)))
    const times = findDateTimes(line, today)
    if (codes.length) {
      // «ONT8 → MDW2» в одной строке — две остановки; время раздаём по порядку.
      group = []
      for (const [i, code] of codes.entries()) {
        if (cur && cur.code === code) continue
        cur = { code, city: null, date: null, time: null, tz: null }
        stops.push(cur)
        group.push(cur)
        const dt = times[i] ?? (codes.length === 1 ? times[0] : undefined)
        if (dt) Object.assign(cur, { date: dt.date, time: dt.time, tz: dt.tz })
      }
      const city = cityOf(line)
      if (city && codes.length === 1) cur!.city = city
      carry = 3
      continue
    }
    if (!cur || carry <= 0) continue
    carry--
    if (!cur.city && group.length === 1) cur.city = cityOf(line)
    const target = group.find((s) => !s.time) ?? (cur.date ? null : cur)
    if (target && times[0]) {
      target.date = target.date ?? times[0].date
      target.time = target.time ?? times[0].time
      target.tz = target.tz ?? times[0].tz
    }
  }

  // Складов нет вовсе — хотя бы города по порядку.
  if (!stops.length) {
    for (const line of lines) {
      const city = cityOf(line)
      if (!city) continue
      const dt = findDateTimes(line, today)[0]
      stops.push({ code: null, city, date: dt?.date ?? null, time: dt?.time ?? null, tz: dt?.tz ?? null })
    }
  }

  const trailerOwner: TrailerOwner | null = /power[\s-]*only|amazon[\s-]*(?:provided\s+)?trailer/i.test(text)
    ? 'amazon'
    : null
  const loadKind: LoadKind | null = /drop\s*(?:&|and|\/|-)?\s*hook|\bpre-?loaded\b/i.test(text)
    ? 'drop'
    : /\blive\s*(?:load|unload)/i.test(text)
      ? 'live'
      : null
  const trailerM = /\btrailer\s*(?:id|#|number|no\.?)\s*[:#]?\s*([A-Z0-9-]{3,})/i.exec(text)
  const trailerNo = trailerM && /\d/.test(trailerM[1]!) ? trailerM[1]! : null

  return {
    vrid,
    tourId,
    stops,
    rate: findRate(text),
    miles: findMiles(text),
    trailerNo,
    trailerOwner,
    loadKind,
  }
}

/** Ставка за милю с двумя знаками; null, если миль нет. */
export function tripRpm(rate: number | null, miles: number | null): number | null {
  if (!rate || !miles || miles <= 0) return null
  return Math.round((rate / miles) * 100) / 100
}

/** Остановки из JSON-колонки: всё, что не похоже на остановку, отбрасываем. */
export function stopsFromJson(raw: unknown): AmazonStop[] {
  let v = raw
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return []
    }
  }
  if (!Array.isArray(v)) return []
  const s = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 80) : null)
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ code: s(x.code)?.toUpperCase() ?? null, city: s(x.city), date: s(x.date), time: s(x.time), tz: s(x.tz) }))
    .filter((x) => x.code || x.city)
    .slice(0, 20)
}

/** Подпись остановки: «ONT8 · Moreno Valley, CA». */
export function stopLabel(s: AmazonStop): string {
  return [s.code, s.city].filter(Boolean).join(' · ')
}
