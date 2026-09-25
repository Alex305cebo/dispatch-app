import { randomBytes } from 'node:crypto'
import { sql } from '@/lib/db'
import { deleteSetting, getSetting, setSetting } from '@/lib/settings'
import { DRIVER_CODE_LEN, isDriverToken, shortToken, unitSlug } from './driver-token'
import { failLimiter, type FailLimiter } from './fail-limit'

/**
 * Ссылка для водителя — страница /d/<token> без логина и без приложения: его
 * текущий груз, адреса, телефон брокера и три кнопки: «Загрузился», «Выгрузился»,
 * «Фото BOL/POD». Токен — «номер-код» (lib/driver-token.ts), живёт в settings под двумя
 * ключами (трак → токен и токен → трак), чтобы искать в обе стороны одним чтением.
 * Перевыпуск (если ссылка утекла) — newDriverToken: старые ключи удаляются, выдаётся
 * новая пара. Сам по себе токен не перевыпускается никогда: водитель открывает
 * ссылку каждый день, и молча сломать её нельзя.
 */
export async function driverTokenFor(truckId: number): Promise<string> {
  const have = await getSetting(`driver_link:${truckId}`)
  // Короткая уже есть — она и постоянная.
  if (have && have.includes('-')) return have
  // Первый выпуск или замена старой длинной на короткую. Старый токен НЕ удаляем:
  // разосланные ссылки продолжают открываться, водителям ничего заново не шлют.
  return issueToken(truckId)
}

async function issueToken(truckId: number): Promise<string> {
  const rows = (await sql`SELECT number FROM trucks WHERE id = ${truckId}`) as { number: string | null }[]
  const token = shortToken(unitSlug(rows[0]?.number, truckId), randomBytes(DRIVER_CODE_LEN))
  await setSetting(`driver_link:${truckId}`, token)
  await setSetting(`driver_token:${token}`, String(truckId))
  return token
}

/**
 * «Новая ссылка»: все прежние ссылки этого трака перестают открываться, выдаётся
 * новая. Удаляются ВСЕ токены трака, а не только текущий: при переходе с длинных
 * ссылок на короткие старый длинный токен оставляли живым, и он тоже ведёт сюда.
 */
export async function newDriverToken(truckId: number): Promise<string> {
  await sql`DELETE FROM settings WHERE "key" LIKE 'driver_token:%' AND value = ${String(truckId)}`
  await deleteSetting(`driver_link:${truckId}`)
  return issueToken(truckId)
}

// Промахи по токену — с одного адреса не больше 30 за 10 минут (lib/fail-limit.ts).
// На globalThis: страница и обработчик собираются в разные куски сборки, а счётчик
// должен быть один на процесс.
const g = globalThis as typeof globalThis & { __driverTokenFails?: FailLimiter }
const fails = (g.__driverTokenFails ??= failLimiter({ max: 30, windowMs: 10 * 60_000 }))

/** Адрес того, кто пришёл по ссылке: первый в X-Forwarded-For (его ставит прокси
 * хостинга), как и везде в приложении (журнал входов, удалений). */
export function clientIp(h: Headers): string {
  return (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || h.get('x-real-ip') || 'unknown'
}

/**
 * Трак по токену для запроса без сессии (страница водителя и её обработчик), со
 * счётом промахов по адресу. 'limited' — с этого адреса промахов слишком много, и
 * токен даже не проверяется: иначе ответ на верный токен выдал бы его перебором.
 */
export async function truckForDriverRequest(token: string, ip: string): Promise<DriverTruck | null | 'limited'> {
  if (fails.blocked(ip)) return 'limited'
  const truck = await truckByDriverToken(token)
  if (!truck) fails.fail(ip)
  return truck
}

export type DriverTruck = {
  id: number
  companyId: 'default' | 'demo'
  number: string | null
  driverName: string | null
}

/** Трак по токену. Неизвестный или кривой токен — null, без исключений. */
export async function truckByDriverToken(token: string): Promise<DriverTruck | null> {
  token = token.toLowerCase()
  if (!isDriverToken(token)) return null
  const id = await getSetting(`driver_token:${token}`)
  if (!id) return null
  const rows = (await sql`SELECT id, company_id, number, driver_name FROM trucks WHERE id = ${Number(id)}`) as {
    id: number
    company_id: 'default' | 'demo'
    number: string | null
    driver_name: string | null
  }[]
  const r = rows[0]
  return r ? { id: r.id, companyId: r.company_id, number: r.number, driverName: r.driver_name } : null
}
