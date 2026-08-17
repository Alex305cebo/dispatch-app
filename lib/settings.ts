// Tiny key-value settings store. Kept dependency-free (no GramJS) so any module
// can read company info / keys without pulling Telegram's Node-only stack.

import { sql } from './db.ts'

export async function getSetting(key: string): Promise<string | null> {
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`
  return (rows[0] as { value: string } | undefined)?.value ?? null
}

/** Several keys in ONE round trip. Neon's HTTP driver spends a full HTTPS request per
 * sql`` call, so seven "parallel" getSetting()s are seven requests — measured at
 * ~58 ms each warm, and getCompany() ran exactly that on every single page render.
 * Missing keys are simply absent from the map. */
export async function getSettings(keys: string[]): Promise<Map<string, string>> {
  const rows = (await sql`SELECT key, value FROM settings WHERE key = ANY(${keys})`) as {
    key: string
    value: string
  }[]
  return new Map(rows.map((r) => [r.key, r.value]))
}

export async function setSetting(key: string, value: string): Promise<void> {
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
            ON CONFLICT (key) DO UPDATE SET value = ${value}`
}

export async function deleteSetting(key: string): Promise<void> {
  await sql`DELETE FROM settings WHERE key = ${key}`
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
