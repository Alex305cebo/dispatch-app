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
