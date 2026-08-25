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
import { pickBest, searchTerms } from './broker-match.ts'

/** Что вышло с этим именем в прошлый раз. Нужно, чтобы не долбить реестр одним и тем
 * же именем каждые пять минут: у брокера может не быть MC вовсе, и это нормальный
 * ответ, а не ошибка. */
type Tried = Record<string, { at: string; result: 'ok' | 'ambiguous' | 'none' }>

// Версия в имени: правила поиска менялись, а старые отметки «не нашлось» переживали
// правку и месяц не давали попробовать снова уже исправленным запросом. Меняем
// правила — меняем и ключ, тогда список пробуется заново с чистого листа.
const STATE_KEY = 'mc_lookup_state_v2'
/** Через месяц пробуем снова: компания могла получить authority, а имя — уточниться. */
const RETRY_DAYS = 30


/**
 * Наш собственный MC. В рейт-коне их всегда два — брокера и наш, как нанимаемого
 * перевозчика, — и разбор документа регулярно берёт не тот. Тогда у брокера в базе
 * оказывается номер Maya Logistics: проверка FMCSA показывает нашу же компанию, а
 * «MC 626911» стоит у половины брокеров разом.
 *
 * Поэтому свой номер здесь — не украшение, а фильтр: такой MC считается отсутствующим
 * и стирается, чтобы подбор нашёл настоящий.
 */
async function ownMc(): Promise<string | null> {
  try {
    const { getCompany } = await import('./invoice')
    const m = /\bMC\s*#?\s*[:\-]?\s*(\d{5,8})\b/i.exec((await getCompany()).mcdot ?? '')
    return m?.[1] ?? null
  } catch {
    return null
  }
}

export type BackfillResult = {
  filled: number
  /** Реестр ответил, но однозначного совпадения нет — тут нужен человек. */
  ambiguous: number
  /** Реестр ответил, что такой компании нет (или у неё нет MC). */
  none: number
  /** Реестр не ответил: таймаут, пятисотая. Имя не помечаем — попробуем ещё. */
  failed: number
  left: number
  /** Почему ничего не вышло — чтобы страница могла это СКАЗАТЬ, а не молчать.
   * 'no_key' — не сохранён webKey FMCSA, без него подбор невозможен в принципе. */
  reason: 'ok' | 'no_key' | 'nothing_to_do'
}

/**
 * Подобрать и проставить MC для брокеров без него. Возвращает, сколько сделано и
 * сколько ещё осталось — по этому числу вызывающий решает, звать ли ещё раз.
 */
export async function backfillBrokerMc(
  companyId: 'default' | 'demo',
  limit = 4,
): Promise<BackfillResult> {
  // Сначала выкидываем свой номер отовсюду, где он записан как брокерский: иначе
  // такой брокер считается «с MC» и подбор к нему даже не подойдёт.
  const mine = await ownMc()
  if (mine) {
    await sql`
      UPDATE loads SET broker_mc = NULL
      WHERE company_id = ${companyId}
        AND regexp_replace(coalesce(broker_mc, ''), '\D', '', 'g') = ${mine}`
  }

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
  if (todo.length === 0) {
    return { filled: 0, ambiguous: 0, none: 0, failed: 0, left: 0, reason: 'nothing_to_do' }
  }

  const { searchByName, checkBrokerByDot } = await import('./fmcsa')
  const out: BackfillResult = {
    filled: 0, ambiguous: 0, none: 0, failed: 0, left: 0, reason: 'ok',
  }

  for (const r of todo.slice(0, limit)) {
    const mark = (result: Tried[string]['result']) => {
      tried[r.key] = { at: new Date().toISOString(), result }
    }
    try {
      // Пробуем имя целиком, потом без «LLC/Inc», потом первые два слова: реестр ищет
      // буквально, и «Molo Solutions, LLC» ему ни о чём не говорит.
      let best: Awaited<ReturnType<typeof pickBest>> = null
      let noKey = false
      for (const term of searchTerms(r.name)) {
        const found = await searchByName(term)
        if ('error' in found) {
          // Ключа нет — реестр вообще недоступен, и отмечать имена «не найдено» нельзя:
          // иначе месяц не будем пробовать по причине, к брокеру не относящейся.
          if (found.error === 'no_key') {
            noKey = true
            break
          }
          continue
        }
        best = pickBest(r.name, found.results)
        if (best) break
      }
      if (noKey) {
        out.reason = 'no_key'
        break
      }
      if (!best) {
        out.ambiguous++
        mark('ambiguous')
        continue
      }
      const checked = await checkBrokerByDot(best.dot)
      if ('error' in checked || !checked.mc || checked.mc === mine) {
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
      // пятисотыми и отваливается по таймауту. Но и отмечать его «не найдено» нельзя
      // — брокер тут ни при чём, а отметка закрыла бы ему дорогу на месяц.
      out.failed++
    }
  }

  await setSetting(STATE_KEY, JSON.stringify(tried))
  // Осталось = ещё не тронутые плюс те, у кого реестр не ответил: к ним вернёмся.
  out.left = Math.max(0, todo.length - limit) + out.failed
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
