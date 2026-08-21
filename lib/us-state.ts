/**
 * Штат по координатам — офлайн, по границам штатов.
 *
 * Зачем вообще: строку места нам даёт ELD-вендор, и она называет БЛИЖАЙШИЙ ему
 * известный город вместе с ЕГО штатом. Под Тонопой (Невада) это выглядело как
 * «98.0mi ENE from Mammoth lakes, CA» — до города 98 миль, и штат в строке чужой.
 * Диспетчер читает «CA», а трак стоит в Неваде: по этому штату он называет
 * брокеру пикап, считает разрешения и топливный налог.
 *
 * Границы лежат в репозитории (lib/data/us-states.ts, 70 КБ, обводы Бюро
 * переписи США — общественное достояние). Ни ключа, ни запроса наружу: место
 * трака обновляется каждые несколько минут у каждой машины, и геокодер на этом
 * либо стоил бы денег, либо упёрся в лимит.
 *
 * Точность — уровня обзорной карты: у самой линии границы (в пределах мили-двух)
 * ответ может разойтись с истиной. Это на два порядка лучше ошибки в 98 миль,
 * ради которой всё и делалось.
 */

import SHAPES from './data/us-states.ts'

const ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA',
  Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Puerto Rico': 'PR', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX',
  Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
}

type Ring = [number, number][]
/** Один контур штата со своей рамкой. Рамка — весь смысл индекса: 90% штатов
 * отсеиваются четырьмя сравнениями, до тяжёлой проверки дело не доходит. */
type Piece = { abbr: string; minLng: number; minLat: number; maxLng: number; maxLat: number; rings: Ring[] }

let index: Piece[] | null = null

function build(): Piece[] {
  const out: Piece[] = []
  for (const f of SHAPES) {
    const abbr = ABBR[f.name]
    if (!abbr) continue
    const polys = f.type === 'Polygon' ? [f.coordinates as Ring[]] : (f.coordinates as Ring[][])
    for (const rings of polys) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
      for (const [lng, lat] of rings[0]!) {
        if (lng < minLng) minLng = lng
        if (lat < minLat) minLat = lat
        if (lng > maxLng) maxLng = lng
        if (lat > maxLat) maxLat = lat
      }
      out.push({ abbr, minLng, minLat, maxLng, maxLat, rings })
    }
  }
  return out
}

/** Луч вправо, чётность пересечений. Дырки (озёра, анклавы) считаются тем же
 * проходом: нечётное число пересечений и есть «внутри» при любом их количестве. */
function inside(lat: number, lng: number, rings: Ring[]): boolean {
  let hit = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!
      const [xj, yj] = ring[j]!
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit
    }
  }
  return hit
}

/** Двухбуквенный код штата или null — вне США, в океане, либо координат нет. */
export function stateOf(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  index ??= build()
  for (const p of index) {
    if (lng < p.minLng || lng > p.maxLng || lat < p.minLat || lat > p.maxLat) continue
    if (inside(lat, lng, p.rings)) return p.abbr
  }
  return null
}
