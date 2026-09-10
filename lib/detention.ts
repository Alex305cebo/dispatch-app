/** Стоимость детеншена: первые `freeHr` часов бесплатно, дальше по `rateHr` в час,
 * с округлением до четверти часа — так считают большинство брокеров. */
export function detentionAmount(min: number, rateHr: number, freeHr: number): number {
  const billable = Math.max(0, min - freeHr * 60)
  return (Math.round((billable / 60) * 4) / 4) * rateHr
}

import { eventSeq, type LoadStop, type StopEv } from './stops.ts'

export type StopEvent = { kind: string; at: string; stopSeq?: number | null }
export type StopWindow = {
  at: 'pickup' | 'delivery'
  sinceIso: string
  endIso: string | null
  min: number
}

/**
 * Стоянка у склада по отметкам водителя: от «Приехал на погрузку» до «Загрузился»
 * (или от «Приехал на выгрузку» до «Выгрузился»). Пока второй отметки нет — идёт
 * до сейчас. Берётся последняя стоянка; выгрузка важнее погрузки, если есть обе.
 * Чисто, без базы — для карточки груза и карточки трака одинаково.
 */
export function stopWindow(events: StopEvent[], now = Date.now()): StopWindow | null {
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  for (const [arrive, leave, at] of [
    ['arrived_delivery', 'delivered', 'delivery'],
    ['arrived_pickup', 'loaded', 'pickup'],
  ] as const) {
    const i = sorted.map((e) => e.kind).lastIndexOf(arrive)
    if (i < 0) continue
    const end = sorted.slice(i + 1).find((e) => e.kind === leave) ?? null
    const from = Date.parse(sorted[i].at)
    const to = end ? Date.parse(end.at) : now
    if (!Number.isFinite(from)) continue
    return {
      at,
      sinceIso: sorted[i].at,
      endIso: end?.at ?? null,
      min: Math.max(0, Math.round((to - from) / 60_000)),
    }
  }
  return null
}

/**
 * Стоянка у КАЖДОЙ остановки (lib/stops.ts): от «приехал» до «загрузился» /
 * «выгрузился» на ней; без второй отметки — до сейчас. У груза с тремя точками
 * окон может быть три; stopWindow выше — старый двухточечный вид того же.
 */
export function stopWindows(
  events: StopEvent[],
  stops: LoadStop[],
  now = Date.now(),
): (StopWindow & { seq: number })[] {
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const out: (StopWindow & { seq: number })[] = []
  for (const st of stops) {
    const mine = sorted.filter((e) => eventSeq(e as StopEv, stops) === st.seq)
    const arrive = st.role === 'pickup' ? 'arrived_pickup' : 'arrived_delivery'
    const leave = st.role === 'pickup' ? 'loaded' : 'delivered'
    const i = mine.map((e) => e.kind).lastIndexOf(arrive)
    if (i < 0) continue
    const end = mine.slice(i + 1).find((e) => e.kind === leave) ?? null
    const from = Date.parse(mine[i]!.at)
    if (!Number.isFinite(from)) continue
    const to = end ? Date.parse(end.at) : now
    out.push({
      seq: st.seq,
      at: st.role,
      sinceIso: mine[i]!.at,
      endIso: end?.at ?? null,
      min: Math.max(0, Math.round((to - from) / 60_000)),
    })
  }
  return out
}
