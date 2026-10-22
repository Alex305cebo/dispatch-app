// Pure types + helpers for truck care. NO db import — client components (truck-care)
// use this, so nothing here may pull lib/db (which throws in the browser). Queries
// live in lib/maintenance.ts (server only).

import { t, type Locale } from './i18n.ts'
import { usDate } from './fmt.ts'
import { stateFromPlace } from './dat-market-core.ts'

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

/** Что планировщик, «Кому искать груз» и цели на главной знают о водителе: домашний
 * штат, когда он дома, цели недели и по ставке, стоп-лист штатов. Всё необязательное —
 * пустой профиль ничего не меняет. */
export type DriverProfile = Pick<
  TruckMeta,
  'homeState' | 'homeFrom' | 'homeTo' | 'weekTargetMiles' | 'weekTargetGross' | 'avoidStates' | 'targetRpm'
>

export const EMPTY_PROFILE: DriverProfile = {
  homeState: null,
  homeFrom: null,
  homeTo: null,
  weekTargetMiles: null,
  weekTargetGross: null,
  avoidStates: [],
  targetRpm: null,
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
  /** Во сколько, «ЧЧ:ММ» по ET; у старых записей нет. */
  doneTime: string | null
  /** Где сделано: сервис, город. */
  shop: string | null
  /** Отмечено как замена масла. */
  isOil: boolean
}

/** Тип записи журнала так, как его видит диспетчер: масло — свой тип, хотя в базе это
 * kind='service' с отметкой is_oil. */
export type ServiceKind = 'oil' | 'repair' | 'service' | 'inspection'
export const SERVICE_KINDS: ServiceKind[] = ['oil', 'repair', 'service', 'inspection']

/** Замена масла? Отметка is_oil — с 10/21/26; старые записи узнаются по названию
 * (кнопка «Масло заменено» писала «Замена масла» / «Oil change» / … на языке диспетчера). */
export function isOilRecord(r: Pick<MaintenanceRecord, 'kind' | 'title' | 'isOil'>): boolean {
  return r.isOil || (r.kind === 'service' && /масл|мастил|oil|aceite|ulei|май ауыс/i.test(r.title))
}

export function serviceKind(r: Pick<MaintenanceRecord, 'kind' | 'title' | 'isOil'>): ServiceKind {
  return isOilRecord(r) ? 'oil' : r.kind
}

/** Новые записи — сверху: день, потом время (без времени — ниже записей того же дня
 * со временем), потом порядок ввода. */
export function byNewest(a: MaintenanceRecord, b: MaintenanceRecord): number {
  return b.doneAt.localeCompare(a.doneAt) || (b.doneTime ?? '').localeCompare(a.doneTime ?? '') || b.id - a.id
}

export type OilCard = {
  /** Последняя записанная замена; null — замен в журнале нет. */
  last: MaintenanceRecord | null
  /** Пробег при последней замене: из записи, иначе из паспорта трака. */
  atOdometer: number | null
  interval: number
  /** Проехано с замены; null — нет текущего пробега или он меньше, чем при замене. */
  since: number | null
  /** Осталось до следующей; меньше нуля — перепробег. */
  left: number | null
  /** Доля интервала, 0–100, для шкалы. */
  pct: number | null
  tone: 'good' | 'warn' | 'bad' | null
}

/** Масло трака одной карточкой: когда и где меняли, при каком пробеге, сколько проехал
 * с тех пор и сколько осталось. Пороги — как у oilStatus. */
export function oilCard(records: MaintenanceRecord[], meta: Pick<TruckMeta, 'oilIntervalMi' | 'oilLastOdometer'> | null, currentOdometer: number | null): OilCard {
  const last = records.filter(isOilRecord).sort(byNewest)[0] ?? null
  const interval = meta?.oilIntervalMi || 25_000
  const atOdometer = last?.odometer ?? meta?.oilLastOdometer ?? null
  const since = atOdometer != null && currentOdometer != null && currentOdometer >= atOdometer ? Math.round(currentOdometer - atOdometer) : null
  const left = since == null ? null : interval - since
  const pct = since == null ? null : Math.min(100, Math.round((since / interval) * 100))
  const tone = left == null ? null : left > 5000 ? 'good' : left > 1000 ? 'warn' : 'bad'
  return { last, atOdometer, interval, since, left, pct, tone }
}

/** Расходы на трак по месяцам за последние n месяцев (до месяца today включительно):
 * [{ month: 'yyyy-mm', total }], старые слева. */
export function costByMonth(records: MaintenanceRecord[], today: string, n = 12): { month: string; total: number }[] {
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  const months: string[] = []
  for (let i = 0; i < n; i++) {
    months.unshift(`${y}-${String(m).padStart(2, '0')}`)
    if (--m === 0) {
      m = 12
      y--
    }
  }
  const sums = new Map(months.map((k) => [k, 0]))
  for (const r of records) {
    const k = r.doneAt.slice(0, 7)
    if (r.cost && sums.has(k)) sums.set(k, sums.get(k)! + r.cost)
  }
  return months.map((month) => ({ month, total: Math.round(sums.get(month)!) }))
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
 * Проверка трака под груз: документы, которые уже истекли или истекут раньше выгрузки
 * (нет её даты — на сегодня), и штаты рейса из стоп-листа водителя. Строки
 * предупреждения, пусто — всё в порядке. Только предупреждение: сохранить груз можно.
 */
export function assignWarnings(
  meta: TruckMeta | null | undefined,
  trip: { places: (string | null | undefined)[]; deliveryDate?: string | null },
  today: string,
  locale: Locale = 'en',
): string[] {
  if (!meta) return []
  const delivery = trip.deliveryDate?.slice(0, 10)
  const until = delivery && delivery > today ? delivery : today
  const docs = expiries(meta, locale)
    .filter((e) => e.date < until)
    .map((e) =>
      t(locale, e.date < today ? 'trucks.assign.expired' : 'trucks.assign.expires')
        .replace('{doc}', e.label)
        .replace('{date}', usDate(e.date)),
    )
  const noGo = [...new Set(trip.places.map(stateFromPlace))].filter((s): s is string => !!s && meta.avoidStates.includes(s))
  return [
    ...(docs.length ? [t(locale, 'trucks.assign.docs').replace('{list}', docs.join(' · '))] : []),
    ...(noGo.length ? [t(locale, 'trucks.assign.noGo').replace('{states}', noGo.join(', '))] : []),
  ]
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

/** Сколько миль в день трак проходит: от самого раннего пробега в журнале (не старше
 * года) до текущего. Меньше недели между точками или нет пробега — null: прогноз
 * по паре дней врёт. */
export function milesPerDay(records: MaintenanceRecord[], currentOdometer: number | null, today: string): number | null {
  if (currentOdometer == null) return null
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`
  const first = records
    .filter((r) => r.odometer != null && r.odometer < currentOdometer && r.doneAt >= yearAgo && r.doneAt < today)
    .sort((a, b) => a.doneAt.localeCompare(b.doneAt))[0]
  if (!first) return null
  const days = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${first.doneAt}T12:00:00Z`)) / 86_400_000
  if (days < 7) return null
  const rate = (currentOdometer - first.odometer!) / days
  return rate > 0 ? rate : null
}

/** Когда масло по календарю: через сколько дней и какого числа (yyyy-mm-dd). */
export function oilDueDate(left: number | null, perDay: number | null, today: string): { days: number; date: string } | null {
  if (left == null || !perDay) return null
  const days = Math.max(0, Math.round(left / perDay))
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return { days, date: d.toISOString().slice(0, 10) }
}
