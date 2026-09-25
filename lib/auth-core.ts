// Чистая часть входа — без базы, чтобы проверяться тестом (lib/auth-core.test.ts):
// хеш пароля, хеш токена сессии, правила замка на подбор.
//
// Только Web Crypto (crypto.subtle, crypto.getRandomValues): lib/auth.ts, который
// отсюда берёт, импортируется из middleware.ts, а там node:crypto может не быть.

/** Новые хеши паролей. OWASP с 2023 года советует для PBKDF2-SHA256 от 600 000;
 * старые «соль:хеш» были сделаны на 100 000 и проверяются по-прежнему (см. ниже). */
export const PBKDF2_ITERATIONS = 600_000
/** Сколько было в хешах без числа итераций — формат «соль:хеш». */
const LEGACY_ITERATIONS = 100_000

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** Разбор users.password_hash / recovery_hash. Два формата:
 *   «итерации:соль:хеш» — всё, что записано начиная с этой правки;
 *   «соль:хеш»          — старые, на 100 000 итераций.
 * Число итераций берётся только из разумного диапазона: строка из базы — не повод
 * крутить PBKDF2 миллиард раз. */
function parseHash(stored: string): { iterations: number; salt: string; hash: string } | null {
  const parts = stored.split(':')
  if (parts.length === 2) {
    const [salt, hash] = parts
    return salt && hash ? { iterations: LEGACY_ITERATIONS, salt, hash } : null
  }
  if (parts.length === 3) {
    const [it, salt, hash] = parts
    const iterations = Number(it)
    if (!/^\d+$/.test(it!) || iterations < LEGACY_ITERATIONS || iterations > 10_000_000) return null
    return salt && hash ? { iterations, salt, hash } : null
  }
  return null
}

/** "итерации:соль:хеш", соль и хеш в hex — пишется в users.password_hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored)
  if (!parsed) return false
  const hex = toHex(await pbkdf2(password, fromHex(parsed.salt), parsed.iterations))
  if (hex.length !== parsed.hash.length) return false
  // Constant-time compare — a timing difference on early mismatch is a real side
  // channel for a hash comparison, cheap enough to close.
  let diff = 0
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parsed.hash.charCodeAt(i)
  return diff === 0
}

/** Хеш сделан слабее нынешнего — после верной проверки его стоит переписать.
 * Пустой (Google-аккаунт, демо) переписывать нечего. */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false
  const parsed = parseHash(stored)
  return !!parsed && parsed.iterations < PBKDF2_ITERATIONS
}

/**
 * Токен сессии в базе — только его SHA-256.
 *
 * 23.09.2026 полные выгрузки базы неделями лежали в открытом доступе, и в них была
 * таблица sessions с токенами как есть: любой скачавший входил под любым
 * пользователем, пароль не нужен. Теперь в куке — случайный токен, в базе — его
 * хеш: из выгрузки войти нельзя. Соль и PBKDF2 тут не нужны — токен случайный,
 * 244 бита, перебирать по хешу нечего.
 */
export async function hashSessionToken(token: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
}

/**
 * Замок на подбор: сколько попыток и за какое окно.
 * • login — 10 попыток, потом вход по этому email закрыт на 15 минут от последней
 *   пропущенной попытки;
 * • reset — сброс по дате рождения: 5 попыток на email за сутки от первой. Дата —
 *   слабый секрет (десятки тысяч вариантов), поэтому окно длинное.
 */
export const THROTTLE = {
  login: { max: 10, windowSec: 15 * 60, sliding: true },
  reset: { max: 5, windowSec: 24 * 60 * 60, sliding: false },
} as const
export type ThrottleKind = keyof typeof THROTTLE

/** Ключ замка — только email, приведённый к виду, в каком он лежит в users.
 * Не IP: X-Forwarded-For пишет клиент, и замок по нему обходился сменой заголовка. */
export function throttleEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 320)
}

/** Попытка засчитывается ДО проверки пароля, и `fails` — её номер в окне. Пускаем,
 * пока номер не больше лимита: так и сотня одновременных запросов получает ровно
 * `max` проверок, а не «все прошли проверку замка, пока никто не успел ошибиться». */
export function attemptAllowed(kind: ThrottleKind, fails: number): boolean {
  // Не число (база не вернула строку) — отказ: замок, который не смог посчитать,
  // не должен молча открываться.
  return Number.isFinite(fails) && fails <= THROTTLE[kind].max
}
