// Что ждёт действия по грузам — разделы ленты «Ждёт тебя» на «Сегодня».
//
// До 10/09/26 это был блок «Требуют действия» на «Грузах», а пустые траки, сроки
// документов и важное от брокера — отдельными плитками на «Обзоре». По плану «Порядок
// в TMS» всё, что ждёт действия, собрано в одну ленту на главной; здесь — та её часть,
// что про грузы. Чистая функция: в базу не ходит, всё приносит страница.

import type { LoadRecord, TruckRecord } from './map.ts'
import type { StopEv } from './stops.ts'
import { calcLoad } from './profit.ts'
import { lateStop, priorityRank, PRIORITY_KEY } from './loads-dashboard.ts'
import { driveTime, usd } from './fmt.ts'
import { t, type Locale } from './i18n.ts'

export type AttentionCategory = 'late' | 'priority' | 'broker' | 'documents' | 'ready' | 'overdue' | 'checks'

export type AttentionEntry = {
  /** id груза */
  id: number
  route: string
  category: AttentionCategory
  detail: string
  /** Уже горит: опоздание, просроченная оплата, груз в минус. */
  bad?: boolean
  /** Порядок внутри раздела: больше — выше. */
  weight: number
}

const DAY = 86_400_000

/** На сколько дней просрочена оплата выставленного счёта; null — не просрочена. Правило
 *  то же, что у «Деньги → Не оплачено» (listReceivables): целые дни со дня счёта больше
 *  срока оплаты. */
export function overdueDays(load: LoadRecord, now: number): number | null {
  if (!load.invoicedAt || load.paidAt) return null
  const out = Math.floor((now - Date.parse(load.invoicedAt)) / DAY)
  return out > load.paymentTermsDays ? out - load.paymentTermsDays : null
}

/** Важное от брокера одной строкой: первые слова, без переносов. */
function noteLine(note: string): string {
  const flat = note.replace(/\s+/g, ' ').trim()
  return flat.length > 90 ? `${flat.slice(0, 88).trimEnd()}…` : flat
}

export function attentionQueue({
  loads,
  trucks,
  rateCons,
  pods,
  marks,
  now,
  locale,
  money,
}: {
  loads: LoadRecord[]
  trucks: TruckRecord[]
  /** Грузы, у которых есть Rate Con. */
  rateCons: { has(id: number): boolean }
  /** Грузы с конечным POD. */
  pods: { has(id: number): boolean }
  /** Отметки водителя по открытым грузам. */
  marks: Map<number, StopEv[]>
  now: number
  locale: Locale
  /** Право «Финансы»: без него разделов про счета и оплату нет вовсе. */
  money: boolean
}): AttentionEntry[] {
  const byId = new Map(trucks.map((tr) => [tr.id, tr]))
  const out: AttentionEntry[] = []
  for (const load of loads) {
    // Заявки, отменённые и оплаченные: с них ничего не причитается и бумаги не горят.
    if (load.status === 'quoted' || load.status === 'cancelled' || load.status === 'paid') continue
    const route = [load.referenceId, `${load.origin ?? '—'} → ${load.destination ?? '—'}`].filter(Boolean).join(' · ')
    const push = (category: AttentionCategory, detail: string, weight = 0, bad = false) =>
      out.push({ id: load.id, route, category, detail, weight, bad })
    const open = load.status === 'booked' || load.status === 'in_transit'

    // Окно остановки прошло, а приезда никто не отметил и GPS не видел — опаздывает.
    const late = open ? lateStop(load, marks.get(load.id) ?? [], now) : null
    if (late)
      push(
        'late',
        `${t(locale, late.stop.role === 'pickup' ? 'stops.pickup' : 'stops.delivery')} · ${late.stop.city ?? '—'} · ${t(locale, 'loads.dash.lateBy').replace('{t}', driveTime(late.minutes, locale))}`,
        late.minutes,
        true,
      )
    // Флаг диспетчера: его и ставят, чтобы груз не потерялся.
    if (load.priority) push('priority', t(locale, PRIORITY_KEY[load.priority]), priorityRank(load.priority), load.priority === 'critical')
    if (load.brokerNotes && !load.notesReadAt) push('broker', noteLine(load.brokerNotes))

    const missing = [rateCons.has(load.id) ? null : 'RC', load.status === 'delivered' && !pods.has(load.id) ? 'POD' : null].filter(Boolean)
    if (missing.length) push('documents', missing.join(' / '))

    if (money) {
      if (load.status === 'delivered' && !load.invoicedAt && pods.has(load.id) && rateCons.has(load.id)) push('ready', usd.format(load.rate))
      const overdue = overdueDays(load, now)
      if (overdue != null)
        push('overdue', `${usd.format(load.rate)} · ${t(locale, 'today.overdueBy').replace('{n}', String(overdue))}`, overdue, true)
    }

    if (open) {
      const truck = load.truckId == null ? undefined : byId.get(load.truckId)
      const r = truck ? calcLoad(load, truck) : null
      if (load.milesEstimated) push('checks', t(locale, 'loads.attention.milesEstimated'))
      else if (r && r.net < 0) push('checks', `${t(locale, 'loads.attention.losing')} · ${usd.format(r.net)}`, -r.net, true)
    }
  }
  // Внутри раздела — по весу; при равном весе порядок как пришёл (новые грузы выше).
  return out.sort((a, b) => b.weight - a.weight)
}
