// Tiny key-value settings store. Kept dependency-free (no GramJS) so any module
// can read company info / keys without pulling Telegram's Node-only stack.

import { sql } from './db.ts'

export async function getSetting(key: string): Promise<string | null> {
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`
  return (rows[0] as { value: string } | undefined)?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
            ON CONFLICT (key) DO UPDATE SET value = ${value}`
}
