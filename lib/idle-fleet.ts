import type { LoadRecord, TruckRecord } from './map.ts'
import { daysBetween, isIsoDay, todayEt } from './payments.ts'

/**
 * «Кому искать груз» — расчёт для одноимённой карты на обзоре.
 *
 * Чем это заменило календарь загрузки. Тепловая карта отвечала на вопрос «как парк
 * отработал прошлые две недели». Для парка из семи траков с одним активным грузом
 * сетка 14×7 почти пуста в любую сторону времени, и главное — на неё нельзя
 * ОТРЕАГИРОВАТЬ: она отчёт, а не задача. Здесь наоборот: список того, что нужно
 * сделать сегодня, отсортированный по тому, где горит сильнее.
 *
 * Ни одного нового запроса: траки, грузы и позиции страница уже держит в руках.
 */

export interface IdleTruck {
  truckId: number
  /** Свободен прямо сейчас (нет активного груза). */
  free: boolean
  /** Где он для этого груза окажется: город стоянки либо город выгрузки. */
  place: string | null
  /** Свободен с этого дня (ISO). У едущего — дата выгрузки, у стоящего — дата
   * последней выгрузки. null, если груза не было ни одного. */
  since: string | null
  /** Дней без груза. У едущего — сколько ещё до выгрузки, со знаком минус. */
  days: number | null
  /** Постоянные расходы трака в сутки: платёж, страховка, ELD и пермиты. Идут
   * каждый день, едет он или стоит, — именно поэтому простой стоит денег. */
  costPerDay: number
  /** Во что уже обошёлся этот простой. У едущего — 0. */
  idleCost: number
  /** 'repair' | 'vacation' — трак есть, но диспетчерить его нельзя. */
  unavailable: 'repair' | 'vacation' | null
}

/** Постоянные расходы в сутки — то, что капает вне зависимости от рейса. */
export function costPerIdleDay(t: TruckRecord): number {
  return t.truckPaymentPerDay + t.insurancePerDay + t.eldPermitsPerDay
}

/**
 * Дата выгрузки — календарный день, а не момент, и «сегодня» — тоже день, по
 * восточному времени. Полночь в поясе процесса врала дважды: Date.parse читает
 * '2026-08-10' как полночь UTC (западнее Гринвича это 9 августа), а прод-сервер в
 * UTC после 20:00 ET живёт уже завтрашним днём — простой рос на сутки, «ещё ехать»
 * таял. Поэтому дни остаются строками yyyy-mm-dd: сравниваются как строки, разница —
 * daysBetween.
 */
function calendarDay(v: string | null): string | null {
  const d = v?.slice(0, 10)
  return isIsoDay(d) ? d : null
}

/**
 * Раскладывает парк на «нужен груз» и «занят до», по одной строке на трак.
 *
 * Порядок: сначала работающие водители, и среди них дольше всех стоящие сверху —
 * им искать груз в первую очередь. Дальше те, кто скоро освободится (чем скорее,
 * тем выше: под них груз ищут заранее). Затем траки, у которых в системе нет ни
 * одного рейса. Ремонт и отпуск — в самом конце: они стоят денег, но их нельзя
 * загрузить.
 */
export function idleFleet(
  trucks: TruckRecord[],
  loads: LoadRecord[],
  placeByTruck: Map<number, string | null>,
  now = Date.now(),
): IdleTruck[] {
  const today = todayEt(new Date(now))

  const rows = trucks.map((t): IdleTruck => {
    const mine = loads.filter((l) => l.truckId === t.id && l.status !== 'cancelled')
    const active = mine
      .filter((l) => l.status === 'booked' || l.status === 'in_transit')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
    const costPerDay = costPerIdleDay(t)

    if (active) {
      // Занят. «Свободен» — день выгрузки; отрицательные дни читаются как «ещё
      // столько ехать». Без даты выгрузки груз есть, а когда кончится — неизвестно.
      const until = calendarDay(active.deliveryDate)
      return {
        truckId: t.id,
        free: false,
        place: active.destination,
        since: until,
        days: until === null ? null : daysBetween(until, today),
        costPerDay,
        idleCost: 0,
        unavailable: t.unavailable,
      }
    }

    // Свободен. Считаем от последней выгрузки — это и есть «без груза с».
    // Берём дату выгрузки, а не создания: груз мог быть заведён неделей раньше.
    const lastEnd = mine
      .map((l) => calendarDay(l.deliveryDate))
      .filter((v): v is string => v !== null && v <= today)
      .sort()
      .pop()
    const days = lastEnd === undefined ? null : daysBetween(lastEnd, today)

    return {
      truckId: t.id,
      free: true,
      place: placeByTruck.get(t.id) ?? null,
      since: lastEnd ?? null,
      days,
      costPerDay,
      idleCost: days === null ? 0 : days * costPerDay,
      unavailable: t.unavailable,
    }
  })

  // Трак, за которым в системе нет ни одного рейса. Раньше такие стояли ВВЕРХУ
  // (пустая история считалась самым долгим простоем), и первыми в списке шли
  // машины, которыми никто не диспетчерит, а водитель, реально везущий груз, был
  // последним. Список читают сверху вниз — верх должен принадлежать тем, кто ездит.
  const dormant = (r: IdleTruck) => r.free && r.days === null

  return rows.sort((a, b) => {
    // Ремонт и отпуск — всегда в конце: это не работа диспетчера.
    if (!!a.unavailable !== !!b.unavailable) return a.unavailable ? 1 : -1
    if (dormant(a) !== dormant(b)) return dormant(a) ? 1 : -1
    if (a.free !== b.free) return a.free ? -1 : 1
    // Среди свободных: дольше стоит — выше.
    if (a.free) return (b.days ?? 0) - (a.days ?? 0)
    // Среди занятых: кто освободится раньше — выше, под него искать груз уже пора.
    return (b.days ?? -Infinity) - (a.days ?? -Infinity)
  })
}

/** Итог шапки: сколько траков без груза и во сколько обходится их простой в сутки. */
export function idleSummary(rows: IdleTruck[]): { freeCount: number; burnPerDay: number } {
  const free = rows.filter((r) => r.free && !r.unavailable)
  return {
    freeCount: free.length,
    burnPerDay: free.reduce((s, r) => s + r.costPerDay, 0),
  }
}
