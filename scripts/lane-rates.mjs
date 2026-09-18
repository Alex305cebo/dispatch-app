// Ставки по направлениям из бесплатных источников → таблица dat_lanes (source='warp').
//
// Источник: Warp (POST https://www.wearewarp.com/api/v1/ftl/quote) — открытый API без
// ключа: по паре ZIP отдаёт твёрдую цену за 53' Dry Van, которую можно забронировать.
// Это цена ГРУЗООТПРАВИТЕЛЯ, в ней маржа брокера: на 18 наших доставленных грузах она
// вышла выше того, что получил трак, в 1.2 раза по медиане (от 0.94 до 2.14). Поэтому
// строки лежат под своим источником, в «ставку DAT RateView» не попадают и показывать их
// можно только с подписью «Warp · цена грузоотправителя».
//
// Мили — только настоящие: из груза (loaded_miles) или из аргумента. Ничего не оцениваем
// и не пересчитываем (правило пользователя 16.09.2026).
//
//   node --env-file=.env.local scripts/lane-rates.mjs --loads 20      ← маршруты последних грузов
//   node --env-file=.env.local scripts/lane-rates.mjs --grid TN,CA    ← из этих штатов во все наши города
//   node --env-file=.env.local scripts/lane-rates.mjs --grid auto     ← где стоят и куда едут траки, если за неделю не собрано
//   node --env-file=.env.local scripts/lane-rates.mjs "37421>60616:571:Chattanooga, TN>Chicago, IL"
//
// В режиме сетки города берутся из наших же адресов (по одному на штат, самый частый), а
// мили считает открытый OSRM — настоящие дорожные, как в карточке груза.
//
// Запускать можно хоть каждый день: одно направление в день от источника — одна строка.
import mysql from 'mysql2/promise'
import { nextMonday, warpQuote, zipOfCity } from '../lib/warp-quote.ts'
import { WARP_MIN_MILES } from '../lib/rpm-bench-core.ts'

/** Сетка из штата считается свежей, если за столько дней по ней есть столько направлений. */
const FRESH_DAYS = 7
const FRESH_DESTS = 20
const args = process.argv.slice(2)
/** --max N — не больше стольких направлений за запуск (и миль считаем только для них). */
const max = Number(args[args.indexOf('--max') + 1]) || 50
/** --company demo — те же ставки для демо-компании: в демо тоже видно живой рынок. */
const company = args[args.indexOf('--company') + 1] === 'demo' ? 'demo' : 'default'
const url = process.env.DATABASE_URL
if (!url) {
  console.error('Нет DATABASE_URL (--env-file=.env.local)')
  process.exit(1)
}

/** Индекс — последние пять цифр адреса: «1741 Junction Ave., San Jose, CA 95112» → 95112. */
const zipOf = (s) => String(s ?? '').match(/\b(\d{5})\b(?!.*\b\d{5}\b)/)?.[1] ?? null
/** Штат — две буквы после последней запятой: «San Jose, CA» → CA. */
const stateOf = (s) => String(s ?? '').match(/,\s*([A-Za-z]{2})\s*$/)?.[1]?.toUpperCase() ?? null
const db = await mysql.createConnection(url)
await db.query('SET SESSION wait_timeout = 900')

/** Город с индексом, куда и откуда наш флот реально ездит: по одному на штат, чаще всего. */
async function hubs() {
  const [rows] = await db.query(
    `SELECT origin AS city, pickup_address AS addr FROM loads WHERE company_id = ? AND origin <> ''
     UNION ALL
     SELECT destination AS city, delivery_address AS addr FROM loads WHERE company_id = ? AND destination <> ''`,
    [company, company],
  )
  const byState = new Map()
  for (const r of rows) {
    const st = stateOf(r.city)
    if (!st) continue
    const list = byState.get(st) ?? new Map()
    // Индекс из адреса; нет его в адресе — «City, ST|», доберём по справочнику ниже.
    const key = `${r.city}|${zipOf(r.addr) ?? ''}`
    list.set(key, (list.get(key) ?? 0) + 1)
    byState.set(st, list)
  }
  const out = []
  for (const [st, list] of byState) {
    const [key] = [...list].sort((a, b) => b[1] - a[1])[0]
    const [city, addrZip] = key.split('|')
    const zip = addrZip || (await zipOfCity(city))
    if (zip) out.push({ state: st, city, zip })
  }
  return out
}

