// История ставок USDA AMS по рефрижераторным рейсам → таблица usda_truck_rates.
//
// Открытые данные без ключа: agtransport.usda.gov, набор acar-e3r8 («Refrigerated Truck
// Rates and Availability»). В строке — район погрузки, город выгрузки, мили, вилка за
// неделю (weeklow/weekhigh), середина и ставка за милю, которую считает сам USDA. Это
// настоящие деньги за рейс, а не индекс: то, что нам и нужно для планировщика.
//
//   node --env-file=.env.local scripts/usda-history.mjs            ← свежие недели (60 дней)
//   node --env-file=.env.local scripts/usda-history.mjs 2019-01-01 ← вся история с этой даты
//
// Повторный запуск безопасен: строка недели по маршруту одна (UNIQUE), новые данные
// дописываются. Чужой сервис берём страницами по 5000 строк.
import { connect } from './db-connect.mjs'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Нет DATABASE_URL (--env-file=.env.local)')
  process.exit(1)
}
// Без даты — только свежие недели: отчёт недельный, гонять всю историю каждый день незачем.
const since =
  process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ??
  new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10)

const PAGE = 5000
const API = 'https://agtransport.usda.gov/resource/acar-e3r8.json'

const db = await connect(url)
await db.query('SET SESSION wait_timeout = 900')

let offset = 0
let saved = 0
let skipped = 0
for (;;) {
  const q = `${API}?$where=date >= '${since}T00:00:00'&$order=date&$limit=${PAGE}&$offset=${offset}`
  const res = await fetch(q, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`USDA: HTTP ${res.status}`)
  const rows = await res.json()
  if (!rows.length) break
  const values = []
  for (const r of rows) {
    const distance = Math.round(Number(r.distance))
    const midpoint = Math.round(Number(r.midpoint))
    const rpm = Number(r.rpm)
    const date = String(r.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(distance > 0) || !(midpoint > 0) || !(rpm > 0)) {
      skipped++
      continue
    }
    values.push([
      date,
      String(r.region ?? '').slice(0, 64),
      String(r.origin ?? '').slice(0, 255),
      String(r.destination ?? '').slice(0, 120),
      r.commodity ? String(r.commodity) : null,
      distance,
      Number(r.weeklow) > 0 ? Math.round(Number(r.weeklow)) : null,
      Number(r.weekhigh) > 0 ? Math.round(Number(r.weekhigh)) : null,
      midpoint,
      rpm,
      r.availability ? String(r.availability).slice(0, 16) : null,
    ])
  }
  if (values.length) {
    await db.query(
      `INSERT INTO usda_truck_rates
         (report_date, region, origin, destination, commodity, distance, low_rate, high_rate, midpoint, rpm, availability)
       VALUES ?
       ON DUPLICATE KEY UPDATE low_rate = VALUES(low_rate), high_rate = VALUES(high_rate),
         midpoint = VALUES(midpoint), rpm = VALUES(rpm), availability = VALUES(availability), commodity = VALUES(commodity)`,
      [values],
    )
    saved += values.length
  }
  offset += rows.length
  process.stderr.write(`\rстрок обработано: ${offset}`)
  if (rows.length < PAGE) break
  await new Promise((r) => setTimeout(r, 400))
}
const [[n]] = await db.query('SELECT COUNT(*) n, MIN(report_date) a, MAX(report_date) b FROM usda_truck_rates')
await db.end()
console.error('')
console.log(`записано строк: ${saved}, пропущено без цифр: ${skipped}`)
console.log(`в таблице: ${n.n} строк, с ${String(n.a).slice(0, 10)} по ${String(n.b).slice(0, 10)}`)
