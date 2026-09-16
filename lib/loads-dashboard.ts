// Чистые расчёты страницы «Грузы»: расчётная неделя, занятость парка, ближайшая
// остановка и стыковка рейсов. Без базы — см. loads-dashboard.test.ts.

import type { LoadPriority, LoadRecord, TruckRecord } from './map.ts'
import { usDate } from './fmt.ts'
import type { MsgKey } from './i18n.ts'
import { stopsFrom, nextOpenStop, firstMinutes, lastMinutes, arrivedAt, type LoadStop, type StopEv } from './stops.ts'
import { zonedMs } from './trip-eta.ts'
import { zoneForPlace } from './us-zones.ts'

/** Локальная дата yyyy-mm-dd. Не через toISOString (UTC): вечерний груз уезжал бы на завтра. */
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function shiftDay(iso: string, n: number): string {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() + n)
  return isoDay(date)
}

export { weekStartIso } from './fmt.ts'

export const confirmed = (l: LoadRecord) => l.status !== 'quoted' && l.status !== 'cancelled'
const isOpen = (l: LoadRecord) => l.status === 'booked' || l.status === 'in_transit'

/** Неделя с дня `from`: суммы по дате пикапа, трако-дни по интервалу пикап–выгрузка. */
export function weekStats(loads: LoadRecord[], trucks: TruckRecord[], from: string) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(from, i))
  const buckets = days.map((day) => {
    const rows = loads.filter((l) => l.pickupDate === day && l.status !== 'cancelled')
    return {
      day,
      rows,
      gross: rows.filter(confirmed).reduce((s, l) => s + l.rate, 0),
      // Заявки отдельно: их ещё не подтвердили, и в сумму недели им нельзя.
      quoted: rows.filter((l) => l.status === 'quoted').reduce((s, l) => s + l.rate, 0),
    }
  })
  const rows = buckets.flatMap((b) => b.rows).filter(confirmed)
  const gross = rows.reduce((s, l) => s + l.rate, 0)
  const miles = rows.reduce((s, l) => s + l.loadedMiles + l.deadheadMiles, 0)

  // Ёмкость — только траки в строю: ремонту и отпуску груз всё равно не искать.
  const available = trucks.filter((tr) => !tr.unavailable)
  // Груз занимает трак с пикапа по выгрузку; без даты выгрузки — один день. Рейс,
  // переходящий через границу недели, занимает дни в обеих.
  const covers = (l: LoadRecord, day: string) =>
    confirmed(l) && !!l.pickupDate && l.pickupDate <= day && (l.deliveryDate ?? l.pickupDate) >= day
  // Трако-день считается один раз, сколько бы грузов (партиалов) ни ехало в этот день.
  const coverage = available.map((tr) => ({
    id: tr.id,
    days: days.filter((day) => loads.some((l) => l.truckId === tr.id && covers(l, day))).length,
  }))
  const busy = loads.filter((l) => available.some((tr) => tr.id === l.truckId) && days.some((day) => covers(l, day)))
  const capacity = available.length * 7
  const occupied = coverage.reduce((s, tr) => s + tr.days, 0)
  return {
    buckets,
    rows,
    /** Грузы, занимающие трако-дни этой недели, включая переходящие. */
    busy,
    gross,
    rpm: miles > 0 ? gross / miles : null,
    coverage,
    capacity,
    occupied,
    utilization: capacity ? (occupied / capacity) * 100 : null,
    /** Открытые грузы без даты пикапа: в график и суммы недели они не попадают. */
    missingDates: loads.filter((l) => isOpen(l) && !l.pickupDate).length,
  }
}

/** Куда ехать сейчас: первая непройденная остановка по отметкам водителя. У закрытых
 * грузов остановки нет. */
export function upcomingStop(load: LoadRecord, events: StopEv[] = []): LoadStop | null {
  if (!isOpen(load)) return null
  const stops = stopsFrom(load)
  // Старый груз без отметок: раз он «в пути», погрузка уже была.
  const candidates = !events.length && load.status === 'in_transit' ? stops.filter((s) => s.role === 'delivery') : stops
  return nextOpenStop(candidates, events)
}

export type LateStop = { stop: LoadStop; minutes: number }

/**
 * «Опаздывает»: окно ближайшей остановки закрылось (по поясу её штата), а трак там не
 * был — ни отметки водителя «приехал», ни GPS у точки. Как Running late в Alvys: не
 * ETA, а факт, что срок прошёл и никто ничего не отметил. Минуты — на сколько прошло.
 */
export function lateStop(load: LoadRecord, events: StopEv[], nowMs: number): LateStop | null {
  const stop = upcomingStop(load, events)
  if (!stop?.date) return null
  const stops = stopsFrom(load)
  if (arrivedAt(stop, events, stops)) return null
  // GPS-приезд пишется только на первый пикап и последнюю выгрузку.
  if (stop.role === 'pickup' && stop.seq === stops[0]?.seq && load.pickupArrivedAt) return null
  if (stop.role === 'delivery' && stop.seq === stops[stops.length - 1]?.seq && load.deliveryArrivedAt) return null
  const zone = zoneForPlace(stop.city) ?? zoneForPlace(stop.address) ?? 'America/Chicago'
  const end = zonedMs(stop.date, lastMinutes(stop.time), zone)
  if (end == null) return null
  const minutes = Math.round((nowMs - end) / 60_000)
  return minutes > 0 ? { stop, minutes } : null
}

export const PRIORITY_KEY: Record<LoadPriority, MsgKey> = {
  caution: 'loads.priority.caution',
  important: 'loads.priority.important',
  critical: 'loads.priority.critical',
}

/** Вес флага для сортировки: critical выше important выше caution; без флага — 0. */
export function priorityRank(p: LoadPriority | null | undefined): number {
  return p === 'critical' ? 3 : p === 'important' ? 2 : p === 'caution' ? 1 : 0
}

/** Момент остановки для сортировки: без времени — конец дня, без даты — в самый конец. */
export function stopOrder(stop: LoadStop | null | undefined): number {
  if (!stop?.date) return Infinity
  return Date.parse(`${stop.date}T00:00:00`) + firstMinutes(stop.time) * 60000
}

/** «09/12/26 · 8am-3pm». Окно из рейт-кона часто уже несёт дату («09/12/26 06:30 FCFS»),
 * тогда второй раз она не пишется. Пустые подписи пропускаются. */
export function whenText(date: string | null, time: string | null, noDate: string, noTime: string): string {
  const day = usDate(date)
  const slot = time?.trim()
  if (slot && day && slot.includes(day)) return slot
  return [day || noDate, slot || noTime].filter(Boolean).join(' · ')
}

export type Connection = 'unknown' | 'overlap' | 'review'

/** Стыковка текущего и следующего рейса — только сравнение дат. Подача, часовые
 * пояса и часы водителя не считаются, поэтому ответа «успевает» здесь нет. */
export function scheduleConnection(current: LoadRecord, next: LoadRecord): Connection {
  if (!current.deliveryDate || !next.pickupDate) return 'unknown'
  if (next.pickupDate < current.deliveryDate) return 'overlap'
  return 'review'
}
