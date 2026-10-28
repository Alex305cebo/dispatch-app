import 'server-only'
import { randomBytes } from 'node:crypto'
import { sql } from '@/lib/db'
import { deleteSetting, setSetting } from '@/lib/settings'
import { listLoads, listTrucks } from '@/lib/loads'
import { currentLoadsByTruck, eldStatus } from '@/lib/map'
import { getCompany } from '@/lib/invoice'
import { cityCoords, routeToPoint } from '@/lib/geo-routing'
import { placeNear } from '@/lib/us-place'
import { placeCity } from '@/lib/place'
import { realDriveMinutes } from '@/lib/trip-eta'
import { etaAt } from '@/lib/fmt'
import { BROKER_MAP_KEY, brokerTokenGate } from '@/lib/broker-map-token'
import {
  BROKER_TOKEN_LEN,
  brokerTruck,
  cityState,
  fuzz,
  makeBrokerToken,
  roundEta,
  type BrokerMapView,
  type BrokerTruck,
} from '@/lib/broker-map-core'

// Карта траков для брокеров: одна ссылка /track/<токен> на всех, без входа. Токен
// выдаёт, перевыпускает и выключает админ (Админка → «Карта для брокеров»). Только
// парк владельца ('default'): у своих кабинетов GPS нет вовсе.
//
// Что уходит наружу — решает lib/broker-map-core.ts (белый список). Здесь — откуда
// берутся цифры, кэш и защита адреса от перебора.

const COMPANY = 'default'

export { brokerMapToken } from '@/lib/broker-map-token'

/** Новая ссылка; старая сразу перестаёт открываться. */
export async function issueBrokerMapToken(): Promise<string> {
  const token = makeBrokerToken(randomBytes(BROKER_TOKEN_LEN))
  await setSetting(BROKER_MAP_KEY, token)
  cache = null
  return token
}

export async function revokeBrokerMapToken(): Promise<void> {
  await deleteSetting(BROKER_MAP_KEY)
  cache = null
}

/** Вид для брокера по токену; null — на всё неверное и на перебор, одинаково. */
export async function brokerMapFor(token: string, ip: string): Promise<BrokerMapView | null> {
  if (!(await brokerTokenGate(token, ip))) return null
  return brokerView()
}

/** Сборка не дешёвая (маршрутизатор по каждому траку) — одна на минуту для всех брокеров. */
let cache: { at: number; view: Promise<BrokerMapView> } | null = null
const CACHE_MS = 60_000

function brokerView(): Promise<BrokerMapView> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.view
  const view = buildView()
  cache = { at: Date.now(), view }
  view.catch(() => {
    if (cache?.view === view) cache = null
  })
  return view
}

type FS = { unit: string; lat: number | null; lng: number | null; drive_status: string | null; updated_at: string | Date }

const ET = 'America/New_York'
const etaText = (min: number, now: number) => etaAt(ET, new Date(roundEta(now + realDriveMinutes(min) * 60_000)))

async function buildView(): Promise<BrokerMapView> {
  const [trucks, loads, fleetRaw, company] = await Promise.all([
    listTrucks(COMPANY),
    listLoads(COMPANY),
    sql`SELECT unit, lat, lng, drive_status, updated_at FROM fleet_status`,
    getCompany(COMPANY),
  ])
  const byUnit = new Map((fleetRaw as FS[]).map((f) => [f.unit, f]))
  const current = currentLoadsByTruck(loads)
  const now = Date.now()
  // «Truck N» — место в парке среди рабочих траков, по id: от обновления к
  // обновлению не скачет. Трак в ремонте или в отпуске брокеру не показываем.
  const working = trucks.filter((t) => !t.unavailable)
  let freshest = 0
  const rows = await Promise.all(
    working.map(async (t, i): Promise<BrokerTruck | null> => {
      const fs = t.number ? byUnit.get(t.number) : undefined
      if (!fs || fs.lat == null || fs.lng == null) return null
      // GPS старше суток — где трак, мы на самом деле не знаем.
      const seen = new Date(fs.updated_at).getTime()
      if (!Number.isFinite(seen) || now - seen > 24 * 3_600_000) return null
      freshest = Math.max(freshest, seen)
      // Всё дальше — от огрублённой точки: и город «рядом», и дорога. Точная координата
      // в расчёт не идёт, поэтому и в линии маршрута её нет.
      const p = fuzz(fs.lat, fs.lng)
      const load = current.get(t.id) ?? null
      const status = !load ? 'available' : load.status === 'in_transit' ? 'loaded' : 'to_pickup'
      const origin = cityState(load?.origin)
      const destination = cityState(load?.destination)
      let pickupEta: string | null = null
      let deliveryEta: string | null = null
      let milesLeft: number | null = null
      let path: [number, number][] = []
      if (load && destination) {
        const [pick, drop] = await Promise.all([
          status === 'to_pickup' && origin ? cityCoords(origin).catch(() => null) : Promise.resolve(null),
          cityCoords(destination).catch(() => null),
        ])
        if (drop) {
          if (pick) {
            const [a, b] = await Promise.all([routeToPoint(p, pick), routeToPoint(pick, drop)])
            if (a && b) {
              pickupEta = etaText(a.etaMin, now)
              deliveryEta = etaText(a.etaMin + b.etaMin, now)
              milesLeft = a.miles + b.miles
              path = [...(a.coords ?? [[p.lat, p.lng], [pick.lat, pick.lng]]), ...(b.coords ?? [[pick.lat, pick.lng], [drop.lat, drop.lng]])]
            }
          } else {
            const leg = await routeToPoint(p, drop)
            if (leg) {
              deliveryEta = etaText(leg.etaMin, now)
              milesLeft = leg.miles
              path = leg.coords ?? [[p.lat, p.lng], [drop.lat, drop.lng]]
            }
          }
        }
      }
      return brokerTruck({
        n: i + 1,
        lat: fs.lat,
        lng: fs.lng,
        near: placeCity(placeNear(p.lat, p.lng)),
        moving: eldStatus(fs.drive_status).tone === 'move',
        status,
        origin,
        destination,
        pickupEta,
        deliveryEta,
        milesLeft,
        path,
      })
    }),
  )
  return {
    carrier: company.name || 'Carrier',
    gpsAgeMin: freshest ? Math.max(0, Math.round((now - freshest) / 60_000)) : null,
    trucks: rows.filter((r): r is BrokerTruck => r !== null),
  }
}
