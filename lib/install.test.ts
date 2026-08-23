import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { splitStatements } from './install.ts'

test('точка с запятой в комментарии не режет оператор', () => {
  const out = splitStatements(`-- сначала это; потом то\nCREATE TABLE a (id INT);`)
  assert.equal(out.length, 1)
  assert.match(out[0]!, /CREATE TABLE a/)
})

test('точка с запятой в строке не режет оператор', () => {
  const out = splitStatements(`INSERT INTO a VALUES ('раз; два');\nSELECT 1;`)
  assert.equal(out.length, 2)
  assert.match(out[0]!, /раз; два/)
})

test("'' внутри строки не считается её концом", () => {
  const out = splitStatements(`INSERT INTO a VALUES ('it''s; fine');\nSELECT 1;`)
  assert.equal(out.length, 2)
})

test('хвост из одних комментариев не выдаётся за оператор', () => {
  assert.deepEqual(splitStatements(`SELECT 1;\n-- всё\n`).length, 1)
})

test('настоящая schema.sql режется на осмысленные операторы', async () => {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  const out = splitStatements(schema)
  assert.ok(out.length > 30, `операторов всего ${out.length}`)
  // Каждый оператор обязан начинаться с ключевого слова SQL. Именно эта проверка
  // поймала бы прошлую поломку: кусок начинался со слова "this" из комментария.
  for (const stmt of out) {
    const first = stmt.split('\n').find((l) => l.trim() && !l.trim().startsWith('--'))!
    assert.match(first.trim(), /^(CREATE|ALTER|INSERT|UPDATE|DROP|COMMENT|DO|WITH|DELETE)\b/i, first.slice(0, 60))
  }
})

test('версия схемы читается из schema.sql и совпадает с датой', async () => {
  const { schemaFileVersion } = await import('./install.ts')
  const v = await schemaFileVersion()
  assert.match(v ?? '', /^\d{4}-\d{2}-\d{2}$/, `версия: ${v}`)
})
