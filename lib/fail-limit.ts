// Счётчик неудачных попыток по ключу (адресу) — в памяти процесса, без базы.
//
// Зачем: ссылка водителя /d/<токен> открывается без входа, и единственная защита —
// то, что код в ней не угадать. Перебор упирается в число попыток: после `max`
// промахов за `windowMs` адрес получает отказ на ВСЁ, в том числе на верный токен,
// иначе «отказ / не отказ» сам стал бы подсказкой.
//
// В памяти, а не в базе: процесс один (Hostinger), а после перезапуска счётчик
// обнуляется — это цена отсутствия записи в базу на каждый промах. Окно
// фиксированное: первое попадание открывает его, по истечении всё с нуля.
//
// Чисто, без Next: тестируется отдельно (lib/fail-limit.test.ts).

export type FailLimiter = {
  /** Адрес сейчас под запретом. */
  blocked(key: string, now?: number): boolean
  /** Записать промах. */
  fail(key: string, now?: number): void
}

export function failLimiter(opts: { max: number; windowMs: number; maxKeys?: number }): FailLimiter {
  const { max, windowMs, maxKeys = 10_000 } = opts
  const hits = new Map<string, { count: number; until: number }>()

  // Память не должна расти от перебора с тысяч адресов: при переполнении выкидываем
  // истёкшие окна, а если и этого мало — самые старые записи (Map помнит порядок).
  function prune(now: number) {
    for (const [k, v] of hits) if (v.until <= now) hits.delete(k)
    while (hits.size >= maxKeys) {
      const first = hits.keys().next().value
      if (first === undefined) break
      hits.delete(first)
    }
  }

  return {
    blocked(key, now = Date.now()) {
      const h = hits.get(key)
      return !!h && h.until > now && h.count >= max
    },
    fail(key, now = Date.now()) {
      const h = hits.get(key)
      if (h && h.until > now) {
        h.count++
        return
      }
      if (!h && hits.size >= maxKeys) prune(now)
      hits.set(key, { count: 1, until: now + windowMs })
    },
  }
}
