// Падения на сервере — в тот же журнал, что и падения в браузере (Админка → «Сбои»,
// таблица app_errors). Без этого чёрный «500 Internal Server Error» (ссылка из письма,
// 10/22/26) не оставлял следа нигде, кроме логов Hostinger, и чинить приходилось вслепую.
// Своё соединение mysql2, а не lib/db: тот помечен 'server-only', а этот файл Next
// собирает вне слоя react-server. Ошибки редки; пауза 10 с — чтобы шквал одинаковых
// падений не выбрал лимит соединений хостинга.
let last = 0

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath?: string; routeType?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.DATABASE_URL) return
  const now = Date.now()
  if (now - last < 10_000) return
  last = now
  try {
    const e = err instanceof Error ? err : new Error(String(err))
    const where = e.stack?.split('\n').slice(1, 4).map((s) => s.trim()).join(' | ') ?? ''
    const message = `[server ${context.routeType ?? ''} ${context.routePath ?? ''}] ${e.name}: ${e.message} @ ${where}`
    const agent = request.headers['user-agent']
    const digest = (err as { digest?: string } | null)?.digest ?? null
    const mysql = await import('mysql2/promise')
    const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 5000 })
    try {
      await conn.execute('INSERT INTO app_errors (company_id, user_id, path, message, digest, agent) VALUES (?, NULL, ?, ?, ?, ?)', [
        'default',
        `${request.method} ${request.path}`.slice(0, 300),
        message.slice(0, 2000),
        digest,
        (Array.isArray(agent) ? agent[0] : agent ?? '').slice(0, 300),
      ])
    } finally {
      await conn.end().catch(() => undefined)
    }
  } catch {
    // журнал — не повод уронить ответ ещё раз
  }
}
