// Совпадает ли найденная в реестре компания с тем, как брокер записан у нас.
//
// Нужно ровно для одного: MC можно проставить САМО только тогда, когда сомнений нет.
// Ошибка тут дорогая — неверный MC разойдётся по всем грузам брокера и всплывёт в
// счёте, поэтому правило намеренно строгое: похоже — не считается, только точное
// совпадение имени и ровно один кандидат.
//
// Отдельный модуль от fmcsa.ts, потому что тот ходит в сеть и читает ключ из базы, а
// правило сопоставления — чистая строковая работа, и её надо проверять тестами.

/** Формы собственности и мусор пунктуации. «Allen Lund Company» в рейт-коне и
 * «ALLEN LUND COMPANY, INC.» в реестре — одна компания. */
const SUFFIX = /\b(inc|llc|l\.l\.c|ltd|co|corp|corporation|company|group|holdings|usa|us)\b/g

export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    // Точки внутри сокращений убираются НАСУХО: «C.H. Robinson» — это «ch robinson»,
    // а не «c h robinson», иначе с записью реестра «CH ROBINSON» оно не сойдётся.
    .replace(/[.'"`]/g, '')
    .replace(/[,()\-\/]/g, ' ')
    .replace(SUFFIX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type NameHitLike = {
  dot: string
  legalName: string
  dbaName: string | null
  active: boolean
}

/**
 * Кандидат, которого можно проставить без человека, или null.
 *
 * Условия: он действующий, его имя (или dba) после нормализации совпадает с нашим
 * ДОСЛОВНО, и такой он один. Два «TQL» в реестре — выбирает человек: у крупного
 * брокера там десятки записей, и наугад проставленный MC хуже пустого поля.
 */
export function pickExact<T extends NameHitLike>(query: string, hits: T[]): T | null {
  const want = normName(query)
  if (!want) return null
  const exact = hits.filter(
    (h) => h.active && (normName(h.legalName) === want || normName(h.dbaName) === want),
  )
  return exact.length === 1 ? exact[0]! : null
}

/**
 * Лучший кандидат из реестра — тот, который проставляем БЕЗ участия человека.
 *
 * Кнопку «найди мне MC» никто нажимать не будет, номер должен появляться сам, значит
 * правило «совпало дословно или пропускаем» слишком узкое: в реестре компания
 * записана полным юридическим именем («CURA FREIGHT SERVICES LLC»), а в рейт-коне —
 * коротким («Cura Freight»). Поэтому засчитывается и то, что одно имя начинается с
 * другого — но только если такой кандидат ровно один и он действующий.
 *
 * Порядок: дословное совпадение сильнее вложенного; при равном весе берётся имя,
 * ближайшее по длине к нашему. Настоящая ничья (два одинаково подходящих) остаётся
 * человеку: наугад проставленный MC разойдётся по всем грузам брокера и всплывёт в
 * счёте, а это дороже пустого поля.
 */
export function pickBest<T extends NameHitLike>(query: string, hits: T[]): T | null {
  const want = normName(query)
  if (want.length < 3) return null

  const scored = hits
    .filter((h) => h.active)
    .map((h) => {
      const names = [normName(h.legalName), normName(h.dbaName)].filter(Boolean)
      let score = 0
      for (const n of names) {
        if (n === want) score = Math.max(score, 3)
        // Наше короткое имя — начало полного из реестра: «Cura Freight» → «CURA
        // FREIGHT SERVICES LLC». Именно так рейт-коны и подписывают брокера.
        else if (n.startsWith(want + ' ')) score = Math.max(score, 2)
        else if (want.startsWith(n + ' ')) score = Math.max(score, 1)
      }
      const len = Math.min(...names.map((n) => Math.abs(n.length - want.length)))
      return { hit: h, score, len }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.len - b.len)

  if (scored.length === 0) return null
  const best = scored[0]!
  const second = scored[1]
  // Ничья по весу И по близости имени — значит выбрать не из чего.
  if (second && second.score === best.score && second.len === best.len) return null
  return best.hit
}
