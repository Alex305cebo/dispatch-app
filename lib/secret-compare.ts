// Сравнение общих секретов (CRON_SECRET, FLEET_INGEST_TOKEN) без утечки по времени.
//
// Обычное `!==` выходит на первом несовпавшем символе, и по времени ответа секрет
// в принципе подбирается посимвольно. timingSafeEqual сравнивает всегда целиком, но
// требует буферов одной длины — поэтому сравниваем не строки, а их SHA-256: длина
// всегда 32 байта, и заодно не видно, какой длины сам секрет.
//
// Чисто, без базы и без Next: тестируется отдельно (lib/secret-compare.test.ts).

import { createHash, timingSafeEqual } from 'node:crypto'

/** Пустой или отсутствующий секрет не совпадает ни с чем — даже с пустым вводом:
 * незаданная переменная окружения должна держать адрес закрытым. */
export function secretMatches(given: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || given == null) return false
  const a = createHash('sha256').update(given, 'utf8').digest()
  const b = createHash('sha256').update(secret, 'utf8').digest()
  return timingSafeEqual(a, b)
}
