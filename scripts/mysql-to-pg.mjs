// ОТКАТ переезда: данные из MariaDB обратно в Postgres (Neon).
//
// Когда нужен: если после переезда 09/13/26 решили вернуться на Neon. Порядок отката:
//   1. Postgres со схемой старой версии: код с метки pre-mysql сам накатывает её на
//      /login, либо `git show pre-mysql:lib/schema.sql` в SQL-редактор Neon.
//   2. node scripts/mysql-to-pg.mjs "mysql://…" "postgresql://…" --replace
//   3. Вернуть код: git checkout -B main pre-mysql && git push --force-with-lease
//      (или revert коммитов переезда), в hPanel вернуть DATABASE_URL на Neon.
//
// Копирует все строки всех таблиц. Колонки берутся пересечением: чего нет в старой
// схеме Postgres (например documents.thumb), то не переносится — это кэш.
// Счётчики id выставляются так, чтобы новые записи не заняли старые номера.
import { pathToFileURL } from 'node:url'

// Порядок — по внешним ключам: сначала те, на кого ссылаются.
export const TABLES = [
  'users', 'trucks', 'truck_maintenance', 'loads', 'documents', 'truck_meta', 'truck_todos',
  'sessions', 'user_capabilities', 'load_events', 'settings', 'logins', 'audit_log',
  'fleet_status', 'truck_position_log', 'brokers', 'app_errors',
]

/**
 * my — mysql2/promise connection; pg — что угодно с query(text, params) → { rows }
 * (Pool из @neondatabase/serverless, pg, PGlite).
 */
export async function copyMysqlToPg(my, pg, { replace = false, log = console.log } = {}) {
  await my.query("SET SESSION sql_mode = 'ANSI_QUOTES', time_zone = '+00:00'")
  const counts = {}
  for (const t of TABLES) {
    const { rows } = await pg.query(`SELECT count(*)::int AS n FROM ${t}`)
    if (rows[0].n > 0 && !replace) throw new Error(`Postgres table ${t} has ${rows[0].n} rows; pass --replace`)
  }
  if (replace) await pg.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)

  for (const t of TABLES) {
    const { rows: pgCols } = await pg.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [t],
    )
    const pgType = new Map(pgCols.map((c) => [c.column_name, c.data_type]))
    const [myCols] = await my.query(
      'SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position',
      [t],
    )
    const cols = myCols.map((r) => r.c).filter((c) => pgType.has(c))
    const [rows] = await my.query(`SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM "${t}"`)
    const conv = (c, v) => {
      if (v === null) return null
      const type = pgType.get(c)
      if (type === 'boolean') return v === 1 || v === true
      if (type === 'jsonb' || type === 'json') return typeof v === 'string' ? v : JSON.stringify(v)
      if (type === 'date' && v instanceof Date) return v.toISOString().slice(0, 10)
      return v
    }
    const quoted = cols.map((c) => `"${c}"`).join(', ')
    for (const r of rows) {
      const params = cols.map((c) => conv(c, r[c]))
      await pg.query(`INSERT INTO ${t} (${quoted}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, params)
    }
    counts[t] = rows.length
    log(`  ${t}: ${rows.length}`)

    if (pgType.has('id')) {
      const [[{ ai }]] = await my.query(
        'SELECT AUTO_INCREMENT AS ai FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
        [t],
      )
      const { rows: seq } = await pg.query(`SELECT pg_get_serial_sequence($1, 'id') AS s`, [t])
      if (seq[0]?.s && ai > 1) await pg.query(`SELECT setval($1, $2, true)`, [seq[0].s, Number(ai) - 1])
    }
  }
  return counts
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const myUrl = args.find((a) => /^(mysql|mariadb):\/\//.test(a))
  const pgUrl = args.find((a) => /^postgres(ql)?:\/\//.test(a))
  if (!myUrl || !pgUrl) {
    console.error('usage: node scripts/mysql-to-pg.mjs "mysql://…" "postgresql://…" [--replace]')
    process.exit(1)
  }
  const mysql = (await import('mysql2/promise')).default
  const { Pool } = await import('@neondatabase/serverless')
  const my = await mysql.createConnection({ uri: myUrl.replace(/^mariadb:/, 'mysql:'), timezone: 'Z', dateStrings: ['DATE'] })
  const pg = new Pool({ connectionString: pgUrl })
  try {
    const counts = await copyMysqlToPg(my, pg, { replace: args.includes('--replace') })
    console.log('\ndone:', counts)
  } finally {
    await my.end()
    await pg.end()
  }
}
