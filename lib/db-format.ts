// Сборка текста запроса для MariaDB из sql`…` — отдельно от подключения, чтобы это
// можно было проверить тестом без базы (lib/db-format.test.ts).
//
// Значения подставляются через экранирование mysql2 прямо в текст, а не через `?`:
// mysql2 ищет `?` по всему тексту без разбора кавычек, и знак вопроса внутри строки
// в SQL (шаблон регулярного выражения, JSON-путь) съел бы чужой параметр.

import mysql from 'mysql2'

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** Date → '2026-09-13 22:42:30.367' в UTC. Соединение работает в time_zone '+00:00'. */
export function utcDatetime(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
  )
}

/**
 * Значение параметра → то, что понимает MariaDB.
 * • undefined → NULL (Neon делал так же).
 * • Date → UTC-строка; ISO-строки сюда НЕ превращаются нарочно: строка может ехать
 *   в текстовую колонку, и тихо переписать её формат было бы хуже ошибки. Время в
 *   колонку DATETIME передают объектом Date.
 * • NaN / Infinity → NULL: в MariaDB нет таких чисел, а NOT NULL-колонка вернёт
 *   понятную ошибку вместо записи мусора.
 * • Массив → список для IN (…); пустой → NULL, иначе `IN ()` — синтаксическая ошибка.
 * • Прочий объект → JSON: mysql2 превратил бы его в `ключ = значение`.
 */
export function toSqlValue(v: unknown): unknown {
  if (v === undefined || v === null) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : utcDatetime(v)
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'bigint') return v.toString()
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.from(v as Uint8Array)
  if (Array.isArray(v)) return v.length === 0 ? null : v.map(toSqlValue)
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

/** sql`SELECT … ${a} …` → готовый текст запроса. */
export function formatSql(strings: readonly string[], values: readonly unknown[]): string {
  let text = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) {
    const v = toSqlValue(values[i])
    const lit = Array.isArray(v) ? v.map((x) => mysql.escape(x as never)).join(', ') : mysql.escape(v as never)
    text += lit + (strings[i + 1] ?? '')
  }
  return text
}
