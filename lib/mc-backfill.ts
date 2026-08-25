// Проставить MC брокерам самим — без единого клика.
//
// Кнопку «найди MC» никто нажимать не будет, и это правильно: номер компании — не
// работа диспетчера, а данные, которых не хватает в документе. Рейт-кон печатает имя
// и телефон, MC в нём чаще всего нет, значит взять его можно только в реестре FMCSA
// по названию — и делать это должно приложение, а не человек.
//
// Работает партиями: реестр отвечает медленно (до восьми секунд на запрос), а на
// брокера уходит два-три обращения. Партия по несколько штук за прогон, прогоны идут
// с крона и при открытии раздела «Брокеры», так что список заполняется сам и без
// ожидания где-либо в интерфейсе.

import { sql } from './db'
import { getSetting, setSetting } from './settings'
import { pickBest } from './broker-match.ts'

/** Что вышло с этим именем в прошлый раз. Нужно, чтобы не долбить реестр одним и тем
 * же именем каждые пять минут: у брокера может не быть MC вовсе, и это нормальный
 * ответ, а не ошибка. */
type Tried = Record<string, { at: string; result: 'ok' | 'ambiguous' | 'none' }>

const STATE_KEY = 'mc_lookup_state'
/** Через месяц пробуем снова: компания могла получить authority, а имя — уточниться. */
const RETRY_DAYS = 30

export type BackfillResult = { filled: number; ambiguous: number; none: number; left: number }

/**
 * Подобрать и проставить MC для брокеров без него. Возвращает, сколько сделано и
 * сколько ещё осталось — по этому числу вызывающий решает, звать ли ещё раз.
 */
export async function backfillBrokerMc(
  companyId: 'default' | 'demo',
  limit = 4,
): Promise<BackfillResult> {
  // Брокеры, у которых MC нет ни на одном грузе. Имя — ключ: именно по нему потом
  // проставляем, и именно им брокер записан в документе.
  const rows = (await sql`
    SELECT lower(trim(broker_name)) AS key,
           max(broker_name) AS name,
           max(broker_email) AS email,
           count(*) AS loads
    FROM loads
    WHERE company_id = ${companyId}
      AND coalesce(trim(broker_name), '') <> ''
    GROUP BY 1
    HAVING max(coalesce(broker_mc, '')) = ''
    ORDER BY count(*) DESC`) as { key: string; name: string; email: string | null; loads: number }[]

  const tried: Tried = JSON.parse((await getSetting(STATE_KEY)) || '{}')
  const fresh = (k: string) => {
    const t = tried[k]
    if (!t) return false
    return Date.now() - Date.parse(t.at) < RETRY_DAYS * 86400000
  }
  const todo = rows.filter((r) => !fresh(r.key))
  if (todo.length === 0) return { filled: 0, ambiguous: 0, none: 0, left: 0 }

  const { searchByName, checkBrokerByDot } = await import('./fmcsa')
  const out: BackfillResult = { filled: 0, ambiguous: 0, none: 0, left: 0 }

  for (const r of todo.slice(0, limit)) {
    const mark = (result: Tried[string]['result']) => {
      tried[r.key] = { at: new Date().toISOString(), result }
    }
    try {
      const found = await searchByName(r.name)
      if ('error' in found) {
        // Ключа нет — реестр вообще недоступен, и отмечать имена «не найдено» нельзя:
        // иначе месяц не будем пробовать по причине, к брокеру не относящейся.
        if (found.error === 'no_key') break
        out.none++
        mark('none')
        continue
      }
      const best = pickBest(r.name, found.results)
      if (!best) {
        out.ambiguous++
        mark('ambiguous')
        continue
      }
      const checked = await checkBrokerByDot(best.dot)
      if ('error' in checked || !checked.mc) {
        out.none++
        mark('none')
        continue
      }
      await sql`
        UPDATE loads SET broker_mc = ${checked.mc}
        WHERE company_id = ${companyId}
          AND lower(trim(broker_name)) = ${r.key}
          AND coalesce(broker_mc, '') = ''`
      out.filled++
      mark('ok')
    } catch {
      // Одно упавшее имя не должно ронять всю партию: реестр регулярно отвечает
      // пятисотыми, а остальные брокеры к этому отношения не имеют.
      out.none++
      mark('none')
    }
  }

  await setSetting(STATE_KEY, JSON.stringify(tried))
  out.left = Math.max(0, todo.length - limit)
  return out
}

/** Сколько брокеров ещё без MC и ждут подбора — чтобы интерфейс знал, звать ли ещё. */
export async function brokersMissingMc(companyId: 'default' | 'demo'): Promise<number> {
  const rows = (await sql`
    SELECT count(*)::int AS n FROM (
      SELECT lower(trim(broker_name)) AS key
      FROM loads
      WHERE company_id = ${companyId} AND coalesce(trim(broker_name), '') <> ''
      GROUP BY 1
      HAVING max(coalesce(broker_mc, '')) = ''
    ) t`) as { n: number }[]
  return rows[0]?.n ?? 0
}
