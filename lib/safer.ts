// Поиск компании в SAFER — публичной части реестра FMCSA, БЕЗ ключа.
//
// Почему не QCMobile, куда ходит остальное приложение: у него ключевой поиск по
// названию просто не находит брокеров. Проверено на живых именах из наших грузов —
// Molo Solutions, Allen Lund, Landstar Ranger, Cura Freight: ключ есть, запрос
// уходит, ответ пустой. SAFER на те же имена отвечает сразу и отдаёт и MC, и
// телефон, и адрес: «MOLO SOLUTIONS LLC → USDOT 3000394, MC-23783, (847) 306-3557»,
// и этот телефон совпадает с тем, что стоит у нас в грузах.
//
// ponytail: это разбор HTML, а не API — у SAFER открытого JSON нет. Разметку там не
// меняли годами, но если сломается, поломка будет тихой: ничего не найдётся. Поэтому
// разбор вынесен в чистые функции и накрыт тестами на настоящих кусках страницы —
// сломается разметка, упадут тесты, а не подбор молча.

/** Что нашлось по названию. Больше в списке SAFER ничего и нет. */
export type SaferHit = { dot: string; legalName: string }

/** Карточка компании. Пустые поля — норма: SAFER показывает не всё и не всем. */
export type SaferCompany = {
  dot: string
  mc: string | null
  legalName: string | null
  dbaName: string | null
  phone: string | null
  address: string | null
  /** «CARRIER/SHIPPER/BROKER» — брокер это или перевозчик, или и то и другое. */
  entityType: string | null
  /** Строка как на странице: «AUTHORIZED FOR Property», «NOT AUTHORIZED», «OUT OF SERVICE». */
  operatingStatus: string | null
}

const UA = 'Mozilla/5.0 (compatible; DispatchApp/1.0)'

/** Чужая служба не должна держать наш запрос: 10 секунд и дальше без неё. */
async function get(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

/** Разобрать страницу поиска по названию. Каждая находка — ссылка на карточку, в
 * которой уже лежат и номер DOT, и имя, как оно записано в реестре. */
export function parseSaferSearch(html: string): SaferHit[] {
  const out: SaferHit[] = []
  const seen = new Set<string>()
  const re = /query_string=(\d+)&original_query_string=([^"']+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const dot = m[1]!
    if (seen.has(dot)) continue
    seen.add(dot)
    out.push({ dot, legalName: decode(m[2]!).trim() })
  }
  return out
}

/** Текст страницы без разметки: значение всегда идёт следующей строкой после подписи. */
function textLines(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|td|th|p|div|table)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .split('\n')
    .map((l) => decode(l).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/%20/g, ' ')
}

/** Значение под подписью: сама подпись, потом первая непустая строка после неё. */
function after(lines: string[], label: string): string | null {
  const i = lines.findIndex((l) => l.toLowerCase().startsWith(label.toLowerCase()))
  if (i < 0) return null
  // Иногда подпись и значение оказываются в одной ячейке — тогда режем по двоеточию.
  const own = lines[i]!.slice(label.length).replace(/^[:\s]+/, '').trim()
  if (own) return own
  // Пустое поле не должно съедать следующий заголовок: у «DBA Name:» значения часто
  // нет вовсе, и без этой проверки в имя компании попадало «Physical Address:».
  const next = lines[i + 1]?.trim()
  return next && !next.endsWith(':') ? next : null
}

/** Значение из НЕСКОЛЬКИХ строк после подписи — до следующей подписи-«...:». */
function afterBlock(lines: string[], label: string): string | null {
  const i = lines.findIndex((l) => l.toLowerCase().startsWith(label.toLowerCase()))
  if (i < 0) return null
  const parts: string[] = []
  const own = lines[i]!.slice(label.length).replace(/^[:\s]+/, '').trim()
  if (own) parts.push(own)
  for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
    const l = lines[j]!.trim()
    if (!l || l.endsWith(':')) break
    parts.push(l)
  }
  return parts.length ? parts.join(', ') : null
}

export function parseSaferSnapshot(html: string, dot: string): SaferCompany | null {
  const lines = textLines(html)
  if (lines.length === 0) return null

  // «MC-23783» — номер может стоять с префиксом MC/MX/FF; берём именно MC.
  const mcLine = after(lines, 'MC/MX/FF Number(s):')
  // Запасной ход: у части записей (RXO, England Logistics) номер лежит не в
  // строке под подписью, а дальше по странице — берём первый MC-… откуда угодно.
  const mc =
    /MC-?(\d{3,8})/i.exec(mcLine ?? '')?.[1] ??
    /MC-(\d{3,8})/.exec(lines.join(' '))?.[1] ??
    null

  const legalName = after(lines, 'Legal Name:')
  const dba = after(lines, 'DBA Name:')
  const phone = after(lines, 'Phone:')
  // Адрес двухстрочный: улица, под ней «ATLANTA, GA 30346-2304». after() берёт
  // одну строку — город со штатом терялись, а по штату выбирается компания среди
  // однофамильцев. Собираем строки до следующей подписи (максимум три).
  const address = afterBlock(lines, 'Physical Address:')
  const entityType = after(lines, 'Entity Type:')
  const operatingStatus = after(lines, 'Operating Status:')

  // Страница «записей не найдено» разбирается во всё то же самое, только пустое.
  if (!legalName && !mc) return null

  return {
    dot,
    mc,
    legalName: legalName || null,
    dbaName: dba && dba !== '' ? dba : null,
    phone: phone || null,
    address: address || null,
    entityType: entityType || null,
    operatingStatus: operatingStatus || null,
  }
}

/** Найти компании по названию. Поиск в SAFER идёт по началу строки, поэтому звёздочка
 * в конце обязательна: без неё «MOLO SOLUTIONS» не найдёт «MOLO SOLUTIONS LLC». */
export async function saferSearch(name: string): Promise<SaferHit[]> {
  const q = encodeURIComponent(name.trim().toUpperCase()) + '*'
  const html = await get(`https://safer.fmcsa.dot.gov/keywordx.asp?searchstring=${q}&SEARCHTYPE=`)
  return html ? parseSaferSearch(html) : []
}

export async function saferSnapshot(dot: string): Promise<SaferCompany | null> {
  const html = await get(
    `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&original_query_param=NAME&query_string=${encodeURIComponent(dot)}`,
  )
  return html ? parseSaferSnapshot(html, dot) : null
}

/** Карточка по номеру MC — тем же запросом, что и по DOT, только другим ключом.
 * Нужна, когда номер уже известен, а данные компании — ещё нет. */
export async function saferByMc(mc: string): Promise<SaferCompany | null> {
  const html = await get(
    `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&original_query_param=NAME&query_string=${encodeURIComponent(mc)}`,
  )
  if (!html) return null
  // Номер DOT в ответе свой — вытаскиваем его со страницы, а не подставляем чужой.
  const dot = /USDOT Number:?\s*<\/th>\s*<td[^>]*>\s*(\d+)/i.exec(html)?.[1] ?? ''
  return parseSaferSnapshot(html, dot)
}
