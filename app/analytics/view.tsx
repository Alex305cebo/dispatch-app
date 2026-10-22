// Экран «Аналитики» без запросов: грузы и трак-лист приходят готовыми (app/analytics/page.tsx).

import { buildAnalytics, REGIONS, type Region } from '@/lib/analytics-core'
import { usd } from '@/lib/fmt'
import { PageHeader } from '@/components/page-header'
import { AnalyticsClient } from './analytics-client'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import type { LoadRecord, TruckRecord } from '@/lib/map'

// Цвета регионов — светлые, с тёмным текстом поверх: читаются в обеих темах.
const REGION_COLOR: Record<Region, string> = {
  west: '#38bdf8',
  midwest: '#fbbf24',
  south: '#fb923c',
  southeast: '#4ade80',
  northeast: '#c4b5fd',
  other: '#cbd5e1',
}

/** Сам экран — отдельно от запросов, чтобы его можно было показать на любых грузах. */
export function AnalyticsView({ loads, trucks, today, locale, title, rateCons }: { loads: LoadRecord[]; trucks: TruckRecord[]; today: string; locale: Locale; title: string; rateCons: [number, number][] }) {
  const a = buildAnalytics(loads, trucks, today)

  if (!a.years.length)
    return (
      <main className="page">
        <PageHeader title={title} subtitle={t(locale, 'analytics.subtitle')} />
        <div className="panel p-5 text-base text-t2">{t(locale, 'analytics.empty')}</div>
      </main>
    )

  // Подписи дат и дней — на сервере и строками: клиент получает готовое, гидратация
  // не расходится. Даты MM/DD, как везде в TMS.
  const mmdd = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 9, 19 + i, 12)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }),
  )
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2026, i, 15, 12)).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }),
  )
  const groups = [...REGIONS, 'other' as const].map((id) => ({
    id,
    name: t(locale, `analytics.region.${id}` as MsgKey),
    color: REGION_COLOR[id],
    ink: 'dark' as const,
  }))
  const periodLabels = [t(locale, 'analytics.days7'), t(locale, 'analytics.days30'), t(locale, 'analytics.year')]
  const loadsWord = t(locale, 'analytics.loadsShort')

  return (
    <main className="page">
      <PageHeader title={title} subtitle={t(locale, 'analytics.hint')} info={t(locale, 'analytics.subtitle')} />
      <AnalyticsClient
        a={a}
        rateCons={rateCons}
        bento={{
        labels: {
          revenue: t(locale, 'analytics.caption'),
          share: t(locale, 'analytics.share'),
          value: t(locale, 'analytics.revenue').split(',')[0]!,
          year: t(locale, 'analytics.year'),
        },
        revenue: {
          label: t(locale, 'analytics.revenue'),
          value: a.revenue.total,
          delta: a.revenue.delta,
          note: a.kpi.avg.now ? (
            <>
              {t(locale, 'analytics.avg')} <span className="nums text-t1">{usd.format(a.kpi.avg.now)}</span>
            </>
          ) : undefined,
          caption: t(locale, 'analytics.caption'),
          series: a.revenue.series.map((p) => ({ label: mmdd(p.day), value: p.value, ids: p.ids })),
        },
        sessions: {
          label: t(locale, 'analytics.loads'),
          value: a.week.count,
          delta: a.week.delta,
          note: t(locale, 'analytics.byWeekday'),
          desktop: a.week.pickups,
          mobile: a.week.deliveries,
          axis: weekdays,
          ids: a.week.ids,
          labels: {
            desktop: t(locale, 'analytics.pickups'),
            mobile: t(locale, 'analytics.deliveries'),
            prior: t(locale, 'analytics.prior'),
            current: t(locale, 'analytics.current'),
          },
        },
        categories: {
          title: t(locale, 'analytics.states'),
          groups: groups.filter((g) => a.states.some((s) => s.group === g.id)),
          periods: a.periods.map((p, i) => ({
            label: periodLabels[i]!,
            total: p.total,
            delta: p.delta,
            compare: p.before ? `${t(locale, 'analytics.was')} ${usd.format(p.before)}` : '',
            ids: p.ids,
          })),
          items: a.states.map((s) => ({
            name: s.name === 'other' ? t(locale, 'analytics.region.other') : s.name,
            group: s.group,
            values: s.values,
            ids: s.ids,
          })),
        },
        seasonality: {
          title: t(locale, 'analytics.season'),
          axis: months,
          years: a.years.map((y) => ({
            label: y.year,
            values: y.months,
            ids: y.monthIds,
            stats: [
              { label: t(locale, 'analytics.monthAvg'), value: y.monthAvg, delta: y.avgDelta, note: '' },
              { label: t(locale, 'analytics.yearTotal'), value: y.total, delta: y.totalDelta, note: `${y.count} ${loadsWord}` },
            ],
            rows: y.trucks.map((tr) => ({ label: tr.name, value: usd.format(tr.total), ids: tr.ids })),
          })),
        },
        }}
      />
    </main>
  )
}
