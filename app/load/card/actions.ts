'use server'

// Всё, что страница груза из бота узнаёт о грузе у сервера.
//
// Правило этой страницы не меняется: груз живёт в хеше ссылки, и ставка брокера на
// сервер не уходит. Сюда приходят только города, тип трейлера и то, по чему брокера
// и так проверяют по FMCSA (MC, почта, название). Деньги считаются в браузере.

import { companyScope } from '@/lib/session'
import { datEquipment, datSnapshot, laneMarket, ltHeat, type DatRegion } from '@/lib/dat-market'
import { backhaulBrokers, type BackhaulBroker } from '@/lib/backhaul'
import { laneAvgRpmFor, listLoads, listTrucks } from '@/lib/loads'
import { brokerGradeFor } from '@/lib/brokers'
import { cityCoords } from '@/lib/geo-routing'
import { deadheadEstimate, type LatLng } from '@/lib/geo'
import { fleetStatusByUnit } from '@/lib/maintenance'
import { idleFleet } from '@/lib/idle-fleet'
import { activeAlert, type WeatherAlert } from '@/lib/weather'
import { fuelPlan, type FuelPlan } from '@/lib/fuel-plan'
import type { TruckSettings } from '@/lib/profit'

export type CardMarketSide = {
  state: string
  region: DatRegion | null
  ratio: number | null
  heat: 'hot' | 'warm' | 'cold' | null
}

export type CardMarket = {
  equipment: string
  rpm: number | null
  origin: CardMarketSide | null
  dest: CardMarketSide | null
  fuel: { when: string; price: number } | null
  /** Когда снимок забрали у DAT, мс. */
  at: number
  stale: boolean
}

export type CardTruck = {
  id: number
  label: string
  driverName: string | null
  /** Порожний до погрузки, оценка по прямой ×1.2. null — трак негде поставить на карту. */
  deadheadMi: number | null
  /** Откуда считали: GPS трака сейчас или город выгрузки его текущего груза. */
  from: 'gps' | 'delivery' | null
  free: boolean
  place: string | null
  days: number | null
  unavailable: 'repair' | 'vacation' | null
}

export type CardInsights = {
  demo: boolean
  market: CardMarket | null
  /** Ваш собственный средний $/милю между этими штатами. */
  laneRpm: number | null
  backhaul: { state: string; brokers: BackhaulBroker[] } | null
  brokerGrade: { payGrade: 'good' | 'ok' | 'slow'; payDays: number | null; lateCount: number; paidCount: number } | null
  trucks: CardTruck[]
  weather: { origin: WeatherAlert | null; dest: WeatherAlert | null }
  /** Настройки первого трака — чтобы деньги по статьям считались вашими цифрами. */
  truck: TruckSettings | null
  pickup: LatLng | null
}

const settingsOf = (t: TruckSettings): TruckSettings => ({
  mpg: t.mpg,
  fuelPricePerGallon: t.fuelPricePerGallon,
  driverPay: t.driverPay,
  truckPaymentPerDay: t.truckPaymentPerDay,
  insurancePerDay: t.insurancePerDay,
  eldPermitsPerDay: t.eldPermitsPerDay,
  maintenanceCostPerMile: t.maintenanceCostPerMile,
  factoringPercent: t.factoringPercent,
  dispatchPercent: t.dispatchPercent,
})

// Каждый кусок — отдельно и с запасным null: страница груза не должна падать
// из-за того, что DAT, погода или база ответили медленно или с ошибкой.
const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await p
  } catch {
    return fallback
  }
}

