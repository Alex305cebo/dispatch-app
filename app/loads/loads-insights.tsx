'use client'

// Верх страницы «Грузы»: четыре цифры недели.
// Считается на клиенте из той же выборки, что и список, — новых данных не нужно.
// Оформление — как на «Сегодня»: плитки Stat с ⓘ. Очередь «Требуют действия» отсюда
// переехала в ленту «Ждёт тебя» на «Сегодня» (lib/attention.ts), недельный график
// «Грузы по дате пикапа» — в «Деньги → Недели» (components/pickup-week-chart.tsx).

import { CalendarDays, DollarSign, Truck, TrendingUp } from 'lucide-react'
import type { LoadRecord, TruckRecord } from '@/lib/map'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { weekStats, shiftDay } from '@/lib/loads-dashboard'
import { usd, usd2 } from '@/lib/fmt'
import { pctText, versusMarket } from '@/lib/dat-market-core'
import { Stat } from '@/components/stat'
import { Spark } from '@/components/mini-charts'
import type { LoadMetrics } from '@/components/loads-toolbar'

/** Выборка для списка ниже: какие грузы показать и как подписать чип. */
export type Selection = { ids: number[]; label: string } | null

const dateLabel = (day: string, locale: Locale) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
export const weekdayLabel = (day: string, locale: Locale) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' })

/** Четыре числа недели — по плитке на каждое, а не общей карточкой на всю строку.
 *  Возвращает готовые плитки с ключами, которыми их знает раскладка (lib/tiles-core). */
export function loadsKpiTiles({
  loads,
  trucks,
  metrics,
  weekFrom,
  locale,
  onSelect,
}: {
  loads: LoadRecord[]
  trucks: TruckRecord[]
  /** Рынок каждого груза (metrics[id].market) — для «к рынку DAT» у ставки недели. */
  metrics: Record<number, LoadMetrics>
  /** Первый день текущей расчётной недели, yyyy-mm-dd. */
  weekFrom: string
  locale: Locale
  onSelect: (value: Selection) => void
}) {
  const week = weekStats(loads, trucks, weekFrom)
  const next = weekStats(loads, trucks, shiftDay(weekFrom, 7))
  // Тренд ставки — четыре ЗАВЕРШЁННЫЕ недели: текущая ещё не докатана и занижала бы линию.
  const trend = [-28, -21, -14, -7].map((n) => weekStats(loads, trucks, shiftDay(weekFrom, n)).rpm)
  // Ставка недели против рынка тех же грузов — по гружёным милям, как DAT считает ставку.
  const vs = versusMarket(week.rows.map((l) => ({ rate: l.rate, loadedMiles: l.loadedMiles, market: metrics[l.id]?.market ?? null })))
  const nextTrucks = next.coverage.filter((c) => c.days > 0).length
  const nextTone = nextTrucks === 0 ? 'warn' : 'haul'
  const pick = (key: MsgKey, rows: LoadRecord[]) => () => onSelect({ ids: rows.map((l) => l.id), label: t(locale, key) })
  const icon = { size: 15, strokeWidth: 2.5 }
  return [
    {
      id: 'week-gross',
      node: (
        <Stat
          hero
          compact
          surface="panel"
          accent="haul"
          icon={<DollarSign {...icon} />}
          label={t(locale, 'today.weekGross')}
          value={usd.format(week.gross)}
          sub={`${dateLabel(weekFrom, locale)} – ${dateLabel(shiftDay(weekFrom, 6), locale)}`}
          info={t(locale, 'loads.dash.bookedInfo')}
          onClick={pick('today.weekGross', week.rows)}
        >
          <Spark values={week.buckets.map((b) => b.gross)} tone="haul" />
        </Stat>
      ),
    },
    {
      id: 'week-rpm',
      node: (
        <Stat
          compact
          surface="panel"
          accent="good"
          icon={<TrendingUp {...icon} />}
          label={t(locale, 'loads.dash.rpm')}
          value={week.rpm == null ? '—' : `${usd2.format(week.rpm)}/mi`}
          sub={vs ? t(locale, 'loads.dash.rpmVsMarket').replace('{pct}', pctText(vs.diff)) : t(locale, 'loads.dash.historyTrend')}
          subTone={vs?.tone === 'good' ? 'good' : vs?.tone === 'bad' ? 'bad' : undefined}
          info={
            vs
              ? `${t(locale, 'loads.dash.rpmInfo')} ${t(locale, 'loads.dash.rpmVsMarketInfo')
                  .replace('{rpm}', usd2.format(vs.rpm))
                  .replace('{market}', usd2.format(vs.market))
                  .replace('{n}', String(vs.loads))}`
              : t(locale, 'loads.dash.rpmInfo')
          }
          onClick={pick('loads.dash.rpm', week.rows)}
        >
          <Spark values={trend} tone="good" />
        </Stat>
      ),
    },
    {
      id: 'utilization',
      node: (
        <Stat
          compact
          surface="panel"
          accent="haul"
          icon={<Truck {...icon} />}
          label={t(locale, 'loads.dash.utilization')}
          value={week.utilization == null ? '—' : `${Math.round(week.utilization)}%`}
          sub={`${week.occupied} / ${week.capacity} ${t(locale, 'loads.dash.truckDays')}`}
          info={t(locale, 'loads.dash.utilizationInfo')}
          onClick={pick('loads.dash.utilization', week.busy)}
        >
          <Spark values={week.coverage.map((c) => c.days)} tone="haul" />
        </Stat>
      ),
    },
    {
      id: 'next-week',
      node: (
        <Stat
          compact
          surface="panel"
          accent={nextTone}
          icon={<CalendarDays {...icon} />}
          label={t(locale, 'loads.dash.nextWeek')}
          value={usd.format(next.gross)}
          sub={`${nextTrucks} / ${next.coverage.length} ${t(locale, 'loads.dash.planned')}`}
          info={t(locale, 'loads.dash.nextWeekInfo')}
          onClick={pick('loads.dash.nextWeek', next.rows)}
        >
          <Spark values={next.buckets.map((b) => b.gross)} tone={nextTone} />
        </Stat>
      ),
    },
  ]
}
