// Pure helpers + types for the fleet-utilisation heatmap. Deliberately NOT in the
// 'use client' component file: the server page (app/trucks/page.tsx) builds the data
// with buildWorkingDays(), and a function exported from a client module cannot be called
// from the server. Types and pure date maths live here where both sides can reach them.
//
// Дни — строки yyyy-mm-dd по восточному времени, не Date в поясе процесса: сервер
// Hostinger в UTC после 20:00 ET живёт уже завтрашним днём, а шаг в 24 ч от полуночи
// в New York на переводе часов теряет или повторяет день.

import type { LoadStatus, LoadRecord } from './map.ts'
import { daysBetween, isIsoDay, todayEt } from './payments.ts'
import { shiftDay } from './loads-dashboard.ts'

// isPickup/isDelivery mark the trip's endpoints so the grid can draw one load as a
// journey (pickup → in-transit → delivery) instead of a run of identical squares that
// reads as one priced load per day.
export type HeatDayLoad = {
  id: number
  route: string
  rate: number
  status: LoadStatus
  isPickup: boolean
  isDelivery: boolean
}
/** yyyy-mm-dd → the load(s) that covered that day. Presence = working; absence = idle. */
export type HeatRow = {
  id: number
  label: string
  /** Вторая строка в левой колонке — водитель. Номер трака ничего не говорит о
   * том, чья это строка: диспетчер держит в голове людей, а не инвентарные
   * номера. Одной строкой не помещается, колонка узкая по устройству сетки. */
  sub?: string | null
  /** Два правых столбца. Раньше там стояли полоса загрузки и процент отработанных
   * дней — числа, из которых не следует ни одного действия: «43%» не говорит, ни
   * где трак, ни когда он освободится. Теперь там ровно эти два факта. */
  place?: string | null
  when?: { text: string; tone: 'free' | 'busy' | 'off' }
  working: Map<string, HeatDayLoad[]>
}

/** Every yyyy-mm-dd from `from` to `to` inclusive. Spreads a load across the days it ran.
 * Guards a delivery-before-pickup row so a bad date can't spin the loop forever. */
export function daySpan(from: string, to: string): string[] {
  return Array.from({ length: Math.max(0, daysBetween(from, to)) + 1 }, (_, i) => shiftDay(from, i))
}

/** Build the per-day "working" map for one truck from its live loads: each load spans
 * every day from pickup to delivery (fallback pickup+transit, then a single day), and
 * each covered day carries that load's route/id/rate/status for the hover card. Shared
 * by the trucks page and the dashboard so both draw the grid the same way. */
export function buildWorkingDays(loads: LoadRecord[]): Map<string, HeatDayLoad[]> {
  const working = new Map<string, HeatDayLoad[]>()
  for (const l of loads) {
    // Без даты пикапа — день, когда груз завели, по ET.
    const created = Date.parse(l.createdAt)
    const start = l.pickupDate || (Number.isNaN(created) ? null : todayEt(new Date(created)))
    if (!isIsoDay(start)) continue
    // transit_days — DOUBLE: полсуток и больше дают ещё день, как раньше от полудня.
    const end = l.deliveryDate || shiftDay(start, Math.max(0, Math.round((l.transitDays ?? 1) - 1)))
    const route = `${l.origin ?? '—'} → ${l.destination ?? '—'}`
    const span = daySpan(start, isIsoDay(end) ? end : start)
    span.forEach((k, idx) => {
      // Per-day entry so each cell knows its role in the trip — the pickup day, the
      // delivery day, or a driving day in between.
      const entry: HeatDayLoad = {
        id: l.id,
        route,
        rate: l.rate,
        status: l.status,
        isPickup: idx === 0,
        isDelivery: idx === span.length - 1,
      }
      const arr = working.get(k)
      if (arr) arr.push(entry)
      else working.set(k, [entry])
    })
  }
  return working
}
