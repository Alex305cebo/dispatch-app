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
/** То же самое для запросов в реестр: там имя ещё не нормализовано. */
const SUFFIX_WORDS = /\b(inc|llc|ltd|co|corp|corporation|company|group|holdings)\b/gi

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


/** То же имя без пробелов вовсе. В реестре инициалы пишут через пробел («J B HUNT»),
 * в рейт-коне — слитно с точками («J.B. Hunt»). После обычной нормализации это всё
 * ещё разные строки, и настоящая компания проигрывает случайной «JB HUNT MOVERS». */
export const compact = (s: string | null | undefined) => normName(s).replace(/\s+/g, '')

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

/**
 * Чем спрашивать реестр про эту компанию — от точного к общему.
 *
 * Реестр ищет по названию буквально, а в рейт-коне брокер подписан как ему удобно:
 * «Molo Solutions, LLC». Запятая и форма собственности до совпадения не доживают, и
 * запрос возвращает пусто — именно поэтому номера и не появлялись. Поэтому пробуем
 * по очереди: имя без пунктуации, оно же без «LLC/Inc», и первые два слова
 * («Landstar Ranger» вместо «Landstar Ranger Corporate Services»).
 *
 * Порядок важен: первый ответ, в котором нашёлся однозначный кандидат, и выигрывает,
 * а чем короче запрос, тем больше в ответе чужих компаний.
 */
export function searchTerms(name: string): string[] {
  const terms: string[] = []
  const push = (v: string) => {
    const t = v.replace(/\s+/g, ' ').trim()
    if (t.length >= 3 && !terms.includes(t)) terms.push(t)
  }

  const clean = (name ?? '').replace(/[.,'"`]/g, '').replace(/[\/\-]/g, ' ')
  push(clean)
  push(clean.replace(SUFFIX_WORDS, ' '))

  const words = clean.replace(SUFFIX_WORDS, ' ').split(/\s+/).filter(Boolean)
  if (words.length > 2) push(words.slice(0, 2).join(' '))

  // «J.B. Hunt» в реестре записан как «J B HUNT»: поиск там идёт по началу строки, и
  // слитное «JB HUNT» до него не достаёт — зато достаёт до чужого «JB HUNT MOVERS».
  const spaced = (name ?? '').replace(/\b([A-Za-z])\.\s*([A-Za-z])\./g, '$1 $2 ')
  if (spaced !== name) {
    const c = spaced.replace(/[.,'"`]/g, '').replace(/[\/\-]/g, ' ')
    push(c.replace(SUFFIX_WORDS, ' '))
  }
  return terms
}

/** Кандидат вместе с тем, что о нём известно из карточки реестра. */
export type Candidate = {
  dot: string
  legalName: string
  dbaName: string | null
  phone: string | null
  entityType: string | null
  operatingStatus: string | null
}

const last10 = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-10)

/**
 * Выбрать компанию, которой принадлежит этот брокер, — или не выбрать.
 *
 * Одного имени мало: в реестре две записи «LANDSTAR RANGER INC» и есть посторонняя
 * «JB HUNT MOVERS LLC», которая по имени тоже подходит. Поэтому решает сумма
 * признаков, а главный из них — не имя, а ТЕЛЕФОН: он у нас свой, из рейт-кона, и
 * совпадение с телефоном в реестре — это уже не догадка.
 *
 * Порог намеренно высокий: одного лишь частичного совпадения имени не хватает. Лучше
 * оставить брокера без номера, чем выставить счёт на чужой MC.
 */
export function chooseCompany(
  name: string,
  ourPhone: string | null,
  candidates: Candidate[],
): Candidate | null {
  const want = compact(name)
  if (want.length < 4) return null
  const phone = last10(ourPhone)

  const scored = candidates
    .map((c) => {
      const names = [compact(c.legalName), compact(c.dbaName)].filter(Boolean)
      let score = 0
      if (names.includes(want)) score += 3
      else if (names.some((n) => n.startsWith(want))) score += 1
      // Телефон из нашего же рейт-кона — самое надёжное, что у нас есть.
      if (phone && last10(c.phone) === phone) score += 3
      if (/BROKER/i.test(c.entityType ?? '')) score += 1
      // Недействующая запись при живой альтернативе проигрывает, но сама по себе не
      // отбрасывается: у части брокеров authority в SAFER не показана вовсе.
      if (/NOT AUTHORIZED|OUT OF SERVICE/i.test(c.operatingStatus ?? '')) score -= 1
      return { c, score }
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null
  if (scored.length > 1 && scored[1]!.score === scored[0]!.score) return null
  return scored[0]!.c
}

/**
 * Название компании по домену почты: Tyler.Simpson@chrobinson.com → «C.H. Robinson».
 *
 * Рейт-кон подписывает менеджер, и в поле брокера оказывается имя человека. Искать
 * «Tyler Simpson» в реестре бессмысленно — такой компании нет и не будет. А домен
 * называет работодателя точно: у брокера корпоративная почта, и она у всех
 * сотрудников одна.
 *
 * Сверяем «chrobinson» со списком крупных брокеров без пробелов и точек — там это
 * «C.H. Robinson», то есть ровно тот же набор букв. Так домен превращается в имя,
 * которое реестр уже понимает.
 */
export function nameFromDomain(email: string | null, known: string[]): string | null {
  const domain = emailDomainLabel(email)
  if (!domain) return null
  const hit = known.find((n) => compact(n) === domain)
  return hit ?? null
}

/** Первое слово домена без www: «ops@mail.chrobinson.com» → «chrobinson». */
function emailDomainLabel(email: string | null): string | null {
  const host = (email ?? '').split('@')[1]?.toLowerCase().trim()
  if (!host || !host.includes('.')) return null
  const parts = host.split('.').filter((p) => p !== 'www')
  // Берём часть перед доменом верхнего уровня: chrobinson.com → chrobinson,
  // ops.tql.co.uk → tql.
  const label = parts.length > 2 ? parts[parts.length - 3] : parts[0]
  return label && label.length >= 3 ? label.replace(/[^a-z0-9]/g, '') : null
}
