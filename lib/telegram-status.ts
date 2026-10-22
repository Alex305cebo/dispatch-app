// Подключён ли Telegram у пользователя — только чтение settings, БЕЗ GramJS.
//
// Отдельным файлом, потому что lib/telegram.ts при импорте тянет весь GramJS, а тот —
// пакет websocket с родными модулями. Карточка груза спрашивала здесь одно «да/нет»
// для кнопки «Чат Telegram», а вместе с ним грузила GramJS: если websocket на
// сервере не поднимался, падала не кнопка, а вся страница груза — чёрный
// «500 Internal Server Error» на ЛЮБОМ грузе, даже в демо (10/22/26).

import { getSetting } from './settings'

const k = (base: string, uid: number) => `${base}:${uid}`

export async function tgCreds(uid: number): Promise<{ apiId: number; apiHash: string; session: string } | null> {
  const [id, hash, session] = await Promise.all([
    getSetting(k('tg_api_id', uid)),
    getSetting(k('tg_api_hash', uid)),
    getSetting(k('tg_session', uid)),
  ])
  return id && hash && session ? { apiId: Number(id), apiHash: hash, session } : null
}

export async function tgConnected(uid: number): Promise<boolean> {
  return (await tgCreds(uid)) !== null
}
