// Карта траков для брокеров (/track/<токен>): что можно отдать наружу.
//
// Одна ссылка на всех брокеров, без входа (Alex, 10/28/26: «где наши траки сейчас,
// куда едут, когда будут на месте — защищённое от утечек»). Поэтому всё, что
// уходит на страницу, собирается ЗДЕСЬ, из отдельных примитивов, а не обрезкой
// внутренних записей груза и трака: поле, добавленное в LoadRecord завтра, сюда само
// не попадёт. Белый список — тип BrokerTruck; тест проверяет, что ключей ровно столько.
//
// Чего нет и не будет: водитель (имя, телефон), номер трака и прицепа, ставка, RPM,
// брокер, Load ID, Rate Con, адреса складов, точный GPS, заметки.
//
// Чисто, без базы и сети: тестируется отдельно (lib/broker-map-core.test.ts).

/** Без 0/O, 1/l/I — ссылку иногда диктуют по телефону. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
/** 32 символа из 31 — около 158 бит: перебором не угадать. */
export const BROKER_TOKEN_LEN = 32
export const BROKER_TOKEN_RE = /^[a-z2-9]{32}$/

export function makeBrokerToken(bytes: Uint8Array): string {
  if (bytes.length < BROKER_TOKEN_LEN) throw new Error(`need ${BROKER_TOKEN_LEN} random bytes`)
  let s = ''
  for (let i = 0; i < BROKER_TOKEN_LEN; i++) s += ALPHABET[bytes[i]! % ALPHABET.length]
  return s
}

/** Шаг сетки огрубления, градусы: 0.15° ≈ 10 миль по широте. Точка трака
 * прилипает к узлу сетки — стоящий трак не «дрожит», а точного места не видно. */
export const FUZZ_DEG = 0.15

export function fuzz(lat: number, lng: number): { lat: number; lng: number } {
  const snap = (v: number) => Math.round(Math.round(v / FUZZ_DEG) * FUZZ_DEG * 1000) / 1000
  return { lat: snap(lat), lng: snap(lng) }
}

/** «Dallas, TX» из чего угодно: «1200 Main St, Dallas, TX 75201» → «Dallas, TX».
 * Не нашли город со штатом — null: лучше пусто, чем адрес склада наружу. */
export function cityState(s: string | null | undefined): string | null {
  // «12.0mi N from Ashland, VA» — строка места трака: город после «from».
  const text = (s ?? '').trim().replace(/^.*\bfrom\s+/i, '')
  if (!text) return null
  const all = [...text.matchAll(/([A-Za-z][A-Za-z .'-]{1,40}?),\s*([A-Za-z]{2})\b(?!\w)/g)]
  const m = all[all.length - 1]
  if (!m) return null
  const city = m[1]!.trim().replace(/\s+/g, ' ')
  // Улица затесалась в город («Main St, Dallas» уже отрезан запятой, но «Suite B Dallas» — нет).
  if (/\d/.test(city) || city.length < 2) return null
  return `${city}, ${m[2]!.toUpperCase()}`
}

/** Линия маршрута для чужих глаз: прорежена и огрублена до ~0.7 мили. */
export function roughPath(coords: [number, number][], maxPoints = 300): [number, number][] {
  if (!coords.length) return []
  const step = Math.max(1, Math.ceil(coords.length / maxPoints))
  const out: [number, number][] = []
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]!)
  const last = coords[coords.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  const r = (v: number) => Math.round(v * 100) / 100
  return out.map(([a, b]) => [r(a), r(b)] as [number, number])
}

/** ETA до четверти часа: минута в минуту мы не знаем, и делать вид не будем. */
export function roundEta(ms: number): number {
  const q = 15 * 60_000
  return Math.round(ms / q) * q
}

export type BrokerStatus = 'available' | 'to_pickup' | 'loaded'

/** Всё, что видит брокер про один трак. Ни одного поля сверх этого. */
export type BrokerTruck = {
  /** «Truck 3» — порядковый номер в парке, не номер трака. */
  n: number
  lat: number
  lng: number
  /** Ближайший город по огрублённой точке: «Ashland, VA». */
  near: string | null
  moving: boolean
  status: BrokerStatus
  from: string | null
  to: string | null
  /** «10/29/26 14:15 EDT» — по ET. */
  pickupEta: string | null
  deliveryEta: string | null
  milesLeft: number | null
  path: [number, number][]
}

export type BrokerMapView = {
  carrier: string
  /** Сколько минут назад пришёл самый свежий GPS. */
  gpsAgeMin: number | null
  trucks: BrokerTruck[]
}

/** Сборка строки строго по белому списку: на вход — только примитивы. */
export function brokerTruck(x: {
  n: number
  lat: number
  lng: number
  near: string | null
  moving: boolean
  status: BrokerStatus
  origin: string | null
  destination: string | null
  pickupEta: string | null
  deliveryEta: string | null
  milesLeft: number | null
  path: [number, number][]
}): BrokerTruck {
  const p = fuzz(x.lat, x.lng)
  const loaded = x.status !== 'available'
  return {
    n: x.n,
    lat: p.lat,
    lng: p.lng,
    near: cityState(x.near),
    moving: x.moving,
    status: x.status,
    from: loaded ? cityState(x.origin) : null,
    to: loaded ? cityState(x.destination) : null,
    pickupEta: x.status === 'to_pickup' ? x.pickupEta : null,
    deliveryEta: loaded ? x.deliveryEta : null,
    milesLeft: loaded && x.milesLeft != null ? Math.round(x.milesLeft / 10) * 10 : null,
    path: loaded ? roughPath(x.path) : [],
  }
}
