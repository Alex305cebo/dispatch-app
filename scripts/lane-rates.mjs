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
//   node --env-file=.env.local scripts/lane-rates.mjs --loads 20
//   node --env-file=.env.local scripts/lane-rates.mjs "37421>60616:571:Chattanooga, TN>Chicago, IL"
//
// Запускать можно хоть каждый день: одно направление в день от источника — одна строка.
import mysql from 'mysql2/promise'

const QUOTE = 'https://www.wearewarp.com/api/v1/ftl/quote'
const args = process.argv.slice(2)
const url = process.env.DATABASE_URL
if (!url) {
  console.error('Нет DATABASE_URL (--env-file=.env.local)')
  process.exit(1)
}

/** Индекс — последние пять цифр адреса: «1741 Junction Ave., San Jose, CA 95112» → 95112. */
const zipOf = (s) => String(s ?? '').match(/\b(\d{5})\b(?!.*\b\d{5}\b)/)?.[1] ?? null
/** Штат — две буквы после последней запятой: «San Jose, CA» → CA. */
const stateOf = (s) => String(s ?? '').match(/,\s*([A-Za-z]{2})\s*$/)?.[1]?.toUpperCase() ?? null
/** Понедельник следующей недели: котировка на рабочий день, а не на «сегодня поздно». */
const pickupDate = () => {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

async function quote(originZip, destZip, date) {
  const res = await fetch(QUOTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      origin_zip: originZip,
      destination_zip: destZip,
      pickup_date: date,
      pallets: 24,
      weight_lbs_per_pallet: 1600,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = await res.json()
  const price = Number(j?.price_usd)
  if (!(price > 0)) throw new Error(String(j?.error ?? 'нет цены'))
  return price
}

const db = await mysql.createConnection(url)
await db.query('SET SESSION wait_timeout = 900')

/** Маршруты: из аргументов «ZIP>ZIP:мили:Город, ST>Город, ST» или из последних грузов. */
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
  const limit = Number(args[args.indexOf('--loads') + 1]) || 20
  const [rows] = await db.query(
    `SELECT origin, destination, loaded_miles, pickup_address, delivery_address
       FROM loads
      WHERE company_id = 'default' AND loaded_miles > 100 AND pickup_address <> '' AND delivery_address <> ''
      ORDER BY pickup_date DESC LIMIT ?`,
    [limit],
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

const date = pickupDate()
let saved = 0
for (const l of (await lanes()).slice(0, 50)) {
  if (!(l.miles > 0)) {
    console.error(`пропуск ${l.origin} → ${l.dest}: нет настоящих миль`)
    continue
  }
  let price
  try {
    price = await quote(l.oz, l.dz, date)
  } catch (e) {
    console.error(`пропуск ${l.origin} → ${l.dest}: ${e.message}`)
    continue
  }
  const rate = Math.round(price)
  const rpm = rate / l.miles
  await db.query(
    `INSERT INTO dat_lanes
       (company_id, source, origin, dest, origin_state, dest_state, equipment, miles, spot_rate, spot_rpm, seen_on, seen_at)
     VALUES ('default', 'warp', ?, ?, ?, ?, 'VAN', ?, ?, ?, CURDATE(), NOW(6))
     ON DUPLICATE KEY UPDATE miles = VALUES(miles), spot_rate = VALUES(spot_rate), spot_rpm = VALUES(spot_rpm), seen_at = NOW(6)`,
    [l.origin.slice(0, 120), l.dest.slice(0, 120), stateOf(l.origin), stateOf(l.dest), l.miles, rate, rpm],
  )
  saved++
  console.log(`${l.origin} → ${l.dest}`.padEnd(42), `${l.miles} mi`.padEnd(9), `$${rate}`.padEnd(8), `$${rpm.toFixed(2)}/mi`)
  await new Promise((r) => setTimeout(r, 700))
}
await db.end()
console.log(`сохранено направлений: ${saved} (источник warp, дата погрузки ${date})`)
