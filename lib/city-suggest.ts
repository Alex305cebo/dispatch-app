/**
 * Подсказки городов для полей «откуда / куда».
 *
 * Почему список, а не поиск по сети. Автодополнение по чужому геокодеру означало
 * бы запрос на каждое нажатие клавиши: у HERE это съело бы месячную квоту за
 * вечер, а Nominatim (наш бесплатный геокодер) в правилах использования прямо
 * запрещает автокомплит. Поэтому подсказки собираются из того, что уже есть:
 * города собственных грузов плюс короткий список крупных грузовых узлов США.
 * Ни одного обращения наружу, мгновенно и бесплатно навсегда.
 *
 * Своя история идёт первой не из вежливости: диспетчер ездит по одним и тем же
 * направлениям, и «Auburndale, FL» он наберёт снова, а в любом общем справочнике
 * городов такого размера просто нет.
 */

/** «EVANSVILLE, IN» и «Evansville, IN» — один город. Приводим к одному виду,
 * иначе в подсказках он будет стоять дважды. Штат остаётся заглавными. */
export function normalizeCity(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return ''
  const m = /^(.*),\s*([A-Za-z]{2})$/.exec(s)
  // Пробел ПЕРЕД запятой («Auburndale , FL») попадал в захват и оставался в
  // названии, из-за чего тот же город считался другим.
  const city = (m ? m[1]!.trim() : s)
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
  return m ? `${city}, ${m[2]!.toUpperCase()}` : city
}

/**
 * Крупные грузовые узлы США — на случай направления, которого в истории ещё нет.
 * Список намеренно короткий: это подсказка, а не справочник, и поле остаётся
 * обычным текстовым — вписать можно что угодно.
 */
const HUBS = [
  'Atlanta, GA', 'Chicago, IL', 'Dallas, TX', 'Fort Worth, TX', 'Houston, TX',
  'Los Angeles, CA', 'Long Beach, CA', 'Ontario, CA', 'Stockton, CA', 'Fresno, CA',
  'Sacramento, CA', 'Oakland, CA', 'San Bernardino, CA', 'Bakersfield, CA',
  'Phoenix, AZ', 'Tucson, AZ', 'Denver, CO', 'Salt Lake City, UT', 'Las Vegas, NV',
  'Reno, NV', 'Portland, OR', 'Seattle, WA', 'Spokane, WA', 'Boise, ID',
  'Albuquerque, NM', 'El Paso, TX', 'San Antonio, TX', 'Austin, TX', 'Laredo, TX',
  'Oklahoma City, OK', 'Tulsa, OK', 'Wichita, KS', 'Kansas City, MO', 'St. Louis, MO',
  'Springfield, MO', 'Omaha, NE', 'Des Moines, IA', 'Minneapolis, MN', 'Duluth, MN',
  'Milwaukee, WI', 'Green Bay, WI', 'Indianapolis, IN', 'Fort Wayne, IN', 'Evansville, IN',
  'Columbus, OH', 'Cleveland, OH', 'Cincinnati, OH', 'Toledo, OH', 'Detroit, MI',
  'Grand Rapids, MI', 'Louisville, KY', 'Lexington, KY', 'Nashville, TN', 'Memphis, TN',
  'Knoxville, TN', 'Chattanooga, TN', 'Birmingham, AL', 'Montgomery, AL', 'Mobile, AL',
  'Jackson, MS', 'New Orleans, LA', 'Baton Rouge, LA', 'Shreveport, LA', 'Little Rock, AR',
  'Charlotte, NC', 'Raleigh, NC', 'Greensboro, NC', 'Charleston, SC', 'Columbia, SC',
  'Greenville, SC', 'Savannah, GA', 'Macon, GA', 'Jacksonville, FL', 'Orlando, FL',
  'Tampa, FL', 'Miami, FL', 'Fort Lauderdale, FL', 'Lakeland, FL', 'Ocala, FL',
  'Richmond, VA', 'Norfolk, VA', 'Roanoke, VA', 'Baltimore, MD', 'Frederick, MD',
  'Washington, DC', 'Philadelphia, PA', 'Pittsburgh, PA', 'Harrisburg, PA', 'Allentown, PA',
  'Scranton, PA', 'Newark, NJ', 'Edison, NJ', 'New York, NY', 'Buffalo, NY',
  'Syracuse, NY', 'Albany, NY', 'Hartford, CT', 'Boston, MA', 'Worcester, MA',
  'Springfield, MA', 'Providence, RI', 'Portland, ME', 'Manchester, NH', 'Burlington, VT',
  'Charleston, WV', 'Wilmington, DE', 'Billings, MT', 'Casper, WY', 'Cheyenne, WY',
  'Sioux Falls, SD', 'Fargo, ND', 'Rapid City, SD', 'Amarillo, TX', 'Lubbock, TX',
  'Corpus Christi, TX', 'McAllen, TX', 'Tucson, AZ', 'Flagstaff, AZ', 'Grand Junction, CO',
] as const

/**
 * Итоговый список для подсказок: своя история впереди, дальше узлы, без повторов
 * и без пустых строк.
 */
export function citySuggestions(history: (string | null)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...history, ...HUBS]) {
    const city = normalizeCity(raw ?? '')
    if (!city) continue
    const key = city.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(city)
  }
  return out
}
