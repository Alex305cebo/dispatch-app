// Проверка всех запросов sql`…` в коде на живой MariaDB — без записи данных.
//
// Каждый шаблон собирается с `?` на месте ${…} и отдаётся серверу как PREPARE:
// MariaDB разбирает синтаксис и проверяет, что таблицы и колонки существуют, но
// ничего не выполняет. Ловит то, что не видит TypeScript: опечатку в колонке,
// конструкцию Postgres, которой нет в MariaDB, зарезервированное слово без кавычек.
//
//   node scripts/check-sql.mjs                     ← DATABASE_URL из .env.local
//   node scripts/check-sql.mjs "mysql://…"
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import mysql from 'mysql2/promise'

const root = path.resolve(import.meta.dirname, '..')
const env = fs.existsSync(path.join(root, '.env.local')) ? fs.readFileSync(path.join(root, '.env.local'), 'utf8') : ''
const url = process.argv[2] ?? process.env.DATABASE_URL ?? /^DATABASE_URL=(.*)$/m.exec(env)?.[1]?.trim()
if (!url || !/^(mysql|mariadb):\/\//.test(url)) {
  console.error('Need a mysql:// URL (argument or DATABASE_URL)')
  process.exit(1)
}

const files = []
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(f.name)) continue
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p)
    else if (/\.(ts|tsx|mjs)$/.test(f.name) && !/\.test\./.test(f.name)) files.push(p)
  }
}
for (const d of ['app', 'lib', 'components', 'scripts']) walk(path.join(root, d))

const queries = []
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  if (!src.includes('sql`')) continue
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = (n) => {
    if (ts.isTaggedTemplateExpression(n) && n.tag.getText(sf) === 'sql') {
      const t = n.template
      const text = ts.isNoSubstitutionTemplateLiteral(t)
        ? t.text
        : t.head.text + t.templateSpans.map((s) => '?' + s.literal.text).join('')
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      queries.push({ where: `${path.relative(root, file).split(path.sep).join('/')}:${line}`, text })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}

const conn = await mysql.createConnection({ uri: url.replace(/^mariadb:/, 'mysql:'), timezone: 'Z' })
await conn.query(
  "SET SESSION sql_mode = 'STRICT_ALL_TABLES,PIPES_AS_CONCAT,ANSI_QUOTES,NO_ENGINE_SUBSTITUTION," +
    "NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO', time_zone = '+00:00'",
)
let failed = 0
for (const q of queries) {
  try {
    await conn.query('PREPARE chk FROM ?', [q.text])
    await conn.query('DEALLOCATE PREPARE chk')
  } catch (e) {
    failed++
    console.log(`\nFAIL ${q.where}\n  ${e.message}\n  ${q.text.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
}
await conn.end()
console.log(`\n${queries.length} queries, ${failed} failed`)
process.exit(failed ? 1 : 0)
