// Pure types + helpers for truck care. NO db import — client components (truck-care)
// use this, so nothing here may pull lib/db (which throws in the browser). Queries
// live in lib/maintenance.ts (server only).

import { t, type Locale } from './i18n.ts'

export type TruckMeta = {
  truckId: number
  vin: string | null
  plate: string | null
  trailerNumber: string | null
  year: number | null
  make: string | null
  model: string | null
  oilIntervalMi: number
  oilLastOdometer: number | null
  driverPhone: string | null
  notes: string | null
  hasPhoto: boolean
  /** Загружено ли своё фото трака (truck_meta.truck_photo) — иначе картинка по умолчанию. */
  hasTruckPhoto: boolean
  /** Выбранная готовая картинка (lib/truck-models.ts), если своего фото нет. */
  truckModel: string | null
  registrationExpiry: string | null
  inspectionExpiry: string | null
  insuranceExpiry: string | null
  cdlExpiry: string | null
  medcardExpiry: string | null
  /** Профиль водителя для планировщика — см. DriverProfile. */
  homeState: string | null
  homeFrom: string | null
  homeTo: string | null
  weekTargetMiles: number | null
  weekTargetGross: number | null
  /** Штаты «не возить в…», коды. */
  avoidStates: string[]
  /** Цель по ставке, $/mi гружёных миль, — вписал диспетчер (lib/profit.ts targetVerdict). */
  targetRpm: number | null
}

/** Что планировщик и «Кому искать груз» знают о водителе: домашний штат, когда он дома,
 * цель недели и стоп-лист штатов. Всё необязательное — пустой профиль ничего не меняет. */
export type DriverProfile = Pick<TruckMeta, 'homeState' | 'homeFrom' | 'homeTo' | 'weekTargetMiles' | 'weekTargetGross' | 'avoidStates'>

export const EMPTY_PROFILE: DriverProfile = {
  homeState: null,
  homeFrom: null,
  homeTo: null,
  weekTargetMiles: null,
  weekTargetGross: null,
  avoidStates: [],
}

/** «ny, ca; tx» → ['NY', 'CA', 'TX']: только двухбуквенные коды, без повторов. */
export function parseStates(raw: string | null | undefined): string[] {
  const out: string[] = []
  for (const m of (raw ?? '').toUpperCase().matchAll(/\b([A-Z]{2})\b/g)) if (!out.includes(m[1]!)) out.push(m[1]!)
  return out
}

/** Водитель дома сегодня (today — yyyy-mm-dd)? Возвращает, до какого числа; null — в строю. */
export function homeUntil(p: Pick<DriverProfile, 'homeFrom' | 'homeTo'> | null | undefined, today: string): string | null {
  if (!p?.homeFrom || !p.homeTo) return null
  return p.homeFrom <= today && today <= p.homeTo ? p.homeTo : null
}

/** Домой скоро: отпуск начинается в ближайшие `days` дней — планировщику пора вести к дому.
 * Возвращает дату начала; null — не скоро или дат нет. */
export function homeSoon(p: Pick<DriverProfile, 'homeFrom' | 'homeTo'> | null | undefined, today: string, days = 7): string | null {
  if (!p?.homeFrom) return null
  const from = Date.parse(`${p.homeFrom}T12:00:00`)
  const now = Date.parse(`${today}T12:00:00`)
  const diff = (from - now) / 86_400_000
  return diff >= 0 && diff <= days ? p.homeFrom : null
}

export type MaintenanceRecord = {
  id: number
  truckId: number
  kind: 'repair' | 'service' | 'inspection'
  title: string
  notes: string | null
  cost: number | null
  odometer: number | null
  doneAt: string
}

export type TruckTodo = {
  id: number
  truckId: number
  title: string
  notes: string | null
  priority: 'low' | 'normal' | 'urgent'
  createdAt: string
  doneAt: string | null
}

export type FleetStatus = {
  unit: string
  driverName: string | null
  hosPercent: number | null
  driveStatus: string | null
  location: string | null
  lat: number | null
  lng: number | null
  odometer: number | null
  /** Tank level in percent from the ELD. Null when the device doesn't report one. */
  fuel: number | null
  eldSeen: string | null
  updatedAt: string
}

/** The five compliance dates as label + ISO date, for the expiry panel. */
export type ExpiryItem = { label: string; date: string; daysLeft: number; tone: 'good' | 'warn' | 'bad' }

export function expiries(meta: TruckMeta | null, locale: Locale = 'en'): ExpiryItem[] {
  if (!meta) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const src: [string, string | null][] = [
    [t(locale, 'trucks.expiry.registration'), meta.registrationExpiry],
    [t(locale, 'trucks.expiry.inspection'), meta.inspectionExpiry],
    [t(locale, 'trucks.expiry.insurance'), meta.insuranceExpiry],
    [t(locale, 'trucks.expiry.cdl'), meta.cdlExpiry],
    [t(locale, 'trucks.expiry.medcard'), meta.medcardExpiry],
  ]
  return src
    .filter((x): x is [string, string] => !!x[1])
    .map(([label, date]) => {
      const daysLeft = Math.round((new Date(date).getTime() - today.getTime()) / 86_400_000)
      const tone: 'good' | 'warn' | 'bad' = daysLeft <= 30 ? 'bad' : daysLeft <= 60 ? 'warn' : 'good'
      return { label, date, daysLeft, tone }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/**
 * Oil-change countdown. Needs both the last-change odometer (owner enters it) and
 * a current odometer (ELD when live, else null → unknown).
 */
export function oilStatus(
  meta: TruckMeta | null,
  currentOdometer: number | null,
): { milesLeft: number; tone: 'good' | 'warn' | 'bad' } | null {
  if (!meta?.oilLastOdometer || currentOdometer === null) return null
  const milesLeft = Math.round(meta.oilLastOdometer + meta.oilIntervalMi - currentOdometer)
  // Миль до замены больше самого интервала — значит, одометр сейчас ниже, чем в день
  // прошлой замены. Одометр назад не крутится: показание неверное, считать не из чего.
  if (milesLeft > meta.oilIntervalMi) return null
  const tone = milesLeft > 5000 ? 'good' : milesLeft > 1000 ? 'warn' : 'bad'
  return { milesLeft, tone }
}

/** ELD пишет «12.0mi N from Ashland, VA» — там, где нужен город, берём «Ashland, VA».
 * Раньше эта функция лежала двумя одинаковыми копиями в обзоре и в списке траков. */
export function cityOf(location: string | null | undefined): string | null {
  if (!location) return null
  const m = location.match(/from\s+(.+)$/i)
  return m ? m[1]! : location
}
