// Applies lib/schema.sql to a database, and — for a brand-new install — fills in the
// company profile so the app is usable the moment someone logs in.
//
// Deliberately NOT run on server start: the app applies the same schema itself from
// /login (lib/install.ts). This is the command-line path for a customer's database.
//
//   npm run db:init                                           ← local dev, reads .env.local
//   npm run db:init -- "mysql://user:pass@host:3306/db"       ← a customer's database
//   npm run db:init -- "mysql://…" --co-name="Acme Trucking" --co-mcdot="MC 123456"
//
// Safe to re-run: schema.sql is idempotent (CREATE/ALTER … IF NOT EXISTS), so this
// doubles as the migration command when a customer's DB falls behind the code.
import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'
import { splitStatements } from '../lib/install.ts'
import { formatSql } from '../lib/db-format.ts'

const args = process.argv.slice(2)
const url = args.find((a) => !a.startsWith('--')) ?? process.env.DATABASE_URL

if (!url || !/^(mysql|mariadb):\/\//.test(url)) {
  console.error(
    'No MariaDB URL.\n' +
      '  local:    npm run db:init            (needs DATABASE_URL=mysql://… in .env.local)\n' +
      '  customer: npm run db:init -- "mysql://user:pass@host:3306/db"',
  )
  process.exit(1)
}

/** `--co-name=Acme` → ['co_name', 'Acme']. Only the seven keys getCompany() reads. */
const CO_KEYS = ['name', 'owner', 'mcdot', 'address', 'email', 'phone', 'remit-to']
const company = []
for (const a of args) {
  const m = /^--co-([a-z-]+)=(.*)$/.exec(a)
  if (!m) continue
  if (!CO_KEYS.includes(m[1])) {
    console.error(`Unknown option --co-${m[1]}. Known: ${CO_KEYS.map((k) => `--co-${k}`).join(' ')}`)
    process.exit(1)
  }
  company.push([`co_${m[1].replace('-', '_')}`, m[2]])
}

// Те же настройки сеанса, что у приложения (lib/db.ts): без ANSI_QUOTES не разберётся
// "key", без строгого режима неверное значение запишется молча.
const conn = await mysql.createConnection({ uri: url.replace(/^mariadb:/, 'mysql:'), timezone: 'Z', charset: 'utf8mb4' })
await conn.query(
  "SET SESSION sql_mode = 'STRICT_ALL_TABLES,PIPES_AS_CONCAT,ANSI_QUOTES,NO_ENGINE_SUBSTITUTION," +
    "NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO', time_zone = '+00:00'",
)
const sql = async (strings, ...values) => (await conn.query(formatSql(strings, values)))[0]

const schema = await readFile(new URL('../lib/schema.sql', import.meta.url), 'utf8')

// Разбор файла на операторы — общий с приложением: страница первого запуска
// накатывает ту же схему тем же разбором (lib/install.ts).
const statements = splitStatements(schema)

for (const stmt of statements) {
  const label = stmt.split('\n').find((l) => l.trim() && !l.trim().startsWith('--')) ?? stmt
  process.stdout.write(`  ${label.trim().slice(0, 60)}… `)
  await conn.query(stmt)
  console.log('ok')
}

console.log(`\nSchema applied — ${statements.length} statements.`)

// Same upsert lib/settings.ts uses. Done here rather than left to the UI because
// lib/invoice.ts refuses to build an invoice until co_name and co_mcdot exist — an
// install that skips this looks finished and then fails at the first invoice.
for (const [key, value] of company) {
  await sql`INSERT INTO settings ("key", value) VALUES (${key}, ${value})
            ON DUPLICATE KEY UPDATE value = ${value}`
  console.log(`  ${key} = ${value}`)
}

// A verdict, not a silent exit: these four are exactly what has to be true before a
// customer can be handed the URL, and each has bitten before.
const [{ n: admins }] = await sql`SELECT count(*) AS n FROM users WHERE is_demo = FALSE`
const [{ n: trucks }] = await sql`SELECT count(*) AS n FROM trucks WHERE company_id = 'default'`
const rows = await sql`SELECT "key", value FROM settings WHERE "key" IN ('co_name', 'co_mcdot')`
const co = Object.fromEntries(rows.map((r) => [r.key, r.value]))
const mark = (ok) => (ok ? 'ok' : 'MISSING')
await conn.end()

console.log(
  `\nusers(real)=${admins}  trucks=${trucks}  ` +
    `co_name=${mark(co.co_name)}  co_mcdot=${mark(co.co_mcdot)}`,
)
if (Number(admins) === 0) console.log('Next: open /login on the new domain — it offers to create the first admin.')
if (!co.co_name || !co.co_mcdot) {
  console.log('Company profile incomplete — invoicing will refuse until it is filled (Финансы → компания).')
}
