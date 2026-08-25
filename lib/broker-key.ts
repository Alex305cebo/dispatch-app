// How one broker is told from another when a load carries no MC.
//
// Its own module, away from lib/brokers.ts, only because that file opens a database
// connection at import time — this rule is worth a test, and a test cannot load a
// module that needs DATABASE_URL to exist.

/** Free webmail is never a company: two different brokers who both use Gmail are not
 * one broker, and merging them would be worse than leaving them apart. */
const FREE_MAIL = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'mail.ru',
  'yandex.ru',
])

/** The company part of an email address: Tyler.Simpson@chrobinson.com → chrobinson.com.
 * null for webmail and for anything that isn't an address. */
export function emailDomain(email: string | null): string | null {
  const d = (email ?? '').split('@')[1]?.toLowerCase().trim()
  return d && d.includes('.') && !FREE_MAIL.has(d) ? d : null
}

/** Человек со стороны брокера: тот, кто подписал рейт-кон и с кем идёт переписка. */
export type BrokerRep = {
  name: string | null
  email: string | null
  phone: string | null
  loads: number
  /** Последний груз с этим человеком, ISO-дата. */
  lastAt: string | null
}

/**
 * Свести представителей брокера в список без повторов.
 *
 * У крупного брокера каждый груз ведёт свой менеджер, и в грузах остаются пять
 * «Tyler Simpson», три «Jessica Chambers» и один безымянный с общей почты. Карточка
 * компании должна показывать людей, а не пять раз одного и того же.
 *
 * Один человек — это одно ИМЯ, а не одна почта: у C.H. Robinson тот же Tyler Simpson
 * пишет то с «Tyler.Simpson@», то с «SIMPTYL@» — корпоративная почта заведена в двух
 * форматах, и по адресу он двоится. Имени нет — тогда почта. Ни того, ни другого —
 * такой записи в списке не место: пустая строка с одним телефоном ничего не говорит.
 */
export function foldReps(
  rows: { name: string | null; email: string | null; phone: string | null; at: string | null }[],
): BrokerRep[] {
  const by = new Map<string, BrokerRep>()
  for (const r of rows) {
    const key = (r.name ?? '').toLowerCase().trim() || (r.email ?? '').toLowerCase().trim()
    if (!key) continue
    const cur = by.get(key)
    if (cur) {
      cur.loads += 1
      // Пустые поля дозаполняем из других грузов того же человека: в одном рейт-коне
      // есть телефон, в другом — только почта.
      cur.name ??= r.name
      cur.phone ??= r.phone
      cur.email ??= r.email
      if (r.at && (!cur.lastAt || r.at > cur.lastAt)) cur.lastAt = r.at
      continue
    }
    by.set(key, { name: r.name, email: r.email, phone: r.phone, loads: 1, lastAt: r.at })
  }
  // Кто возит больше и свежее — тот и выше: с ним и разговаривать.
  return [...by.values()].sort((a, b) => b.loads - a.loads || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
}