export async function cardInsights(input: {
  origin: string | null
  destination: string | null
  equipment: string | null
  brokerMc: string | null
  brokerEmail: string | null
  brokerName: string | null
  force?: boolean
}): Promise<CardInsights> {
  const companyId = await companyScope()
  const eq = datEquipment(input.equipment)

  const [snap, laneRpm, backhaul, brokerGrade, trucks, loads, fleet, pickup, drop] = await Promise.all([
    eq ? safe(datSnapshot(eq, { force: input.force }), null) : Promise.resolve(null),
    safe(laneAvgRpmFor(companyId, input.origin, input.destination, 0), null),
    safe(backhaulBrokers(companyId, input.destination), null),
    safe(brokerGradeFor(companyId, input.brokerMc, input.brokerEmail, input.brokerName), null),
    safe(listTrucks(companyId), []),
    safe(listLoads(companyId), []),
    safe(fleetStatusByUnit(), new Map()),
    input.origin ? safe(cityCoords(input.origin), null) : Promise.resolve(null),
    input.destination ? safe(cityCoords(input.destination), null) : Promise.resolve(null),
  ])

  let market: CardMarket | null = null
  if (snap && eq) {
    const lane = laneMarket(snap, input.origin, input.destination)
    const side = (s: typeof lane.origin): CardMarketSide | null =>
      s ? { state: s.state, region: s.region, ratio: s.lt?.ratio ?? null, heat: s.lt ? ltHeat(snap, s.lt.ratio) : null } : null
    market = {
      equipment: eq,
      rpm: lane.rpm,
      origin: side(lane.origin),
      dest: side(lane.dest),
      fuel: snap.fuel,
      at: snap.at,
      stale: snap.stale,
    }
  }

  // Кому отдать груз. Свободный трак считаем от его GPS, занятый — от города выгрузки
  // текущего груза: он окажется там, когда освободится. Порожний — оценка по прямой
  // ×1.2, без маршрутизатора: трак на каждый груз гонять через OSRM дорого, а для
  // «кто ближе» точности хватает.
  const placeByTruck = new Map<number, string | null>()
  for (const t of trucks) placeByTruck.set(t.id, t.number ? (fleet.get(t.number)?.location ?? null) : null)
  // idleFleet синхронная: обёртка safe() её исключение не поймала бы.
  let rows: ReturnType<typeof idleFleet> = []
  try {
    rows = idleFleet(trucks, loads, placeByTruck)
  } catch {
    rows = []
  }
  const geoCache = new Map<string, LatLng | null>()
  const ranked: CardTruck[] = []
  for (const r of rows) {
    const t = trucks.find((x) => x.id === r.truckId)
    if (!t) continue
    const gps = t.number ? fleet.get(t.number) : undefined
    let from: CardTruck['from'] = null
    let at: LatLng | null = null
    if (r.free && gps?.lat != null && gps?.lng != null) {
      at = { lat: gps.lat, lng: gps.lng }
      from = 'gps'
    } else if (r.place && ranked.length < 12) {
      if (!geoCache.has(r.place)) geoCache.set(r.place, await safe(cityCoords(r.place), null))
      at = geoCache.get(r.place) ?? null
      from = at ? 'delivery' : null
    }
    ranked.push({
      id: t.id,
      label: [t.number ? `#${t.number}` : null, t.name].filter(Boolean).join(' · '),
      driverName: t.driverName,
      deadheadMi: pickup && at ? Math.round(deadheadEstimate(at, pickup)) : null,
      from,
      free: r.free,
      place: r.place,
      days: r.days,
      unavailable: r.unavailable,
    })
  }
  ranked.sort((a, b) => {
    const rank = (x: CardTruck) => (x.unavailable ? 2 : x.free ? 0 : 1)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return (a.deadheadMi ?? 1e9) - (b.deadheadMi ?? 1e9)
  })

  const [wxOrigin, wxDest] = await Promise.all([
    pickup ? safe(activeAlert(pickup.lat, pickup.lng), null) : Promise.resolve(null),
    drop ? safe(activeAlert(drop.lat, drop.lng), null) : Promise.resolve(null),
  ])

  return {
    demo: companyId === 'demo',
    market,
    laneRpm,
    backhaul,
    brokerGrade,
    trucks: ranked.slice(0, 6),
    weather: { origin: wxOrigin, dest: wxDest },
    truck: trucks[0] ? settingsOf(trucks[0]) : null,
    pickup,
  }
}

/** Дизель по пути — по линии маршрута, как на странице настоящего груза. Точки
 * приходят прореженными: штаты по ним определяются так же точно, а запрос лёгкий. */
export async function cardFuelPlan(coords: [number, number][]): Promise<FuelPlan | null> {
  if (!Array.isArray(coords) || coords.length < 2) return null
  const clean = coords
    .filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .slice(0, 400) as [number, number][]
  return safe(fuelPlan(clean), null)
}
