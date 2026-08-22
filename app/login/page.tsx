import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { schemaInstalled } from '@/lib/install'
import { LOCALE_COOKIE, resolveLocale } from '@/lib/i18n'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // First run (no accounts yet) gets the "create the admin" form instead of sign-in
  // — the only door in is the one the owner walks through themselves.
  // is_demo excluded — the seeded public-demo account (lib/demo.ts) always exists,
  // and must never make a fresh install think an admin has already been created.
  //
  // Сначала — есть ли вообще схема. На свежей базе таблицы users нет, и прежний
  // запрос ронял эту страницу целиком: клиент вписывал DATABASE_URL и получал 500
  // вместо установки. Исключение отсюда наверх пускаем как есть — «база лежит» не
  // то же самое, что «база пустая», и молча предлагать установку поверх живой базы
  // было бы хуже ошибки.
  const installed = await schemaInstalled()
  const rows = installed ? await sql`SELECT 1 FROM users WHERE is_demo = FALSE LIMIT 1` : []

  // Whether to ask for a language is decided here, server-side, because
  // resolveLocale() answers "en" for anyone who has never chosen — a silent default
  // that a Russian speaker never gets asked about. Reading the cookie here instead of
  // in a client effect also keeps the first paint honest: no flash of the wrong
  // language, and nothing for hydration to disagree about.
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value

  return (
    <LoginForm
      bootstrap={rows.length === 0}
      needsSchema={!installed}
      askLocale={!cookie}
      initialLocale={resolveLocale(cookie)}
    />
  )
}
