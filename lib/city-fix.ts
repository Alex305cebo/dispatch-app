// Город по индексу против города по бумаге. Чистый модуль без базы — тестируется голым node.
//
// Брокеры печатают рейт-коны с опечатками: «Ninety Six, NC» (это SC), «Macadonia, OH»
// (Macedonia). Геокодер такой город не находит, и груз из рейт-кона отказывались
// создавать. Почтовый индекс в том же адресе называет ровно одно место и опечаток не
// содержит, поэтому при расхождении верим индексу.

/** Последний пятизначный индекс в адресе — там, где в американском адресе стоит ZIP. */
export function zipOf(address: string | null | undefined): string | null {
  const all = (address ?? '').match(/\b\d{5}\b/g)
  return all?.[all.length - 1] ?? null
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Штат из «City, ST». */
export function stateOfPlace(place: string | null | undefined): string | null {
  const m = /,\s*([A-Za-z]{2})\s*$/.exec((place ?? '').trim())
  return m ? m[1]!.toUpperCase() : null
}

/**
 * Что писать в origin/destination: город с бумаги или город по индексу.
 * Индекс побеждает, когда города нет, когда штат не совпадает, и когда название
 * отличается (опечатка). Совпадают — оставляем как напечатано.
 */
export function pickCity(parsed: string | null | undefined, byZip: string | null | undefined): string | null {
  const p = (parsed ?? '').trim() || null
  const z = (byZip ?? '').trim() || null
  if (!z) return p
  if (!p) return z
  const ps = stateOfPlace(p)
  const zs = stateOfPlace(z)
  if (ps && zs && ps !== zs) return z
  const pc = norm(p.replace(/,\s*[A-Za-z]{2}\s*$/, ''))
  const zc = norm(z.replace(/,\s*[A-Za-z]{2}\s*$/, ''))
  if (pc !== zc) return z
  return p
}
