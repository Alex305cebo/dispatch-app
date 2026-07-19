// Pure types + helpers for truck care. NO db import — client components (truck-care)
// use this, so nothing here may pull lib/db (which throws in the browser). Queries
// live in lib/maintenance.ts (server only).

export type TruckMeta = {
  truckId: number
  vin: string | null
  plate: string | null
  year: number | null
  make: string | null
  model: string | null
  oilIntervalMi: number
  oilLastOdometer: number | null
  driverPhone: string | null
  notes: string | null
  hasPhoto: boolean
  registrationExpiry: string | null
  inspectionExpiry: string | null
  insuranceExpiry: string | null
  cdlExpiry: string | null
  medcardExpiry: string | null
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
  eldSeen: string | null
  updatedAt: string
}

/** The five compliance dates as label + ISO date, for the expiry panel. */
export type ExpiryItem = { label: string; date: string; daysLeft: number; tone: 'good' | 'warn' | 'bad' }

export function expiries(meta: TruckMeta | null): ExpiryItem[] {
  if (!meta) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const src: [string, string | null][] = [
    ['Регистрация', meta.registrationExpiry],
    ['Инспекция', meta.inspectionExpiry],
    ['Страховка', meta.insuranceExpiry],
    ['CDL водителя', meta.cdlExpiry],
    ['Медкарта', meta.medcardExpiry],
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
  const tone = milesLeft > 5000 ? 'good' : milesLeft > 1000 ? 'warn' : 'bad'
  return { milesLeft, tone }
}
