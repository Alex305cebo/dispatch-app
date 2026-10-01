// Tiny key-value settings store. Kept dependency-free (no GramJS) so any module
// can read company info / keys without pulling Telegram's Node-only stack.

import { sql } from './db.ts'
import { companySettingKey, isCompanyKey, OWNER_COMPANY, type CompanyId } from './company.ts'

/** Ключ в базе с учётом кабинета (lib/company.ts): реквизиты, заметки, факторинг у
 * каждого кабинета свои. Компанию берём из сессии запроса — так ни одному из десятков
 * мест, читающих co_name или заметку о брокере, не нужно помнить про кабинеты. Вне
 * запроса (фоновые задачи) сессии нет — это компания владельца, как и раньше.
 * company — явно, где сессии нет, а компания известна (страница водителя). */
async function dbKey(key: string, company?: CompanyId): Promise<string> {
  if (!isCompanyKey(key)) return key
  return companySettingKey(key, company ?? (await dbCompany()))
}

/** Тот же заголовок, из которого lib/session.ts берёт компанию; его ставит только
 * middleware (присланный браузером он стирает). Не через session.ts: этот файл
 * импортирует middleware, а session.ts помечен 'server-only'. */
async function dbCompany(): Promise<CompanyId> {
  try {
    const { headers } = await import('next/headers')
    return (await headers()).get('x-company-id') || OWNER_COMPANY
  } catch {
    return OWNER_COMPANY
  }
}

export async function getSetting(key: string, company?: CompanyId): Promise<string | null> {
  const rows = await sql`SELECT value FROM settings WHERE "key" = ${await dbKey(key, company)}`
  return (rows[0] as { value: string } | undefined)?.value ?? null
}

/** Several keys in ONE round trip. Neon's HTTP driver spends a full HTTPS request per
 * sql`` call, so seven "parallel" getSetting()s are seven requests — measured at
 * ~58 ms each warm, and getCompany() ran exactly that on every single page render.
 * Missing keys are simply absent from the map. */
export async function getSettings(keys: string[], company?: CompanyId): Promise<Map<string, string>> {
  if (!keys.length) return new Map()
  // Ответ — под теми ключами, что спросили, а не под ключами базы.
  if (company === undefined && keys.some(isCompanyKey)) company = await dbCompany()
  const back = new Map<string, string>()
  for (const k of keys) back.set(await dbKey(k, company), k)
  const rows = (await sql`SELECT "key", value FROM settings WHERE "key" IN (${[...back.keys()]})`) as {
    key: string
    value: string
  }[]
  return new Map(rows.map((r) => [back.get(r.key) ?? r.key, r.value]))
}

export async function setSetting(key: string, value: string): Promise<void> {
  const k = await dbKey(key)
  await sql`INSERT INTO settings ("key", value) VALUES (${k}, ${value})
            ON DUPLICATE KEY UPDATE value = ${value}`
}

export async function deleteSetting(key: string): Promise<void> {
  await sql`DELETE FROM settings WHERE "key" = ${await dbKey(key)}`
}

/** Личный номер диспетчера — один ключ на пользователя.
 *
 * Не колонка в users: номер есть не у всех и меняется у одного человека, а не у
 * схемы. Тот же приём, что уже применён к ключам Telegram. Живёт здесь, а не в
 * app/actions.ts, потому что в файле с 'use server' каждый экспорт обязан быть
 * async-функцией — синхронный хелпер там роняет сборку. */
export function dispatcherPhoneKey(userId: number): string {
  return `disp_phone:${userId}`
}

/** Условия детеншена компании: settings detention_rate_hr / detention_free_hr,
 * по умолчанию $35 в час после 2 бесплатных — так пишут в большинстве рейт-конов. */
export async function detentionTerms(): Promise<{
  rate: number
  free: number
}> {
  const s = await getSettings(['detention_rate_hr', 'detention_free_hr'])
  const rate = Number(s.get('detention_rate_hr'))
  const free = Number(s.get('detention_free_hr'))
  return {
    rate: Number.isFinite(rate) && rate > 0 ? rate : 35,
    free: Number.isFinite(free) && free >= 0 ? free : 2,
  }
}
