// Остановки груза: пикапы и выгрузки по порядку рейса.
//
// Рейт-кон бывает с тремя и больше точками (один пикап и две выгрузки, два пикапа
// и одна выгрузка). Раньше груз хранил только «откуда» и «куда», промежуточная
// остановка терялась: ни на карте, ни у водителя, ни в милях. Теперь у груза есть
// список остановок (loads.stops JSONB), а старые колонки origin/destination,
// pickup_*/delivery_* остались КОНЦАМИ рейса — их читают финансы, лейны, отчёты, и
// им всё равно, сколько точек посередине.
//
// Модуль чистый: без базы, с тестами. Всё, что показывает или считает остановки,
// берёт их через stopsFrom(), чтобы старый груз без JSON выглядел как две точки.

import { t, type Locale } from './i18n.ts'

export type StopRole = 'pickup' | 'delivery'

export type LoadStop = {
  /** Порядковый номер в рейсе, с 1. */
  seq: number
  role: StopRole
  /** Название склада (shipper / consignee) — что искать на вывеске. */
  name: string | null
  /** «510 W Frontier Lane, Olathe, KS 66061» — то, что вбивают в навигатор. */
  address: string | null
  /** «Olathe, KS» */
  city: string | null
  /** ISO yyyy-mm-dd */
  date: string | null
  /** Окно как напечатано: «8am-3pm», «09/11/26 Appt 06:00». */
  time: string | null
  /** PU# / PO# / Delivery# этой точки. */
  refs: string[]
}

/** Поля груза, из которых собираются остановки (подмножество LoadRecord). */
export type StopSource = {
  stops?: LoadStop[] | null
  origin: string | null
  destination: string | null
  pickupAddress: string | null
  deliveryAddress: string | null
  pickupDate: string | null
  deliveryDate: string | null
  pickupTime: string | null
  deliveryTime: string | null
}

/** Отметка водителя — то, что нужно, чтобы понять, какая остановка пройдена. */
export type StopEv = { kind: string; at: string; stopSeq?: number | null }

/**
 * Список остановок груза. Есть JSON — он; нет — две точки из старых колонок.
 * `names` — названия складов из текста водителю, только для старых грузов:
 * у JSON-остановок название своё.
 */
export function stopsFrom(load: StopSource, names?: { pickup?: string | null; delivery?: string | null }): LoadStop[] {
  if (load.stops && load.stops.length > 0) return load.stops
  return [
    {
      seq: 1,
      role: 'pickup',
      name: names?.pickup ?? null,
      address: load.pickupAddress,
      city: load.origin,
      date: load.pickupDate,
      time: load.pickupTime,
      refs: [],
    },
    {
      seq: 2,
      role: 'delivery',
      name: names?.delivery ?? null,
      address: load.deliveryAddress,
      city: load.destination,
      date: load.deliveryDate,
      time: load.deliveryTime,
      refs: [],
    },
  ]
}

/** Есть ли в грузе больше двух точек — тогда номера и «через …» имеют смысл. */
export const isMultiStop = (stops: LoadStop[]) => stops.length > 2

/**
 * К какой остановке относится отметка. У новых отметок номер записан; у старых
 * (до остановок) «приехал на погрузку / загрузился» — это первый пикап,
 * «приехал на выгрузку / выгрузился» — последняя выгрузка.
 */
export function eventSeq(e: StopEv, stops: LoadStop[]): number | null {
  if (e.stopSeq != null) return e.stopSeq
  if (e.kind === 'arrived_pickup' || e.kind === 'loaded') return stops.find((s) => s.role === 'pickup')?.seq ?? null
  if (e.kind === 'arrived_delivery' || e.kind === 'delivered')
    return [...stops].reverse().find((s) => s.role === 'delivery')?.seq ?? null
  return null
}

const doneKind = (role: StopRole) => (role === 'pickup' ? 'loaded' : 'delivered')
const arriveKind = (role: StopRole) => (role === 'pickup' ? 'arrived_pickup' : 'arrived_delivery')

