// Перенос данных из бэкапа Postgres (Neon) в MariaDB/MySQL — одноразовый переезд
// 09/13/26 и заодно инструмент на случай, если его придётся повторить.
//
// Источник — обычный SQL-дамп из .github/workflows/backup.yml (dispatch-YYYY-MM-DD.sql.gz).
// Сама база Neon для переноса не нужна: читаем блоки COPY из файла.
//
//   node scripts/pg-dump-to-mysql.mjs dump.sql.gz --stats               ← только посмотреть
//   node scripts/pg-dump-to-mysql.mjs dump.sql.gz "mysql://…"            ← залить в пустую базу
//   node scripts/pg-dump-to-mysql.mjs dump.sql.gz "mysql://…" --replace  ← очистить и залить заново
//
// Схема в MariaDB должна уже стоять (lib/schema.sql). Скрипт отказывается писать в
// таблицы, где уже есть строки, если не передан --replace: переезд не должен молча
// смешать старые данные с новыми.
import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--') && !a.startsWith('mysql'))
const target = args.find((a) => a.startsWith('mysql://') || a.startsWith('mariadb://'))
const statsOnly = args.includes('--stats')
const replace = args.includes('--replace')
if (!file || (!target && !statsOnly)) {
  console.error('usage: node scripts/pg-dump-to-mysql.mjs <dump.sql.gz> <mysql://…> [--replace] | --stats')
  process.exit(1)
}

/** Одна строка поля COPY → значение (null для \N). Формат текстовый, см. документацию COPY. */
export function unescapeCopy(s) {
  if (s === '\\N') return null
  if (!s.includes('\\')) return s
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c !== '\\') { out += c; continue }
    const n = s[++i]
    if (n === 'n') out += '\n'
    else if (n === 't') out += '\t'
    else if (n === 'r') out += '\r'
    else if (n === 'b') out += '\b'
    else if (n === 'f') out += '\f'
    else if (n === 'v') out += '\v'
    else if (n >= '0' && n <= '7') {
      let oct = n
      while (oct.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') oct += s[++i]
      out += String.fromCharCode(parseInt(oct, 8))
    } else if (n === 'x') {
      let hex = ''
      while (hex.length < 2 && /[0-9a-fA-F]/.test(s[i + 1] ?? '')) hex += s[++i]
      out += String.fromCharCode(parseInt(hex, 16))
    } else out += n
  }
  return out
}

/** '2026-09-11 16:37:26.123456+00' → '2026-09-11 16:37:26.123456' в UTC, без потери микросекунд. */
export function pgTimestamptzToUtc(v) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?([+-]\d{2})(?::?(\d{2}))?$/.exec(v)
  if (!m) throw new Error(`unexpected timestamptz: ${v}`)
  const [, day, hh, mi, ss, frac = '', oh, om = '00'] = m
  const sign = oh.startsWith('-') ? -1 : 1
  const offsetMin = sign * (Math.abs(Number(oh)) * 60 + Number(om))
  const d = new Date(`${day}T${hh}:${mi}:${ss}Z`)
  d.setUTCMinutes(d.getUTCMinutes() - offsetMin)
  const p = (x) => String(x).padStart(2, '0')
  const micro = (frac.slice(1) + '000000').slice(0, 6)
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${micro}`
}

/** Типы колонок из CREATE TABLE public.* самого дампа — он честнее schema.sql. */
function parseDdl(ddl) {
  const tables = new Map()
  for (const m of ddl.matchAll(/CREATE TABLE public\.(\w+) \(\n([\s\S]*?)\n\);/g)) {
    const cols = new Map()
    for (const line of m[2].split('\n')) {
      const c = /^\s+"?(\w+)"? ([a-z ]+?)(?:\(\d+(?:,\d+)?\))?(?: DEFAULT .*?)?(?: NOT NULL)?,?$/.exec(line)
      if (c) cols.set(c[1], c[2].trim())
    }
    tables.set(m[1], cols)
  }
  return tables
}

const stats = new Map()
const warnings = []

function convert(table, col, type, raw) {
  const v = unescapeCopy(raw)
  if (v === null) return null
  switch (type) {
    case 'timestamp with time zone':
      return pgTimestamptzToUtc(v)
    case 'boolean':
      return v === 't' ? 1 : 0
    case 'double precision':
    case 'numeric':
    case 'real':
      if (!Number.isFinite(Number(v))) {
        warnings.push(`${table}.${col}: ${v} → NULL`)
        return null
      }
      return v
    case 'bytea':
      if (!v.startsWith('\\x')) throw new Error(`${table}.${col}: bytea not in hex format`)
      return Buffer.from(v.slice(2), 'hex')
    default:
      if (type === 'text' || type === 'jsonb') {
        const s = stats.get(`${table}.${col}`) ?? { max: 0 }
        s.max = Math.max(s.max, [...v].length)
        stats.set(`${table}.${col}`, s)
      }
      return v
  }
}

// Порядок вставки не важен (проверки внешних ключей выключены на время заливки),
// но список таблиц явный: всё, что не из этого списка (схема neon_auth), не наше.
const TABLES = [
  'users', 'trucks', 'loads', 'settings', 'logins', 'audit_log', 'sessions', 'fleet_status',
  'truck_position_log', 'truck_meta', 'truck_maintenance', 'documents', 'truck_todos',
  'user_capabilities', 'brokers', 'app_errors', 'load_events',
]

let pool = null
if (target) {
  const mysql = (await import('mysql2/promise')).default
  pool = mysql.createPool({ uri: target, connectionLimit: 1, timezone: 'Z', multipleStatements: false })
  const conn = await pool.getConnection()
  await conn.query(
    "SET SESSION sql_mode = 'STRICT_ALL_TABLES,PIPES_AS_CONCAT,ANSI_QUOTES,NO_ENGINE_SUBSTITUTION,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO', time_zone = '+00:00', wait_timeout = 3600, FOREIGN_KEY_CHECKS = 0",
  )
  for (const t of TABLES) {
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM "${t}"`)
    if (n > 0 && !replace) {
      console.error(`Table ${t} already has ${n} rows. Refusing to mix data; pass --replace to wipe and reload.`)
      process.exit(1)
    }
  }
  if (replace) for (const t of TABLES) await conn.query(`DELETE FROM "${t}"`)
  pool.conn = conn
}

