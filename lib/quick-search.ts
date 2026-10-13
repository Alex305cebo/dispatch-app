// Быстрый поиск по всему TMS (Ctrl+K): груз по номеру, городу или брокеру, трак по
// номеру или водителю, брокер по названию или MC, раздел по названию. Список приходит
// с сервера один раз при открытии окна (app/search-actions.ts), дальше ищется здесь,
// на каждую букву без круга на сервер. Чистые функции — см. quick-search.test.ts.

export type QuickKind = 'page' | 'load' | 'truck' | 'broker'

export type QuickItem = {
  kind: QuickKind
  href: string
  title: string
  sub?: string
  /** Что ещё ищется, кроме названия и подписи: номера, MC, имя водителя, брокер. */
  extra?: string
  /** Порядок при равном совпадении: свежий груз выше старого. */
  rank?: number
}

/** «Chicago, IL» и «chicago il» — одно и то же; «José» ищется и как «jose». */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Вес поля: совпадение в названии важнее, чем в подписи, а в подписи — чем в
 *  скрытых номерах. «riley» — сначала трак с водителем Riley, потом его грузы. */
const FIELD_WEIGHT = [3, 2, 1]

/** Насколько слово запроса подходит строке: 4 — с него начинается название, иначе вес
 *  поля, где с него начинается слово, или половина веса, где оно сидит внутри. 0 — нигде. */
function tokenScore(tok: string, fields: string[]): number {
  if (fields[0]!.startsWith(tok)) return 4
  let best = 0
  fields.forEach((f, i) => {
    const w = FIELD_WEIGHT[i]!
    if (f.split(' ').some((word) => word.startsWith(tok))) best = Math.max(best, w)
    else if (f.includes(tok)) best = Math.max(best, w / 2)
  })
  return best
}

/**
 * Каждое слово запроса должно найтись (порядок любой: «dallas chicago» находит
 * Chicago → Dallas). Выше — где слово начинает название, потом — где начинает слово в
 * названии, подписи, скрытых номерах, потом — где сидит внутри. Из каждого рода — не
 * больше perKind: десять грузов Чикаго не вытесняют трак и брокера.
 */
export function quickMatch(items: QuickItem[], query: string, perKind = 5): QuickItem[] {
  const tokens = norm(query).split(' ').filter(Boolean)
  if (!tokens.length) return []
  const scored: { item: QuickItem; score: number }[] = []
  for (const item of items) {
    const fields = [norm(item.title), norm(item.sub), norm(item.extra)]
    let score = 0
    for (const tok of tokens) {
      const s = tokenScore(tok, fields)
      if (!s) {
        score = 0
        break
      }
      score += s
    }
    if (score > 0) scored.push({ item, score })
  }
  scored.sort((a, b) => b.score - a.score || (b.item.rank ?? 0) - (a.item.rank ?? 0))
  const taken = new Map<QuickKind, number>()
  const out: QuickItem[] = []
  for (const { item } of scored) {
    const n = taken.get(item.kind) ?? 0
    if (n >= perKind) continue
    taken.set(item.kind, n + 1)
    out.push(item)
  }
  return out
}

/** Найденное — группами, в порядке лучшего совпадения в группе: напечатал «деньги» —
 *  первым идёт раздел, напечатал номер груза — грузы. */
export function groupByKind(found: QuickItem[]): { kind: QuickKind; items: QuickItem[] }[] {
  const groups: { kind: QuickKind; items: QuickItem[] }[] = []
  for (const item of found) {
    const g = groups.find((x) => x.kind === item.kind)
    if (g) g.items.push(item)
    else groups.push({ kind: item.kind, items: [item] })
  }
  return groups
}
