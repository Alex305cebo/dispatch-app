// «Куда отправить трак» — раздел «Рынка» (перенесён с «Траков» 18.09.2026:
// вопрос «кому и куда везти» задают здесь, рядом с брокерами, а не на карте парка).
//
// Данные грузит сам и берёт только то, что нужно расчёту: трак, его прицеп, расходы и
// штат, откуда он поедет дальше. Маршруты, погода и GPS-след остались у карты на
// «Траках» — они здесь не нужны и стоили бы секунды на геокодировании.

import { sql } from '@/lib/db'
import { listLoads, listTrucks } from '@/lib/loads'
import { currentLoadsByTruck, truckLabel } from '@/lib/map'
import { fixPlace, placeCity } from '@/lib/place'
import { datCached, datEquipment, stateFromPlace } from '@/lib/dat-market'
import { homeSoon, parseStates } from '@/lib/maintenance-core'
import { brokerCutFromLoads, laneRpmTables } from '@/lib/dat-lanes'
import { emptyTable, type RpmTable } from '@/lib/rpm-bench-core'
import { usdaReeferCached } from '@/lib/usda-truck'
import { usDate } from '@/lib/fmt'
import { todayEt } from '@/lib/payments'
import { companyScope } from '@/lib/session'
import { RoutePlanStandalone } from '@/components/route-plan-standalone'
import type { PlanSnaps, PlanTruck } from '@/components/route-planner'

type FS = { unit: string; location: string | null; lat: number | null; lng: number | null }
type Meta = {
  truck_id: number
  trailer_number: string | null
  home_state: string | null
  home_from: Date | string | null
  home_to: Date | string | null
  avoid_states: string | null
}

export async function RoutePlanSection() {
  const companyId = await companyScope()
  const [trucks, loads, rowsRaw, metaRaw, datSnaps] = await Promise.all([
    listTrucks(companyId),
    listLoads(companyId),
    sql`SELECT unit, location, lat, lng FROM fleet_status`,
    sql`SELECT truck_id, trailer_number, home_state, home_from, home_to, avoid_states FROM truck_meta`,
    // Только кэш: раздел не ждёт живого ответа DAT.
    Promise.all((['VAN', 'REEFER', 'FLATBED'] as const).map(async (eq) => [eq, await datCached(eq)] as const)),
  ])

  // Ставки по самому маршруту (lib/rpm-bench-core.ts): DAT RateView с доски, для
  // рефрижератора — недельный отчёт USDA. Наши Rate Con'ы сюда не идут: это не рынок.
  const [datTables, warpTables, cut, usda] = await Promise.all([
    laneRpmTables(companyId, 'dat').catch((): Record<string, RpmTable> => ({})),
    laneRpmTables(companyId, 'warp').catch((): Record<string, RpmTable> => ({})),
    brokerCutFromLoads(companyId).catch(() => null),
    usdaReeferCached(),
  ])

  // Дата снимка — строкой отсюда и днём по восточному времени: из миллисекунд её
  // посчитали бы ещё и в браузере, в его поясе, а сервер Hostinger живёт в UTC.
  const snaps: PlanSnaps = Object.fromEntries(
    datSnaps.flatMap(([eq, snap]) =>
      snap
        ? [
            [
              eq,
              {
                ...snap,
                date: usDate(todayEt(new Date(snap.at))),
                bench: {
                  dat: datTables[eq] ?? emptyTable(),
                  usda: eq === 'REEFER' ? (usda?.table ?? null) : null,
                  usdaWeek: eq === 'REEFER' && usda?.week ? usDate(usda.week) : null,
                  warp: warpTables[eq] ?? null,
                  cut,
                },
              },
            ],
          ]
        : [],
    ),
  )
  if (!Object.keys(snaps).length) return null

  const rows = (rowsRaw as FS[]).map((r) => ({ ...r, location: fixPlace(r.location, r.lat, r.lng) }))
  const byUnit = new Map(rows.map((r) => [r.unit, r]))
  const meta = metaRaw as Meta[]
  const trailerByTruck = new Map(meta.filter((r) => r.trailer_number).map((r) => [r.truck_id, r.trailer_number!]))
  const profileByTruck = new Map(meta.map((r) => [r.truck_id, r]))
  const iso = (v: Date | string | null) => (!v ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))
  const today = todayEt()
  const currentByTruck = currentLoadsByTruck(loads)

  const planTrucks: PlanTruck[] = trucks.map((t) => {
    const fs = t.number ? byUnit.get(t.number) : undefined
    const load = currentByTruck.get(t.id) ?? null
    const trailer = trailerByTruck.get(t.id)
    // Город, а не строка ELD «1.4mi WNW from Dallas, TX»: в «Стоит в …» она читалась криво.
    const place = load ? load.destination : placeCity(fs?.location ?? null)
    const profile = profileByTruck.get(t.id)
    return {
      id: t.id,
      label: truckLabel(t, trailer),
      series: datEquipment(trailer) ?? 'VAN',
      settings: {
        mpg: t.mpg,
        fuelPricePerGallon: t.fuelPricePerGallon,
        driverPay: t.driverPay,
        truckPaymentPerDay: t.truckPaymentPerDay,
        insurancePerDay: t.insurancePerDay,
        eldPermitsPerDay: t.eldPermitsPerDay,
        maintenanceCostPerMile: t.maintenanceCostPerMile,
        factoringPercent: t.factoringPercent,
        dispatchPercent: t.dispatchPercent,
      },
      state: stateFromPlace(place),
      place,
      busy: !!load,
      until: load?.deliveryDate ?? null,
      ll: !load && fs?.lat != null && fs?.lng != null ? [fs.lat, fs.lng] : null,
      unavailable: t.unavailable,
      homeState: profile?.home_state ?? null,
      homeBy: homeSoon({ homeFrom: iso(profile?.home_from ?? null), homeTo: iso(profile?.home_to ?? null) }, today),
      avoid: parseStates(profile?.avoid_states),
    }
  })
  if (!planTrucks.length) return null

  return <RoutePlanStandalone trucks={planTrucks} snaps={snaps} />
}