/** Настоящие мили по дорогам между городами — открытый OSRM (тот же, что у карточки груза). */
async function driveMiles(fromZip, toZip) {
  const at = async (zip) => {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`индекс ${zip}: HTTP ${res.status}`)
    const p = (await res.json()).places?.[0]
    return `${p.longitude},${p.latitude}`
  }
  const [a, b] = [await at(fromZip), await at(toZip)]
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a};${b}?overview=false`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`OSRM: HTTP ${res.status}`)
  const m = (await res.json())?.routes?.[0]?.distance
  if (!(m > 0)) throw new Error('OSRM: нет маршрута')
  return Math.round(m / 1609.344)
}

/** Маршруты: из аргументов «ZIP>ZIP:мили:Город, ST>Город, ST», сеткой или из последних грузов. */
async function lanes() {
  const explicit = args.filter((a) => a.includes('>'))
  if (explicit.length) {
    return explicit.map((a) => {
      const [pair, miles, names = ''] = a.split(':')
      const [oz, dz] = pair.split('>')
      const [origin = oz, dest = dz] = names.split('>')
      return { oz, dz, miles: Number(miles), origin, dest }
    })
  }
  // --grid ST,ST (или auto — где стоят траки и куда едут, без свежих): из этих штатов
  // во все остальные наши города. Мили — настоящие, по дорогам (OSRM), и один раз: дальше берутся из базы.
  const gridAt = args.indexOf('--grid')
  if (gridAt >= 0) {
    const arg = (args[gridAt + 1] ?? '').toUpperCase()
    let from = arg.split(',').filter(Boolean)
    if (arg === 'AUTO') {
      // Где траки стоят и куда едут: следующий груз ищут из штата выгрузки ещё в пути.
      const [live] = await db.query('SELECT DISTINCT location FROM fleet_status WHERE location <> ?', [''])
      const [going] = await db.query(
        `SELECT DISTINCT destination AS location FROM loads
          WHERE company_id = ? AND status IN ('booked', 'in_transit') AND destination <> ''`,
        [company],
      )
      from = [...new Set([...live, ...going].map((r) => stateOf(r.location)).filter(Boolean))]
      console.error(`штаты траков и выгрузок: ${from.join(', ') || '—'}`)
      // Штат, из которого сетка собрана на этой неделе, второй раз не гоняем: ставка за
      // неделю так не меняется, а чужой сервис бесплатный.
      const [fresh] = await db.query(
        `SELECT origin_state AS st FROM dat_lanes
          WHERE company_id = ? AND source = 'warp' AND seen_on >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          GROUP BY origin_state HAVING COUNT(DISTINCT dest_state) >= ?`,
        [company, FRESH_DAYS, FRESH_DESTS],
      )
      const skip = new Set(fresh.map((r) => r.st))
      from = from.filter((st) => !skip.has(st))
      console.error(`собираем из: ${from.join(', ') || '— (везде свежо)'}`)
    }
    const all = await hubs()
    const out = []
    for (const o of all.filter((h) => from.includes(h.state))) {
      for (const d of all) {
        // Дальше --max всё равно не пойдёт — мили лишних пар у чужого роутера не просим.
        if (out.length >= max) return out
        if (d.state === o.state) continue
        // Мили этой пары уже считали в прошлый раз — чужой роутер второй раз не трогаем.
        const [[hit]] = await db.query('SELECT miles FROM dat_lanes WHERE origin = ? AND dest = ? AND miles > 0 LIMIT 1', [o.city, d.city])
        let miles = hit?.miles
        if (!miles) {
          try {
            miles = await driveMiles(o.zip, d.zip)
          } catch (e) {
            console.error(`пропуск ${o.city} → ${d.city}: ${e.message}`)
            continue
          }
          await new Promise((r) => setTimeout(r, 1100)) // OSRM и zippopotam — не чаще раза в секунду
        }
        // Короткий прогон у Warp стоит почти как средний: цена ÷ мили давала $8–9/mi,
        // и эта цифра переносилась на весь коридор «штат → штат». Такие пары не берём.
        if (miles < WARP_MIN_MILES) {
          console.error(`пропуск ${o.city} → ${d.city}: ${miles} mi — короче ${WARP_MIN_MILES}`)
          continue
        }
        out.push({ oz: o.zip, dz: d.zip, miles, origin: `${o.city}`, dest: `${d.city}` })
      }
    }
    return out
  }
  const limit = Number(args[args.indexOf('--loads') + 1]) || 20
  const [rows] = await db.query(
    `SELECT origin, destination, loaded_miles, pickup_address, delivery_address
       FROM loads
      WHERE company_id = ? AND loaded_miles > 100 AND pickup_address <> '' AND delivery_address <> ''
      ORDER BY pickup_date DESC LIMIT ?`,
    [company, limit],
  )
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const oz = zipOf(r.pickup_address)
    const dz = zipOf(r.delivery_address)
    const key = `${oz}>${dz}`
    if (!oz || !dz || seen.has(key)) continue
    seen.add(key)
    out.push({ oz, dz, miles: Math.round(Number(r.loaded_miles)), origin: r.origin, dest: r.destination })
  }
  return out
}

const date = nextMonday()
let saved = 0
for (const l of (await lanes()).slice(0, max)) {
  if (!(l.miles > 0)) {
    console.error(`пропуск ${l.origin} → ${l.dest}: нет настоящих миль`)
    continue
  }
  if (l.miles < WARP_MIN_MILES) {
    console.error(`пропуск ${l.origin} → ${l.dest}: ${l.miles} mi — короче ${WARP_MIN_MILES}, это минимальная цена за подачу, а не ставка`)
    continue
  }
  let price
  try {
    price = await warpQuote(l.oz, l.dz, date)
  } catch (e) {
    console.error(`пропуск ${l.origin} → ${l.dest}: ${e.message}`)
    continue
  }
  const rate = Math.round(price)
  const rpm = rate / l.miles
  await db.query(
    `INSERT INTO dat_lanes
       (company_id, source, origin, dest, origin_state, dest_state, equipment, miles, spot_rate, spot_rpm, seen_on, seen_at)
     VALUES (?, 'warp', ?, ?, ?, ?, 'VAN', ?, ?, ?, CURDATE(), NOW(6))
     ON DUPLICATE KEY UPDATE miles = VALUES(miles), spot_rate = VALUES(spot_rate), spot_rpm = VALUES(spot_rpm), seen_at = NOW(6)`,
    [company, l.origin.slice(0, 120), l.dest.slice(0, 120), stateOf(l.origin), stateOf(l.dest), l.miles, rate, rpm],
  )
  saved++
  console.log(`${l.origin} → ${l.dest}`.padEnd(42), `${l.miles} mi`.padEnd(9), `$${rate}`.padEnd(8), `$${rpm.toFixed(2)}/mi`)
  await new Promise((r) => setTimeout(r, 700))
}
await db.end()
console.log(`сохранено направлений: ${saved} (источник warp, дата погрузки ${date})`)
