// Samsara — второй ELD после ZigZag.
//
// Почему по официальному API, а не по ссылке «Live Sharing». Ссылка вида
// cloud.samsara.com/o/<org>/fleet/viewer/<token> — это страница-приложение: данные
// она берёт закрытым GraphQL с CSRF-проверкой, ничего из этого не описано и не
// обещано снаружи. Повторять такое с сервера — значит держаться за чужую кухню,
// которая меняется без предупреждения и без нашего ведома. Один раз вставленный
// токен API надёжнее: он документирован, у него есть права и срок.
//
// Токен создаёт владелец парка: Samsara → Settings → API tokens, право
// «Read Vehicle Statistics». Больше от него ничего не нужно.

import 'server-only'
import { sql } from './db.ts'
import { getSetting } from './settings.ts'
import { logPosition } from './eld.ts'

/** Токен установки: сначала свой из настроек, потом переменная окружения. */
export async function samsaraToken(): Promise<string> {
  const stored = (await getSetting('samsara_token')) ?? ''
  return stored.trim() || (process.env.SAMSARA_TOKEN ?? '').trim()
}

type SamsaraVehicle = {
  id?: string
  name?: string
  gps?: {
    latitude?: number
    longitude?: number
    speedMilesPerHour?: number
    headingDegrees?: number
    time?: string
    reverseGeo?: { formattedLocation?: string }
  }
}

/**
 * Снимок парка: где каждая машина сейчас.
 *
 * Сопоставление с нашими траками — по НАЗВАНИЮ машины в Samsara (`name`), оно же
 * unit. Это то же правило, что у ZigZag, и оно же объясняет, почему трак может не
 * обновиться: в Samsara он называется иначе, чем номер трака у нас. Такой случай
 * возвращается отдельной строкой в errors, а не молчанием.
 */
export async function samsaraSnapshot(): Promise<{ updated: number; errors: string[] } | { error: string }> {
  const token = await samsaraToken()
  if (!token) return { error: 'no_token' }

  const errors: string[] = []
  let updated = 0
  let after: string | null = null
  // Страниц у парка на десяток машин одна, но пагинация есть в ответе, и полагаться
  // на «их всегда мало» — способ однажды потерять половину парка молча.
  for (let page = 0; page < 20; page++) {
    const url =
      'https://api.samsara.com/fleet/vehicles/stats?types=gps' + (after ? `&after=${encodeURIComponent(after)}` : '')
    let body: { data?: SamsaraVehicle[]; pagination?: { endCursor?: string; hasNextPage?: boolean } }
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (r.status === 401 || r.status === 403) return { error: 'bad_token' }
      if (!r.ok) return { error: `samsara ${r.status}` }
      body = await r.json()
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }

    for (const v of body.data ?? []) {
      const unit = (v.name ?? '').trim()
      const g = v.gps
      if (!unit || !g || typeof g.latitude !== 'number' || typeof g.longitude !== 'number') continue
      const desc = g.reverseGeo?.formattedLocation ?? null
      const speed = typeof g.speedMilesPerHour === 'number' ? g.speedMilesPerHour : null
      // «Едет» начинается с 3 mi/h — как и на пути ZigZag: ниже это дрожание GPS
      // на стоянке, и трак «ехал» бы круглые сутки.
      const status = speed !== null && speed > 3 ? `${Math.round(speed)} mi/h` : null
      try {
        await sql`
          INSERT INTO fleet_status (unit, location, lat, lng, drive_status, eld_seen, updated_at)
          VALUES (${unit}, ${desc}, ${g.latitude}, ${g.longitude}, ${status}, ${'samsara'}, now())
          ON CONFLICT (unit) DO UPDATE SET
            location = COALESCE(EXCLUDED.location, fleet_status.location),
            lat = EXCLUDED.lat, lng = EXCLUDED.lng,
            drive_status = COALESCE(EXCLUDED.drive_status, fleet_status.drive_status),
            eld_seen = EXCLUDED.eld_seen, updated_at = now()`
        await logPosition(unit, g.latitude, g.longitude, status, desc)
        updated++
      } catch (e) {
        errors.push(`${unit}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (!body.pagination?.hasNextPage || !body.pagination.endCursor) break
    after = body.pagination.endCursor
  }
  return { updated, errors }
}
