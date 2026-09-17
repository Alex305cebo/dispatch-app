// 'server-only' makes any client component that transitively imports this module
// fail at BUILD with a clear message — instead of the old runtime "DATABASE_URL is
// not set" throw in the browser. Every db-touching lib flows through here, so this
// one guard covers the whole server/client boundary.
import 'server-only'
import mysql from 'mysql2/promise'
import { formatSql } from './db-format.ts'

/**
 * База — MariaDB на том же Hostinger, что и приложение (до 09/13/26 был Neon).
 *
 * Подключение создаётся ЛЕНИВО, при первом запросе: `next build` грузит серверные
 * маршруты, и проверка DATABASE_URL на верхнем уровне роняла бы сборку там, где
 * переменная ещё не вписана в панели.
 *
 * Про соединения — ограничения Hostinger, из-за которых пул настроен именно так:
 * • сервер закрывает простаивающее соединение через 20 секунд (wait_timeout), а
 *   новых соединений разрешено 500 в час. Открывать соединение на каждый запрос
 *   нельзя: страница с десятком запросов и пара вкладок выбрали бы лимит за минуты.
 *   Поэтому соединение само продлевает себе wait_timeout и живёт в пуле часами;
 *   одновременных — не больше пяти.
 * • строгий режим, ANSI_QUOTES и PIPES_AS_CONCAT: неверное значение — ошибка, а не
 *   тихая обрезка, "key" в кавычках — имя колонки, `||` склеивает строки, как в
 *   Postgres, на котором писался код.
 */
const SESSION =
  "SET SESSION sql_mode = 'STRICT_ALL_TABLES,PIPES_AS_CONCAT,ANSI_QUOTES,NO_ENGINE_SUBSTITUTION," +
  "NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO', time_zone = '+00:00', wait_timeout = 28800"

type Row = Record<string, any>
/** Строки ответа. У INSERT/UPDATE/DELETE без RETURNING — пустой массив со счётчиками. */
export type Rows = Row[] & { affectedRows?: number; insertId?: number }

const g = globalThis as unknown as { __dbPool?: mysql.Pool }

function pool(): mysql.Pool {
  if (g.__dbPool) return g.__dbPool
  const url = process.env.DATABASE_URL
  if (!url || !/^(mysql|mariadb):\/\//.test(url)) {
    throw new Error(
      'DATABASE_URL не задан или это не MariaDB. Формат: mysql://пользователь:пароль@srv1852.hstgr.io:3306/база ' +
        '— в .env.local, а на хостинге в hPanel → Environment variables.',
    )
  }
  const p = mysql.createPool({
    uri: url.replace(/^mariadb:/, 'mysql:'),
    connectionLimit: 5,
    maxIdle: 5,
    idleTimeout: 4 * 60 * 60 * 1000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30_000,
    timezone: 'Z',
    charset: 'utf8mb4',
    supportBigNumbers: true,
    // BOOLEAN в MariaDB — TINYINT(1). Отдаём true/false, как отдавал Postgres:
    // код сравнивает и `=== true`, и просто `if (row.partial)`.
    typeCast(field, next) {
      if (field.type === 'TINY' && field.length === 1) {
        const v = field.string()
        return v === null ? null : v === '1'
      }
      // DATE — полночь по местному времени сервера, ровно как отдавал драйвер
      // Postgres (pg-types). Код, писавшийся под него, форматирует такие даты сам.
      if (field.type === 'DATE') {
        const v = field.string()
        if (!v) return null
        const [y, m, d] = v.split('-').map(Number)
        return new Date(y!, m! - 1, d!)
      }
      return next()
    },
  })
  // Первая команда на каждом новом соединении — встаёт в его очередь раньше запроса.
  p.pool.on('connection', (conn) => {
    conn.query(SESSION)
  })
  g.__dbPool = p
  return p
}

const RETRYABLE = new Set(['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT'])

async function run(text: string): Promise<Rows> {
  let res: unknown
  try {
    ;[res] = await pool().query(text)
  } catch (e) {
    // Соединение из пула могли закрыть на стороне сервера, пока оно лежало без дела:
    // такой запрос до базы не дошёл, повтор на свежем соединении безопасен.
    const err = e as { code?: string; fatal?: boolean }
    if (!err.fatal || !RETRYABLE.has(err.code ?? '')) throw e
    ;[res] = await pool().query(text)
  }
  if (Array.isArray(res)) return res as Rows
  const h = res as { affectedRows?: number; insertId?: number }
  return Object.assign([] as Row[], { affectedRows: h.affectedRows, insertId: h.insertId })
}

type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Rows>
  /** Готовый текст (схема из lib/schema.sql). Параметры — как у sql`…`. */
  query(text: string, values?: unknown[]): Promise<Rows>
}

/** sql`SELECT … WHERE id = ${id}` — значения экранируются (lib/db-format.ts). */
export const sql: Sql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => run(formatSql(strings, values)),
  {
    query: (text: string, values: unknown[] = []) => {
      const parts = text.split('?')
      if (values.length && parts.length - 1 !== values.length) throw new Error('sql.query: placeholder count mismatch')
      return run(values.length ? formatSql(parts, values) : text)
    },
  },
)
