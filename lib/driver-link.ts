import { randomBytes } from 'node:crypto'
import { sql } from '@/lib/db'
import { getSetting, setSetting } from '@/lib/settings'
import { isDriverToken, shortToken, unitSlug } from './driver-token'

/**
 * Ссылка для водителя — страница /d/<token> без логина и без приложения: его
 * текущий груз, адреса, телефон брокера и три кнопки: «Загрузился», «Выгрузился»,
 * «Фото BOL/POD». Токен — «номер-код» (lib/driver-token.ts), живёт в settings под двумя
 * ключами (трак → токен и токен → трак), чтобы искать в обе стороны одним чтением.
 * Перевыпуск токена (если ссылка утекла) — просто новая пара ключей.
 */
export async function driverTokenFor(truckId: number): Promise<string> {
  const have = await getSetting(`driver_link:${truckId}`)
  // Короткая уже есть — она и постоянная.
  if (have && have.includes('-')) return have
  // Первый выпуск или замена старой длинной на короткую. Старый токен НЕ удаляем:
  // разосланные ссылки продолжают открываться, водителям ничего заново не шлют.
  const rows = (await sql`SELECT number FROM trucks WHERE id = ${truckId}`) as { number: string | null }[]
  const token = shortToken(unitSlug(rows[0]?.number, truckId), randomBytes(6))
  await setSetting(`driver_link:${truckId}`, token)
  await setSetting(`driver_token:${token}`, String(truckId))
  return token
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
