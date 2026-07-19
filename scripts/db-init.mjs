// Applies lib/schema.sql once. Deliberately NOT run on server start: on Vercel
// "start" happens on every request.
//   npm run db:init
import { readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Put your Neon connection string in .env.local')
  process.exit(1)
}

const sql = neon(process.env.DATABASE_URL)
const schema = await readFile(new URL('../lib/schema.sql', import.meta.url), 'utf8')

// ponytail: naive split — Neon's HTTP driver takes one statement per call, and
// schema.sql has no semicolons inside string literals OR comments. Reach for a
// real parser only if that stops being true.
const statements = schema
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

for (const stmt of statements) {
  const label = stmt.split('\n').find((l) => l.trim() && !l.trim().startsWith('--')) ?? stmt
  process.stdout.write(`  ${label.trim().slice(0, 60)}… `)
  await sql.query(stmt)
  console.log('ok')
}

console.log(`\nSchema applied — ${statements.length} statements.`)