/** Остановка пройдена: есть «загрузился» / «выгрузился» на неё. */
export function isDone(stop: LoadStop, events: StopEv[], stops: LoadStop[]): boolean {
  return events.some((e) => e.kind === doneKind(stop.role) && eventSeq(e, stops) === stop.seq)
}

/** Последняя отметка «приехал» на эту остановку, если водитель ещё не уехал. */
export function arrivedAt(stop: LoadStop, events: StopEv[], stops: LoadStop[]): StopEv | null {
  const mine = events.filter((e) => eventSeq(e, stops) === stop.seq)
  const arr = [...mine].reverse().find((e) => e.kind === arriveKind(stop.role)) ?? null
  if (!arr) return null
  const left = mine.some((e) => e.kind === doneKind(stop.role) && Date.parse(e.at) >= Date.parse(arr.at))
  return left ? null : arr
}

/** Первая непройденная остановка — куда ехать сейчас. Все пройдены — null. */
export function nextOpenStop(stops: LoadStop[], events: StopEv[]): LoadStop | null {
  return stops.find((s) => !isDone(s, events, stops)) ?? null
}

/** «3 остановки» */
export function stopsLabel(stops: LoadStop[], locale: Locale): string {
  return t(locale, 'stops.count').replace('{n}', String(stops.length))
}

/** «через Omaha, NE» — города между первой и последней точкой; null у двухточечного. */
export function viaLabel(stops: LoadStop[], locale: Locale): string | null {
  const mid = stops
    .slice(1, -1)
    .map((s) => s.city)
    .filter((c): c is string => !!c)
  return mid.length ? t(locale, 'stops.via').replace('{cities}', mid.join(', ')) : null
}

/** Подпись остановки: «Пикап», «Выгрузка 2» — номер только если таких несколько. */
export function stopTitle(stop: LoadStop, stops: LoadStop[], locale: Locale): string {
  const same = stops.filter((s) => s.role === stop.role)
  const base = t(locale, stop.role === 'pickup' ? 'stops.pickup' : 'stops.delivery')
  if (same.length < 2) return base
  return `${base} ${same.indexOf(stop) + 1}`
}

/** Первые часы:минуты из окна («8am-3pm» → 8:00, «Appt 06:00» → 6:00) для сортировки партиалов. */
export function firstMinutes(time: string | null): number {
  if (!time) return 24 * 60
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(time)
  if (!m) return 24 * 60
  let h = Number(m[1])
  const mm = Number(m[2] ?? 0)
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h * 60 + mm
}

export type MergedStop = LoadStop & { loadId: number; ref: string | null; broker: string | null }

/**
 * Партиалы: остановки нескольких грузов одной лентой — по дате, потом по времени
 * окна, потом по грузу и порядку. Водитель видит, куда ехать дальше, не выбирая
 * между двумя страницами.
 */
export function mergeStops(
  loads: (StopSource & { id: number; referenceId: string | null; brokerName: string | null })[],
): MergedStop[] {
  const all: MergedStop[] = []
  for (const l of loads)
    for (const s of stopsFrom(l)) all.push({ ...s, loadId: l.id, ref: l.referenceId, broker: l.brokerName })
  if (loads.length < 2) return all
  return all.sort((a, b) => {
    const da = a.date ?? '9999',
      db = b.date ?? '9999'
    if (da !== db) return da < db ? -1 : 1
    // Один город в один день: сначала ВЫГРУЗКА, потом погрузка — партиал грузят в
    // место, которое освободилось после разгрузки, и наоборот не бывает. Окна брокеров
    // этот порядок не выражают: у промежуточной выгрузки окна может не быть вовсе, и
    // она уезжала в конец дня — за погрузку партиала, которой на деле была раньше.
    const city = (c: string | null) => (c ?? '').toLowerCase().trim()
    if (city(a.city) && city(a.city) === city(b.city) && a.role !== b.role) return a.role === 'delivery' ? -1 : 1
    const ta = firstMinutes(a.time),
      tb = firstMinutes(b.time)
    if (ta !== tb) return ta - tb
    if (a.loadId !== b.loadId) return a.loadId - b.loadId
    return a.seq - b.seq
  })
}
