// Форма ссылки для водителя: «2237-k7m3xq9pwd4h» — номер трака и код.
// Чисто, без базы: генерация и проверка формата тестируются отдельно.
//
// Раньше токен был 48 hex-символов, и ссылка не влезала в строку SMS. Номер трака
// в начале — чтобы водитель и диспетчер видели, чья это ссылка.
//
// Код — 12 символов (31¹² ≈ 8·10¹⁷ вариантов). Первые короткие ссылки выдавались
// с 6 символами (≈ 887 млн) — это уже перебирается, если ничем не мешать, поэтому
// промахи по адресу ограничены (lib/fail-limit.ts), а новые ссылки длиннее. Старые
// 6-символьные продолжают открываться: водители ходят по ним каждый день, и менять
// их молча нельзя — только кнопкой «Новая ссылка» у диспетчера.

/** Без 0/O, 1/l/I — их путают, когда диктуют по телефону. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Номер трака как префикс: только буквы и цифры, строчными; пусто → «t<id>». */
export function unitSlug(number: string | null | undefined, truckId: number): string {
  const s = (number ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12)
  return s || `t${truckId}`
}

/** Длина кода в новых ссылках; столько же случайных байтов нужно shortToken. */
export const DRIVER_CODE_LEN = 12

/** «2237-k7m3xq9pwd4h» из случайных байтов (по одному на символ кода). */
export function shortToken(slug: string, bytes: Uint8Array): string {
  if (bytes.length < DRIVER_CODE_LEN) throw new Error(`need ${DRIVER_CODE_LEN} random bytes`)
  let code = ''
  for (let i = 0; i < DRIVER_CODE_LEN; i++) code += ALPHABET[bytes[i]! % ALPHABET.length]
  return `${slug}-${code}`
}

/** Все поколения ссылок: старые 48 hex, «номер-код» с кодом 6 символов (выданные
 * до 25.09.2026) и нынешние с кодом 12. */
export function isDriverToken(token: string): boolean {
  return /^[0-9a-f]{48}$/.test(token) || /^[a-z0-9]{1,12}-(?:[a-z0-9]{6}|[a-z0-9]{12})$/.test(token)
}
