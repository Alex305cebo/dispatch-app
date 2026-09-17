// Суточный снимок рынка DAT Trendlines для всего TMS. Запускает GitHub Actions раз в
// сутки (.github/workflows/dat-snapshot.yml).
//
// Забирает ставки по регионам и грузы на трак по штатам для Van, Reefer и Flatbed, цену
// дизеля, недельный тренд и историю грузов на трак за год (для «Куда отправить трак»),
// проверяет форму ответов теми же разборщиками, что и приложение
// (lib/dat-market-core.ts), и печатает SQL для settings — под теми же ключами, что пишет
// живой запрос из lib/dat-market.ts. Поэтому страницы берут этот снимок первыми и сами к
// DAT не ходят.
//
// Логи репозитория публичные, а данные DAT показываем только внутри TMS: в stderr идёт
// только то, сколько чего пришло, — ни одной цифры рынка. SQL уходит в stdout.
//
//   node scripts/dat-snapshot.mjs > dat.sql && mariadb <база> < dat.sql
import { parseFuel, parseHistory, parseLt, parseRegions, parseTrend } from '../lib/dat-market-core.ts'

const BASE = 'https://analytics.api.dat.com/v2/trendlines'
const PAGE = 'https://iq.trendlines-prod.prod.dat.com'
const SERIES = ['VAN', 'REEFER', 'FLATBED']

async function get(path) {
  // Второй заход через полминуты: разовый сбой чужого сервиса не должен стоить суток
  // без снимка. Больше не пробуем — сервис неофициальный, долбить его нельзя.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(BASE + path, {
        headers: { Origin: PAGE, Referer: PAGE + '/', Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (res.ok) return await res.json()
      console.error(`${path}: HTTP ${res.status}`)
    } catch (e) {
      console.error(`${path}: ${e.name}`)
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 30_000))
  }
  return null
}

// Шестнадцатеричная строка вместо кавычек: JSON с любыми символами не ломает SQL.
const put = (key, value) =>
  `INSERT INTO settings (\`key\`, value) VALUES ('${key}', CONVERT(X'${Buffer.from(value, 'utf8').toString('hex')}' USING utf8mb4)) ` +
  'ON DUPLICATE KEY UPDATE value = VALUES(value);'

const fuel = parseFuel(await get('/fuel'))
console.error(`fuel: ${fuel ? 'ok' : 'нет'}`)
// Тренд и история — не обязательны: без них снимок полный, у планировщика просто нет графика.
const trends = await get('/trends')
const at = Date.now()
const sql = []
for (const equipment of SERIES) {
  const regions = parseRegions(await get(`/${equipment}/regionalRates`))
  const lt = parseLt(await get(`/lt/${equipment}`))
  if (!regions || !lt) {
    // Серия без снимка — не авария: страницы сходят к DAT сами, как до этого скрипта.
    console.error(`::warning::${equipment}: DAT не отдал ${regions ? 'грузы на трак' : 'ставки по регионам'}`)
    continue
  }
  const trend = parseTrend(trends, equipment)
  const history = parseHistory(await get(`/${equipment}/loadAndTruckRatio`))
  console.error(`${equipment}: регионов ${regions.length}, штатов ${Object.keys(lt).length}, тренд ${trend ? 'есть' : 'нет'}, недель ${history?.length ?? 0}`)
  sql.push(put(`dat_trendlines_${equipment}`, JSON.stringify({ equipment, at, regions, lt, fuel, trend, history })))
}
if (!sql.length) {
  console.error('DAT не ответил ни по одной серии — снимок не записан')
  process.exit(1)
}
console.log(sql.join('\n'))
