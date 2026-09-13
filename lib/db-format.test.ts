import test from 'node:test'
import assert from 'node:assert/strict'
import { formatSql, toSqlValue, utcDatetime } from './db-format.ts'

const q = (strings: TemplateStringsArray, ...values: unknown[]) => formatSql(strings, values)

test('значения экранируются, а не подставляются как есть', () => {
  assert.equal(q`SELECT * FROM users WHERE email = ${"a' OR 1=1 --"}`, "SELECT * FROM users WHERE email = 'a\\' OR 1=1 --'")
  assert.equal(q`SELECT ${1}, ${null}, ${undefined}, ${true}`, 'SELECT 1, NULL, NULL, true')
})

test('Date уходит в UTC без зоны — так его принимает DATETIME в строгом режиме', () => {
  const d = new Date('2026-09-13T22:42:30.367Z')
  assert.equal(utcDatetime(d), '2026-09-13 22:42:30.367')
  assert.equal(q`SET at = ${d}`, "SET at = '2026-09-13 22:42:30.367'")
  assert.equal(toSqlValue(new Date('nope')), null)
})

test('ISO-строка остаётся строкой: она может ехать в текстовую колонку', () => {
  assert.equal(q`VALUES (${'2026-09-13T22:42:30.367Z'})`, "VALUES ('2026-09-13T22:42:30.367Z')")
})

test('массив для IN раскрывается, пустой — NULL, а не синтаксическая ошибка', () => {
  assert.equal(q`WHERE id IN (${[1, 2, 3]})`, 'WHERE id IN (1, 2, 3)')
  assert.equal(q`WHERE kind IN (${['bol', 'pod']})`, "WHERE kind IN ('bol', 'pod')")
  assert.equal(q`WHERE id IN (${[]})`, 'WHERE id IN (NULL)')
})

test('NaN и Infinity — NULL; объект — JSON; байты — hex-литерал', () => {
  assert.equal(q`${NaN} ${Infinity}`, 'NULL NULL')
  assert.equal(q`${{ a: [1] }}`, `'{\\"a\\":[1]}'`)
  assert.equal(q`${Buffer.from([0xca, 0xfe])}`, "X'cafe'")
})

test('знак вопроса в тексте запроса не трогается', () => {
  assert.equal(q`WHERE value REGEXP '(?<="at":)[0-9]+' AND id = ${5}`, `WHERE value REGEXP '(?<="at":)[0-9]+' AND id = 5`)
})
