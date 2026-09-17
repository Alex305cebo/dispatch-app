// Суточный срез рынка DAT по штатам → своя история в таблице dat_state_daily.
//
// Снимок Trendlines (scripts/dat-snapshot.mjs) кладёт в settings только ПОСЛЕДНЕЕ
// состояние: грузы на трак по штатам, ставки по пяти регионам, дизель. Истории по штатам
// у DAT в открытом виде нет — значит копим свою: строка на штат, серию и день. Для
// планировщика это единственный способ увидеть, как рынок штата ходит по сезонам.
//
//   node --env-file=.env.local scripts/dat-daily.mjs
//
// Ничего не запрашивает у DAT: берёт снимок, который уже лежит в settings.
import mysql from 'mysql2/promise'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Нет DATABASE_URL (--env-file=.env.local)')
  process.exit(1)
}
const SERIES = ['VAN', 'REEFER', 'FLATBED']
const db = await mysql.createConnection(url)
await db.query('SET SESSION wait_timeout = 900')

let saved = 0
for (const eq of SERIES) {
  const [[row]] = await db.query('SELECT value FROM settings WHERE `key` = ?', [`dat_trendlines_${eq}`])
  if (!row) {
    console.error(`${eq}: снимка в settings нет`)
    continue
  }
  let snap
  try {
    snap = JSON.parse(row.value)
  } catch {
    console.error(`${eq}: снимок не разбирается`)
    continue
  }
  // День снимка по восточному времени: сервер живёт в UTC, а рынок — американский.
  const day = new Date((snap.at ?? Date.now()) - 4 * 3600 * 1000).toISOString().slice(0, 10)
  const regionOf = (state) => (snap.regions ?? []).find((r) => (r.states ?? []).includes(state === 'KS' ? 'KA' : state))
  const fuel = Number(snap.fuel?.price) > 0 ? Number(snap.fuel.price) : null
  const values = []
  for (const [state, lt] of Object.entries(snap.lt ?? {})) {
    const ratio = Number(lt?.ratio)
    if (!(ratio > 0)) continue
    const region = regionOf(state)
    values.push([day, eq, state, Math.round(Number(lt.loads) || 0), Math.round(Number(lt.trucks) || 0), ratio, region?.code ?? null, region?.rpm ?? null, fuel])
  }
  if (!values.length) continue
  await db.query(
    `INSERT INTO dat_state_daily (snapshot_date, equipment, state, loads, trucks, ratio, region, region_rpm, diesel)
     VALUES ?
     ON DUPLICATE KEY UPDATE loads = VALUES(loads), trucks = VALUES(trucks), ratio = VALUES(ratio),
       region = VALUES(region), region_rpm = VALUES(region_rpm), diesel = VALUES(diesel)`,
    [values],
  )
  saved += values.length
  console.log(`${eq}: ${values.length} штатов за ${day}`)
}
const [[n]] = await db.query('SELECT COUNT(*) n, MIN(snapshot_date) a, MAX(snapshot_date) b FROM dat_state_daily')
await db.end()
console.log(`записано строк: ${saved}; в таблице ${n.n}, с ${String(n.a).slice(0, 10)} по ${String(n.b).slice(0, 10)}`)
