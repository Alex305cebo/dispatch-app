// Форма ссылки для водителя: «2237-k7m3xq» — номер трака и шесть символов кода.
// Чисто, без базы: генерация и проверка формата тестируются отдельно.
//
// Раньше токен был 48 hex-символов, и ссылка не влезала в строку SMS. Номер трака
// в начале — чтобы водитель и диспетчер видели, чья это ссылка. Код короткий, но
// подобрать его наугад нереально: 31⁶ ≈ 887 млн вариантов на трак, а неверный адрес
// молча даёт «не найдено».

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

/** «2237-k7m3xq» из случайных байтов (по одному на символ кода). */
export function shortToken(slug: string, bytes: Uint8Array): string {
  let code = ''
  for (let i = 0; i < 6; i++) code += ALPHABET[bytes[i]! % ALPHABET.length]
  return `${slug}-${code}`
}

/** Оба поколения ссылок: старые 48 hex и новые «номер-код». */
export function isDriverToken(token: string): boolean {
  return /^[0-9a-f]{48}$/.test(token) || /^[a-z0-9]{1,12}-[a-z0-9]{6}$/.test(token)
}
