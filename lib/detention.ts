/** Стоимость детеншена: первые `freeHr` часов бесплатно, дальше по `rateHr` в час,
 * с округлением до четверти часа — так считают большинство брокеров. */
export function detentionAmount(min: number, rateHr: number, freeHr: number): number {
  const billable = Math.max(0, min - freeHr * 60)
  return (Math.round((billable / 60) * 4) / 4) * rateHr
}

export type StopEvent = { kind: string; at: string }
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
