// Установка на пустую базу — из самого приложения, а не командой в терминале.
//
// Зачем. Схему накатывал `npm run db:init` с машины разработчика. Клиент так не
// поставит никогда — значит, каждая установка упиралась в нас, и это была
// главная разница между «нашим проектом» и «инструментом, который можно
// поставить». Здесь ровно та же схема, но её накатывает страница первого
// запуска: вписал DATABASE_URL в панели хостинга, открыл /login — приложение
// достроило себя само.
//
// Файл НАРОЧНО не помечен 'server-only': scripts/db-init.mjs берёт отсюда
// splitStatements, а 'server-only' бросает исключение в обычном Node. Ничего,
// кроме разбора текста, на верхнем уровне тут нет — модуль с базой грузится
// динамически, внутри функций, и в скрипт не попадает.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Разбить schema.sql на отдельные операторы: HTTP-драйвер Neon принимает по
 * одному за вызов.
 *
 * Раньше это был `schema.split(';')` с пометкой «в файле нет точек с запятой
 * внутри комментариев и строк». Пометка перестала быть правдой: в комментарии
 * появилось «(ratecon-ai-contract brokerName); this is where it's kept», файл
 * разрезало посреди фразы, Postgres ответил `syntax error at or near "this"` —
 * и db:init молча не работал ни у кого.
 *
 * Поэтому ищем `;`, который действительно вне строчного комментария и вне
 * кавычек. Всё ещё мелочь — но больше не держится на том, что никто никогда не
 * напишет точку с запятой в прозе.
 */
export function splitStatements(sqlText: string): string[] {
  const out: string[] = []
  let buf = ''
  let inLineComment = false
  let inString = false
  for (let i = 0; i < sqlText.length; i++) {
    const c = sqlText[i]
    const next = sqlText[i + 1]
    if (inLineComment) {
      buf += c
      if (c === '\n') inLineComment = false
      continue
    }
    if (inString) {
      buf += c
      // '' внутри строки — экранированная кавычка, а не её конец.
      if (c === "'" && next === "'") { buf += next; i++; continue }
      if (c === "'") inString = false
      continue
    }
    if (c === '-' && next === '-') { inLineComment = true; buf += c; continue }
    if (c === "'") { inString = true; buf += c; continue }
    if (c === ';') { out.push(buf); buf = ''; continue }
    buf += c
  }
  out.push(buf)
  // Кусок из одних комментариев и пробелов — не оператор: Postgres отвергает
  // пустой запрос, а хвост после последней `;` обычно именно такой.
  return out
    .map((s) => s.trim())
    .filter((s) => s && s.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')))
}

/** Схема уже накатана? Один дешёвый вопрос вместо попытки прочитать таблицу:
 * to_regclass отвечает NULL, а не исключением, если таблицы нет. Исключение
 * отсюда означает, что база недоступна вообще, — и его наверх пускаем как
 * есть, чтобы «база лежит» не выглядело как «база пустая». */
export async function schemaInstalled(): Promise<boolean> {
  const { sql } = await import('./db.ts')
  const rows = (await sql`SELECT to_regclass('public.users') AS t`) as { t: string | null }[]
  return rows[0]?.t != null
}

/** Накатить lib/schema.sql. Идемпотентно (всё через CREATE/ALTER … IF NOT
 * EXISTS), поэтому годится и как первая установка, и как миграция.
 *
 * Файл читается с диска, а не импортируется строкой: на хостинге приложение
 * запускается как `next start` из корня репозитория, schema.sql лежит рядом.
 * Для serverless-сборки (`output: 'standalone'`) сюда понадобился бы
 * outputFileTracingIncludes — сейчас его нет, потому что нет и standalone. */
export async function applySchema(): Promise<number> {
  const { sql } = await import('./db.ts')
  const schema = await readFile(join(process.cwd(), 'lib', 'schema.sql'), 'utf8')
  const statements = splitStatements(schema)
  for (const stmt of statements) await sql.query(stmt)
  return statements.length
}

/** Версия схемы, зашитая в schema.sql — та строка, что он сам пишет в settings. */
export async function schemaFileVersion(): Promise<string | null> {
  const schema = await readFile(join(process.cwd(), 'lib', 'schema.sql'), 'utf8')
  return /\('schema_version',\s*'([^']+)'\)/.exec(schema)?.[1] ?? null
}

/**
 * Аварийный сброс администратора — когда пароль забыт, кода восстановления нет,
 * а второго админа не существует. Единственный «пароль» здесь — доступ к панели
 * хостинга: кто может менять переменные окружения, тот и так владеет установкой.
 *
 * Как пользоваться: вписать в панели переменную ADMIN_RESET с любым НОВЫМ
 * значением (например, сегодняшней датой) и открыть /login. Приложение закроет
 * все сессии, уберёт настоящие аккаунты, и на входе снова появится форма первого
 * запуска — задать нового администратора и получить код восстановления.
 *
 * Одноразово на значение: применённое значение запоминается в settings, и
 * оставленная в панели переменная НЕ повторяет сброс при каждом деплое. Новый
 * сброс — новое значение. Траки, грузы и документы не трогаются.
 */
export async function applyAdminReset(): Promise<void> {
  const want = (process.env.ADMIN_RESET ?? '').trim()
  if (!want) return
  try {
    const { sql } = await import('./db.ts')
    const rows = (await sql`SELECT value FROM settings WHERE key = 'admin_reset_done'`) as { value: string }[]
    if (rows[0]?.value === want) return
    await sql`DELETE FROM sessions`
    await sql`DELETE FROM users WHERE is_demo = FALSE`
    await sql`INSERT INTO settings (key, value) VALUES ('admin_reset_done', ${want})
              ON CONFLICT (key) DO UPDATE SET value = ${want}`
    console.warn('ADMIN_RESET applied:', want)
  } catch (e) {
    console.error('applyAdminReset failed', e)
  }
}

let ensured: string | null = null

/**
 * Дотянуть схему до версии кода — на живой базе, без командной строки.
 *
 * Раньше код доезжал до клиента пушем, а его база — только когда мы запускали
 * db:init с нашей машины. Новая колонка в коде и старая база у клиента — это
 * ошибка «column does not exist» в самый неожиданный момент и только у него.
 * schema.sql идемпотентен (везде IF NOT EXISTS / ON CONFLICT), поэтому
 * «мигрировать» и «накатить заново» — одно и то же, и делать это можно при
 * каждом запуске.
 *
 * Один раз на процесс: сравнение версий — запрос к базе, а вызывается это с
 * экрана входа, куда ходят часто. Ошибки гасятся: не смогли мигрировать — это
 * не причина не пустить человека внутрь, на первой же рабочей странице сбой
 * базы и так будет виден.
 */
export async function ensureSchema(): Promise<void> {
  const want = await schemaFileVersion()
  if (!want || ensured === want) return
  try {
    const { sql } = await import('./db.ts')
    const rows = (await sql`SELECT value FROM settings WHERE key = 'schema_version'`) as { value: string }[]
    if (rows[0]?.value !== want) await applySchema()
    ensured = want
  } catch (e) {
    console.error('ensureSchema failed', e)
  }
}
