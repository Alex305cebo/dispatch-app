// Подключение к базе для ночных скриптов — с повтором. База на общем хостинге, и с
// раннера GitHub до неё иногда не достучаться с первого раза: 21.09.2026 сбор ставок упал
// на connect ETIMEDOUT, а через час тот же запуск прошёл. Четыре попытки с растущей
// паузой; ошибка входа или «базы нет» повтором не лечится — её отдаём сразу.
import mysql from 'mysql2/promise'

const RETRY = new Set(['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'PROTOCOL_CONNECTION_LOST'])

export async function connect(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await mysql.createConnection({ uri: url, connectTimeout: 20_000 })
    } catch (e) {
      const code = e?.code ?? e?.errors?.[0]?.code
      if (attempt >= 4 || !RETRY.has(code)) throw e
      console.error(`база не ответила (${code}), попытка ${attempt} из 4 — жду ${attempt * 20} с`)
      await new Promise((r) => setTimeout(r, attempt * 20_000))
    }
  }
}
