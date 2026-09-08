// Адрес для водителя без города — это не адрес.
//
// Часть рейт-конов печатает пункт столбиком: название, улица, а под ней голый
// индекс, без города и штата. Мы цитируем блок дословно (это правильно: так на
// бумаге), и в текст водителю уезжало «157 Starpointe Boulevard / 15021». По такому
// адресу не доехать и его не вбить в навигатор: улиц с таким названием в стране
// много, а индекс человек читать не обязан.
//
// Индекс при этом называет ровно одно место. Поэтому строку, в которой нет ничего,
// кроме индекса, дополняем городом и штатом: «Canonsburg, PA 15021». Сам индекс
// остаётся — по нему сверяют с бумагой.
//
// Модуль чистый: сеть и справочник индексов остаются снаружи, сюда приходит уже
// готовое соответствие. Так это можно проверить тестами.

/** Строка состоит только из индекса (и, может, пробелов). */
const ONLY_ZIP = /^\s*(\d{5})(?:-\d{4})?\s*$/

/** Есть ли в строке «Город, ST» — тогда дополнять нечего. */
const HAS_CITY_STATE = /[A-Za-z]{2,},\s*[A-Z]{2}\b/

/** Индексы, которым в тексте не хватает города. Их и надо разрешить. */
export function lonelyZips(text: string): string[] {
  const out: string[] = []
  for (const line of (text ?? '').split('\n')) {
    const m = ONLY_ZIP.exec(line)
    if (m && !HAS_CITY_STATE.test(line)) out.push(m[1]!)
  }
  return [...new Set(out)]
}

/**
 * Дописать город и штат к строкам, где стоит один индекс.
 *
 * `places` — соответствие «индекс → Город, ST». Чего в нём нет, то остаётся как
 * было: выдумывать город по неизвестному индексу нельзя, ошибка в адресе хуже,
 * чем его неполнота.
 */
export function withCities(text: string, places: Record<string, string>): string {
  return (text ?? '')
    .split('\n')
    .map((line) => {
      const m = ONLY_ZIP.exec(line)
      if (!m || HAS_CITY_STATE.test(line)) return line
      const place = places[m[1]!]
      return place ? line.replace(m[1]!, `${place} ${m[1]}`) : line
    })
    .join('\n')
}

/** Заголовок пункта в тексте водителю: «Pick up Address:», «Delivery Address:». */
const STOP_HEADER = /^\s*(pick\s?-?up|delivery|drop\s?-?off)\s+address\s*:?\s*$/i

/** Есть ли в строке улица — номер дома с буквами после него. */
const HAS_STREET = /\d+\s+[A-Za-z]/

/**
 * Полный адрес склада вместо одного города в тексте водителю.
 *
 * Рейт-кон без адресов даёт «Pick up Address: / Anahiem, CA», и это же уезжает
 * водителю, хотя адрес склада уже известен (лист водителя, ручная правка). Строка
 * пункта заменяется на «улица, Город, ST индекс», если у адреса нет города — он
 * берётся из груза. Строки, где улица уже есть, не трогаем.
 */
export function withAddresses(
  text: string,
  stops: {
    pickup?: string | null
    delivery?: string | null
    origin?: string | null
    destination?: string | null
  },
): string {
  const lines = (text ?? '').split('\n')
  const full = (addr: string, city: string | null | undefined) => {
    if (HAS_CITY_STATE.test(addr) || !city) return addr
    // «400 E Orangethorpe Ave, 92801» → «400 E Orangethorpe Ave, Anaheim, CA 92801»
    const m = /^(.*?),?\s*(\d{5}(?:-\d{4})?)\s*$/.exec(addr)
    return m ? `${m[1]}, ${city} ${m[2]}` : `${addr}, ${city}`
  }
  for (let i = 0; i < lines.length; i++) {
    const h = STOP_HEADER.exec(lines[i]!)
    if (!h) continue
    const isPickup = /pick/i.test(h[1]!)
    const addr = isPickup ? stops.pickup : stops.delivery
    if (!addr || !addr.trim()) continue
    // Первая непустая строка после заголовка — это и есть пункт.
    let j = i + 1
    while (j < lines.length && !lines[j]!.trim()) j++
    if (j >= lines.length || HAS_STREET.test(lines[j]!)) continue
    lines[j] = full(addr.trim(), isPickup ? stops.origin : stops.destination)
  }
  return lines.join('\n')
}

/**
 * Название склада из текста водителю: строка сразу под «Pick up Address:», если это
 * не улица (не начинается с номера дома) и не «Город, ST». В рейт-коне название
 * есть почти всегда (shipper/consignee), но отдельной колонки под него в базе нет —
 * оно живёт первой строкой блока пункта, откуда и читается.
 */
export function stopNames(text: string | null | undefined): {
  pickup: string | null
  delivery: string | null
} {
  const out = {
    pickup: null as string | null,
    delivery: null as string | null,
  }
  const lines = (text ?? '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const h = STOP_HEADER.exec(lines[i]!)
    if (!h) continue
    let j = i + 1
    while (j < lines.length && !lines[j]!.trim()) j++
    const line = lines[j]?.trim() ?? ''
    if (!line || line === '—' || /^\d/.test(line) || HAS_CITY_STATE.test(line) || /^(time|ref)\s*:/i.test(line))
      continue
    if (/pick/i.test(h[1]!)) out.pickup = line
    else out.delivery = line
  }
  return out
}

/** Есть ли в тексте водителю хоть одна улица (номер дома + название). */
export function hasStreets(text: string | null | undefined): boolean {
  return (text ?? '').split('\n').some((l) => HAS_STREET.test(l))
}
