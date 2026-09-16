// Справочник складов — из того, что уже есть: остановки прошлых грузов (lib/stops.ts)
// и отметки водителя (load_events). Идея из AscendTMS: адрес пикапа/выгрузки — это
// профиль с историей, а не строка, которую печатают заново в каждом грузе. Мы возим на
// одни и те же склады: сколько раз были, сколько там стояли, был ли детеншн и «как
// заехать» с прошлого раза — всё это считается отсюда, без новой таблицы. Заметка
// диспетчера о складе (часы, ворота) — одна строка в settings по ключу facilityNoteKey.
//
// Чисто, без базы — см. facilities.test.ts.

import { stopsFrom, type LoadStop, type StopEv, type StopSource } from './stops.ts'
import { stopWindows } from './detention.ts'

export type Facility = {
  key: string
  name: string | null
  address: string | null
  city: string | null
  /** Сколько раз были (по грузам). */
  visits: number
  loadIds: number[]
  /** Последний визит, yyyy-mm-dd. */
  lastDate: string | null
  /** Законченные стоянки у склада, минуты. */
  dwell: number[]
  /** Стоянок дольше бесплатного времени. */
  detentions: number
  /** «Как заехать» с последнего груза, где это было записано. */
  directions: string | null
}

export type FacilityLoad = StopSource & { id: number; status: string; createdAt: string }

/** Ключ склада: адрес без пунктуации и регистра; без адреса — название + город. */
export function facilityKey(stop: Pick<LoadStop, 'address' | 'name' | 'city'>): string | null {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9Ѐ-ӿ]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  const addr = stop.address ? norm(stop.address) : ''
  if (addr.length >= 6) return addr.slice(0, 80)
  const name = stop.name ? norm(stop.name) : ''
  const city = stop.city ? norm(stop.city) : ''
  return name && city ? `${name} | ${city}` : null
}

/** Ключ заметки о складе в settings. */
export const facilityNoteKey = (key: string) => `facility_note:${key}`

/** Средняя стоянка, минуты; null без законченных стоянок. */
export const avgDwell = (f: Facility): number | null =>
  f.dwell.length ? Math.round(f.dwell.reduce((s, m) => s + m, 0) / f.dwell.length) : null

/**
 * Индекс складов по грузам. Черновики и отменённые не считаются — там никто не был.
 * `freeHr` — бесплатное время по условиям (lib/settings detentionTerms), от него детеншн.
 */
export function facilityIndex(loads: FacilityLoad[], eventsByLoad: Map<number, StopEv[]>, freeHr = 2): Map<string, Facility> {
  const out = new Map<string, Facility>()
  const names = new Map<string, Map<string, number>>()
  // Свежие грузы первыми — «как заехать» берётся с последнего.
  const sorted = [...loads]
    .filter((l) => l.status !== 'quoted' && l.status !== 'cancelled')
    .sort((a, b) => (b.pickupDate ?? b.createdAt).localeCompare(a.pickupDate ?? a.createdAt))
  for (const load of sorted) {
    const stops = stopsFrom(load)
    const windows = stopWindows(eventsByLoad.get(load.id) ?? [], stops)
    for (const s of stops) {
      const key = facilityKey(s)
      if (!key) continue
      let f = out.get(key)
      if (!f) {
        f = { key, name: null, address: s.address, city: s.city, visits: 0, loadIds: [], lastDate: null, dwell: [], detentions: 0, directions: null }
        out.set(key, f)
      }
      if (!f.loadIds.includes(load.id)) {
        f.visits++
        f.loadIds.push(load.id)
      }
      const date = s.date ?? load.pickupDate
      if (date && (!f.lastDate || date > f.lastDate)) f.lastDate = date
      if (s.name) {
        const n = names.get(key) ?? new Map<string, number>()
        n.set(s.name, (n.get(s.name) ?? 0) + 1)
        names.set(key, n)
      }
      if (!f.address && s.address) f.address = s.address
      if (!f.city && s.city) f.city = s.city
      if (!f.directions && s.directions?.trim()) f.directions = s.directions.trim()
      const w = windows.find((x) => x.seq === s.seq && x.endIso)
      if (w) {
        f.dwell.push(w.min)
        if (w.min >= freeHr * 60) f.detentions++
      }
    }
  }
  // Название — самое частое: у одного склада в рейт-конах бывает и «Home Depot DC», и «HD 5432».
  for (const [key, n] of names) out.get(key)!.name = [...n].sort((a, b) => b[1] - a[1])[0]![0]
  return out
}

/** Склады, где были не по этому грузу, — для подсказок на его карточке. */
export function facilitiesForLoad(index: Map<string, Facility>, load: StopSource & { id: number }): { stop: LoadStop; facility: Facility }[] {
  const out: { stop: LoadStop; facility: Facility }[] = []
  for (const stop of stopsFrom(load)) {
    const key = facilityKey(stop)
    const f = key ? index.get(key) : undefined
    if (!f) continue
    const others = f.loadIds.filter((id) => id !== load.id).length
    if (others > 0) out.push({ stop, facility: { ...f, visits: others } })
  }
  return out
}

/** Поиск по справочнику: название, адрес, город. */
export function filterFacilities(list: Facility[], q: string): Facility[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return list
  return list.filter((f) => [f.name, f.address, f.city].some((v) => v?.toLowerCase().includes(needle)))
}
