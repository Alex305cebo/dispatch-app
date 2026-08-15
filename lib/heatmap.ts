// Pure helpers + types for the fleet-utilisation heatmap. Deliberately NOT in the
// 'use client' component file: the server page (app/trucks/page.tsx) builds the data
// with daysBetween(), and a function exported from a client module cannot be called
// from the server. Types and pure date maths live here where both sides can reach them.

import type { LoadStatus, LoadRecord } from './map.ts'

const DAY_MS = 24 * 60 * 60 * 1000

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
/** dayKey → the load(s) that covered that day. Presence = working; absence = idle. */
export type HeatRow = {
  id: number
  label: string
  /** Вторая строка в левой колонке — водитель. Номер трака ничего не говорит о
   * том, чья это строка: диспетчер держит в голове людей, а не инвентарные
   * номера. Одной строкой не помещается, колонка узкая по устройству сетки. */
  sub?: string | null
  working: Map<string, HeatDayLoad[]>
}

/** Local YYYY-MM-DD — a day boundary in California must not shift a cell one column. */
export function dayKey(d: Date | number): string {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Every dayKey from `from` to `to` inclusive. Spreads a load across the days it ran.
 * Guards a delivery-before-pickup row so a bad date can't spin the loop forever. */
export function daysBetween(from: Date | number, to: Date | number): string[] {
  const a = new Date(from)
  a.setHours(0, 0, 0, 0)
  const b = new Date(to)
  b.setHours(0, 0, 0, 0)
  if (b < a) return [dayKey(a)]
  const out: string[] = []
  for (let ms = a.getTime(); ms <= b.getTime(); ms += DAY_MS) out.push(dayKey(ms))
  return out
}

/** Build the per-day "working" map for one truck from its live loads: each load spans
 * every day from pickup to delivery (fallback pickup+transit, then a single day), and
 * each covered day carries that load's route/id/rate/status for the hover card. Shared
 * by the trucks page and the dashboard so both draw the grid the same way. */
export function buildWorkingDays(loads: LoadRecord[]): Map<string, HeatDayLoad[]> {
  const working = new Map<string, HeatDayLoad[]>()
  for (const l of loads) {
    const startMs = l.pickupDate ? Date.parse(`${l.pickupDate}T12:00:00`) : Date.parse(l.createdAt)
    if (Number.isNaN(startMs)) continue
    const endMs = l.deliveryDate
      ? Date.parse(`${l.deliveryDate}T12:00:00`)
      : startMs + Math.max(0, (l.transitDays ?? 1) - 1) * 24 * 60 * 60 * 1000
    const route = `${l.origin ?? '—'} → ${l.destination ?? '—'}`
    const span = daysBetween(startMs, Number.isNaN(endMs) ? startMs : endMs)
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
