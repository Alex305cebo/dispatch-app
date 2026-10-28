// Проверка токена карты для брокеров (/track/<токен>) — отдельно от lib/broker-map.ts,
// потому что её зовёт и middleware: там не место маршрутизатору и геокодеру.
//
// Middleware отвечает на неверный токен голой 404 ДО страницы. Сама страница так не
// умеет: корневой app/loading.tsx начинает поток раньше, и notFound() уходил бы с
// кодом 200 — снаружи «нет такой ссылки» и «есть» различались бы только телом.

import { getSetting } from './settings.ts'
import { secretMatches } from './secret-compare.ts'
import { failLimiter, type FailLimiter } from './fail-limit.ts'
import { BROKER_TOKEN_RE } from './broker-map-core.ts'

export const BROKER_MAP_KEY = 'broker_map_token'

/** Токен из настроек владельца ('default'); null — ссылка выключена. */
export function brokerMapToken(): Promise<string | null> {
  return getSetting(BROKER_MAP_KEY, 'default')
}

export async function brokerTokenMatches(token: string): Promise<boolean> {
  if (!BROKER_TOKEN_RE.test(token)) return false
  return secretMatches(token, await brokerMapToken())
}

// На globalThis: middleware, страница и обработчик API — разные куски сборки, а
// счётчики должны быть одни на процесс.
const g = globalThis as typeof globalThis & { __brokerMapFails?: FailLimiter; __brokerMapHits?: FailLimiter }
/** Промахи по токену: 20 за 10 минут с адреса — дальше отказ на всё, и на верный токен. */
export const brokerMapFails = (g.__brokerMapFails ??= failLimiter({ max: 20, windowMs: 10 * 60_000 }))
/** Все запросы: страница обновляется раз в 2 минуты, 120 за 10 минут — с огромным запасом. */
export const brokerMapHits = (g.__brokerMapHits ??= failLimiter({ max: 120, windowMs: 10 * 60_000 }))

/** Пускать ли запрос с этого адреса по этому токену; промах и каждый запрос — в счёт. */
export async function brokerTokenGate(token: string, ip: string): Promise<boolean> {
  if (brokerMapFails.blocked(ip) || brokerMapHits.blocked(ip)) return false
  brokerMapHits.fail(ip)
  const ok = await brokerTokenMatches(token).catch(() => false)
  if (!ok) brokerMapFails.fail(ip)
  return ok
}

/** Адрес того, кто пришёл: первый в X-Forwarded-For (его ставит прокси хостинга). */
export function requestIp(h: Headers): string {
  return (h.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || h.get('x-real-ip') || 'unknown'
}