const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
let ddl = ''
let ddlDone = false
let types = null
let cur = null // { table, cols, rows, bytes, count }
const counts = {}
const seq = {}

async function flush() {
  if (!cur || cur.rows.length === 0 || !pool) return
  const colList = cur.cols.map((c) => `"${c}"`).join(', ')
  await pool.conn.query(`INSERT INTO "${cur.table}" (${colList}) VALUES ?`, [cur.rows])
  cur.rows = []
  cur.bytes = 0
}

for await (const line of rl) {
  if (!ddlDone) {
    if (line.startsWith('COPY ')) {
      ddlDone = true
      types = parseDdl(ddl)
    } else {
      ddl += line + '\n'
      continue
    }
  }
  if (cur) {
    if (line === '\\.') {
      await flush()
      counts[cur.table] = cur.count
      process.stdout.write(`  ${cur.table}: ${cur.count}\n`)
      cur = null
      continue
    }
    if (!cur.keep) continue
    const fields = line.split('\t')
    if (fields.length !== cur.cols.length) throw new Error(`${cur.table}: ${fields.length} fields, expected ${cur.cols.length}`)
    const row = fields.map((f, i) => convert(cur.table, cur.cols[i], cur.types[i], f))
    cur.rows.push(row)
    cur.count++
    cur.bytes += line.length
    if (cur.bytes > 8_000_000 || cur.rows.length >= 2000) await flush()
    continue
  }
  const copy = /^COPY (\w+)\.("?\w+"?) \((.*)\) FROM stdin;$/.exec(line)
  if (copy) {
    const table = copy[2].replace(/"/g, '')
    const keep = copy[1] === 'public' && TABLES.includes(table)
    const cols = copy[3].split(', ').map((c) => c.replace(/"/g, ''))
    const t = keep ? types.get(table) : null
    if (keep && !t) throw new Error(`no DDL for ${table}`)
    cur = { table, cols, keep, types: keep ? cols.map((c) => t.get(c)) : [], rows: [], bytes: 0, count: 0 }
    if (keep) for (const [i, c] of cols.entries()) if (!cur.types[i]) throw new Error(`no type for ${table}.${c}`)
    continue
  }
  const sv = /^SELECT pg_catalog\.setval\('public\.(\w+)_id_seq', (\d+), (true|false)\);$/.exec(line)
  if (sv) seq[sv[1]] = Number(sv[2]) + (sv[3] === 'true' ? 1 : 0)
}

if (pool) {
  // Счётчики id продолжают с того места, где их оставил Postgres, а не с max(id)+1:
  // удалённый груз не должен отдать свой номер новому.
  for (const [table, next] of Object.entries(seq)) {
    if (TABLES.includes(table)) await pool.conn.query(`ALTER TABLE "${table}" AUTO_INCREMENT = ${next}`)
  }
  await pool.conn.query('SET FOREIGN_KEY_CHECKS = 1')
  pool.conn.release()
  await pool.end()
}

console.log('\nrows:', counts)
console.log('next ids:', seq)
if (warnings.length) console.log('\nwarnings:\n  ' + warnings.join('\n  '))
if (statsOnly) {
  console.log('\nlongest text values:')
  for (const [k, v] of [...stats.entries()].sort()) console.log(`  ${k.padEnd(40)} ${v.max}`)
}
