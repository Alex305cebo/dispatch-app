// Экран «Аналитики» без запросов: грузы и трак-лист приходят готовыми (app/analytics/page.tsx).
// Сервер только превращает грузы в короткие строки (toALoads) — считает уже браузер,
// чтобы кнопки периода, трака и брокера перерисовывали графики сразу.

import { toALoads, truckLabel } from '@/lib/analytics-core'
import { todayEt } from '@/lib/payments'
import { PageHeader } from '@/components/page-header'
import { AnalyticsClient } from './analytics-client'
import { t, type Locale } from '@/lib/i18n'
import type { LoadRecord, TruckRecord } from '@/lib/map'

/** Сам экран — отдельно от запросов, чтобы его можно было показать на любых грузах. */
export function AnalyticsView({ loads, trucks, today, locale, title, rateCons }: { loads: LoadRecord[]; trucks: TruckRecord[]; today: string; locale: Locale; title: string; rateCons: [number, number][] }) {
  // День оплаты — по Восточному времени, как и все даты TMS.
  const rows = toALoads(loads, trucks, (iso) => todayEt(new Date(iso)))

  if (!rows.some((l) => l.day && l.day <= today))
    return (
      <main className="page">
        <PageHeader title={title} subtitle={t(locale, 'analytics.subtitle')} />
        <div className="panel p-5 text-base text-t2">{t(locale, 'analytics.empty')}</div>
      </main>
    )

  // Названия дней и месяцев — на сервере строками: Intl в Node и в браузере пишет
  // сокращения по-разному («февр.» / «фев.»), а гидратация должна совпасть.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 9, 19 + i, 12)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }),
  )
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2026, i, 15, 12)).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }),
  )

  return (
    <main className="page">
      <PageHeader title={title} subtitle={t(locale, 'analytics.hint')} info={t(locale, 'analytics.subtitle')} />
      <AnalyticsClient
        rows={rows}
        trucks={trucks.map((tr) => ({ id: tr.id, name: truckLabel(tr) }))}
        today={today}
        weekdays={weekdays}
        months={months}
        rateCons={rateCons}
      />
    </main>
  )
}
