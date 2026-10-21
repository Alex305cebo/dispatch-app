// Раздел «Гараж» (10/21/26) — всё про каждый трак в одном месте: пробег сейчас, масло
// шкалой (когда, где и при каком пробеге меняли, сколько осталось), сроки бумаг, что
// надо починить, последний ремонт и расходы. Ниже — журнал всего парка с чеками.
//
// Раньше это жило только во вкладке «Обслуживание» карточки трака, внизу, и владелец
// его не находил: «непонятно, когда была замена масла, где бумаги и чеки». Вкладка
// осталась — там тот же журнал одного трака (components/service-log.tsx).

import Link from 'next/link'
import { listTrucks } from '@/lib/loads'
import { truckShortLabel } from '@/lib/map'
import {
  costByMonth,
  expiries,
  fleetMaintenance,
  fleetStatusByUnit,
  maintenanceDocs,
  oilCard,
  openTodoCounts,
  serviceKind,
  truckMetas,
  type MaintenanceRecord,
} from '@/lib/maintenance'
import { todayEt } from '@/lib/payments'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { usd, usDate } from '@/lib/fmt'
import { PageHeader } from '@/components/page-header'
import { AddEntryButton, CostBars, KIND_CHIP, ServiceLog, type LogTruck } from '@/components/service-log'

export const dynamic = 'force-dynamic'

const TONE_BAR = { good: 'bg-good-400', warn: 'bg-warn-400', bad: 'bg-bad-500' }
const TONE_TEXT = { good: 'text-good-400', warn: 'text-warn-400', bad: 'text-bad-400' }
const mi = (n: number) => `${Math.round(n).toLocaleString('en-US')} mi`

export default async function Page({ searchParams }: { searchParams: Promise<{ truck?: string }> }) {
  const { truck: truckParam } = await searchParams
  const companyId = await companyScope()
  const locale = await getLocale()
  const [trucks, metas, records, docs, fleet, todos] = await Promise.all([
    listTrucks(companyId),
    truckMetas(companyId),
    fleetMaintenance(companyId),
    maintenanceDocs(companyId),
    fleetStatusByUnit(),
    openTodoCounts(companyId),
  ])
  const today = todayEt()
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`

  const byTruck = new Map<number, MaintenanceRecord[]>()
  for (const r of records) byTruck.set(r.truckId, [...(byTruck.get(r.truckId) ?? []), r])

  const rows = trucks.map((tr) => {
    const recs = byTruck.get(tr.id) ?? []
    const meta = metas.get(tr.id) ?? null
    const eldOdo = tr.number ? (fleet.get(tr.number)?.odometer ?? null) : null
    // Без ELD — самый большой пробег из журнала: лучше, чем ничего, и подписан «из журнала».
    const logOdo = recs.reduce<number | null>((a, r) => (r.odometer != null && (a == null || r.odometer > a) ? r.odometer : a), null)
    const odo = eldOdo ?? logOdo
    const fuel = tr.number ? (fleet.get(tr.number)?.fuel ?? null) : null
    const oil = oilCard(recs, meta, odo)
    const lastRepair = recs.find((r) => serviceKind(r) === 'repair') ?? null
    const cost12 = recs.filter((r) => r.doneAt >= yearAgo).reduce((a, r) => a + (r.cost ?? 0), 0)
    const exp = expiries(meta, locale)
    return { tr, meta, odo, fromLog: eldOdo == null && logOdo != null, fuel, oil, lastRepair, cost12, exp, todo: todos.get(tr.id) ?? 0 }
  })
  // Сверху — кому раньше всех масло: перепробег, потом меньше всего осталось.
  rows.sort((a, b) => (a.oil.left ?? Infinity) - (b.oil.left ?? Infinity))

  const selected = Number(truckParam) || null
  const sel = rows.find((r) => r.tr.id === selected) ?? null
  const logTrucks: LogTruck[] = trucks.map((tr) => ({
    id: tr.id,
    label: truckShortLabel(tr),
    odometer: rows.find((r) => r.tr.id === tr.id)?.odo ?? null,
  }))
  const months = costByMonth(sel ? (byTruck.get(sel.tr.id) ?? []) : records, today)

  const OilBar = ({ r }: { r: (typeof rows)[number] }) =>
    r.oil.tone && r.oil.left != null ? (
      <div className="min-w-36">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`nums text-base font-bold ${TONE_TEXT[r.oil.tone]}`}>{mi(Math.abs(r.oil.left))}</span>
          <span className="text-xs text-t3">{t(locale, r.oil.left < 0 ? 'service.over' : 'service.left')}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <div className={`h-full rounded-full ${TONE_BAR[r.oil.tone]}`} style={{ width: `${r.oil.pct}%` }} />
        </div>
        <div className="nums mt-0.5 text-xs text-t3">
          {t(locale, 'service.sinceOf').replace('{n}', (r.oil.since ?? 0).toLocaleString('en-US')).replace('{i}', r.oil.interval.toLocaleString('en-US'))}
        </div>
      </div>
    ) : (
      <span className="text-sm text-t3">{r.oil.atOdometer == null ? t(locale, 'service.noOil') : t(locale, 'service.noOdo')}</span>
    )

  const LastOil = ({ r }: { r: (typeof rows)[number] }) =>
    r.oil.last ? (
      <div className="text-sm">
        <div className="nums text-t1">
          {usDate(r.oil.last.doneAt)}
          {r.oil.last.doneTime && ` · ${r.oil.last.doneTime}`}
        </div>
        <div className="text-t3">{[r.oil.last.shop, r.oil.atOdometer != null ? mi(r.oil.atOdometer) : null].filter(Boolean).join(' · ') || '—'}</div>
      </div>
    ) : r.oil.atOdometer != null ? (
      <span className="nums text-sm text-t3">{mi(r.oil.atOdometer)}</span>
    ) : (
      <span className="text-sm text-t3">—</span>
    )

  const Expiry = ({ r }: { r: (typeof rows)[number] }) => {
    const worst = r.exp[0]
    if (!worst || worst.tone === 'good') return <span className="text-sm text-good-400">✓ {t(locale, 'service.allOk')}</span>
    return (
      <span
        title={usDate(worst.date)}
        className={`inline-block rounded-lg px-2 py-0.5 text-sm ${worst.tone === 'bad' ? 'bg-bad-500/12 text-bad-400' : 'bg-warn-400/12 text-warn-400'}`}
      >
        {worst.label}{' '}
        <b className="nums">{worst.daysLeft < 0 ? t(locale, 'trucks.common.overdue') : `${worst.daysLeft} ${t(locale, 'trucks.common.daysSuffix')}`}</b>
      </span>
    )
  }

  const Odo = ({ r }: { r: (typeof rows)[number] }) =>
    r.odo != null ? (
      <span className="nums text-base text-t1">
        {mi(r.odo)}
        {r.fromLog && <span className="block text-xs text-t3">{t(locale, 'service.odoFromLog')}</span>}
      </span>
    ) : (
      <span className="text-sm text-t3">—</span>
    )

  const href = (id: number) => (id === selected ? '/garage#log' : `/garage?truck=${id}#log`)

  return (
    <main className="page">
      <PageHeader
        title={t(locale, 'nav.garage')}
        subtitle={t(locale, 'service.subtitle')}
        info={t(locale, 'service.info')}
        actions={<AddEntryButton locale={locale} />}
      />

      {trucks.length === 0 ? (
        <div className="panel p-5 text-base text-t3">{t(locale, 'service.noTrucks')}</div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Парк одной таблицей: строка — трак, нажатие открывает его ниже. */}
          <section className="panel p-4">
            <h2 className="text-base font-semibold text-t1">{t(locale, 'service.allTrucks')}</h2>
            <div className="mt-3 overflow-x-auto max-md:hidden">
              <table className="w-full text-left text-base">
                <thead className="text-xs font-medium tracking-wide text-t3 uppercase">
                  <tr className="border-b border-white/8">
                    <th className="py-2 pr-3">{t(locale, 'service.colTruck')}</th>
                    <th className="py-2 pr-3">{t(locale, 'service.colOdoNow')}</th>
                    <th className="py-2 pr-3">{t(locale, 'service.colOil')}</th>
                    <th className="py-2 pr-3">{t(locale, 'service.colLastOil')}</th>
                    <th className="py-2 pr-3">{t(locale, 'service.colDocsDue')}</th>
                    <th className="py-2 pr-3">{t(locale, 'service.colLastRepair')}</th>
                    <th className="py-2 pr-3 text-right">{t(locale, 'service.colCost12')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tr.id} className={`border-b border-white/[0.05] align-top ${r.tr.id === selected ? 'bg-haul-500/[0.07]' : ''}`}>
                      <td className="py-2.5 pr-3">
                        <Link href={href(r.tr.id)} className="font-semibold text-t1 hover:text-haul-300 hover:underline">
                          {truckShortLabel(r.tr)}
                        </Link>
                        {r.todo > 0 && (
                          <span className="ml-1.5 rounded-full bg-bad-500/15 px-1.5 py-0.5 text-2xs font-semibold text-bad-400" title={t(locale, 'service.colTodo')}>
                            🔧 {r.todo}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3"><Odo r={r} /></td>
                      <td className="py-2.5 pr-3"><OilBar r={r} /></td>
                      <td className="py-2.5 pr-3"><LastOil r={r} /></td>
                      <td className="py-2.5 pr-3"><Expiry r={r} /></td>
                      <td className="py-2.5 pr-3 text-sm">
                        {r.lastRepair ? (
                          <>
                            <div className="nums text-t1">{usDate(r.lastRepair.doneAt)}</div>
                            <div className="max-w-48 truncate text-t3">{r.lastRepair.title}</div>
                          </>
                        ) : (
                          <span className="text-t3">—</span>
                        )}
                      </td>
                      <td className="nums py-2.5 pr-3 text-right text-t1">{r.cost12 ? usd.format(r.cost12) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mt-3 flex flex-col gap-2 md:hidden">
              {rows.map((r) => (
                <li key={r.tr.id}>
                  <Link
                    href={href(r.tr.id)}
                    className={`block rounded-xl border p-3 ${r.tr.id === selected ? 'border-haul-400/50 bg-haul-500/[0.07]' : 'border-white/8'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-t1">
                        {truckShortLabel(r.tr)}
                        {r.todo > 0 && <span className="ml-1.5 text-sm text-bad-400">🔧 {r.todo}</span>}
                      </span>
                      <Odo r={r} />
                    </div>
                    <div className="mt-2"><OilBar r={r} /></div>
                    <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                      <LastOil r={r} />
                      <Expiry r={r} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Выбранный трак: паспорт, бак, сроки — и ссылка в его карточку. */}
          {sel && (
            <section className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-t1">{truckShortLabel(sel.tr)}</h2>
                <div className="flex gap-2">
                  <Link href={`/trucks/${sel.tr.id}#care`} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-semibold text-t2 hover:text-t1">
                    {t(locale, 'service.openTruck')} →
                  </Link>
                  <Link href="/garage" aria-label={t(locale, 'common.close')} className="rounded-xl px-2.5 py-1.5 text-sm text-t3 hover:bg-white/10 hover:text-t1">
                    ✕
                  </Link>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                {[
                  ['VIN', sel.meta?.vin],
                  [t(locale, 'trucks.care.plateLabel'), sel.meta?.plate],
                  [t(locale, 'trucks.care.trailerNumberLabel'), sel.meta?.trailerNumber],
                  [t(locale, 'service.passport'), [sel.meta?.year, sel.meta?.make, sel.meta?.model].filter(Boolean).join(' ') || null],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-xs text-t3">{k}</dt>
                    <dd className="truncate text-t1">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
              {sel.fuel != null && (
                <div className="mt-3 max-w-xs">
                  <div className="flex justify-between text-xs text-t3">
                    <span>{t(locale, 'service.fuel')}</span>
                    <span className="nums">{Math.round(sel.fuel)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full ${sel.fuel < 25 ? 'bg-bad-500' : sel.fuel < 50 ? 'bg-warn-400' : 'bg-good-400'}`}
                      style={{ width: `${Math.max(0, Math.min(100, sel.fuel))}%` }}
                    />
                  </div>
                </div>
              )}
              {sel.exp.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sel.exp.map((e) => (
                    <span
                      key={e.label}
                      title={usDate(e.date)}
                      className={`rounded-lg px-2.5 py-1 text-sm ${e.tone === 'bad' ? 'bg-bad-500/12 text-bad-400' : e.tone === 'warn' ? 'bg-warn-400/12 text-warn-400' : 'bg-white/[0.05] text-t2'}`}
                    >
                      {e.label} <b className="nums">{usDate(e.date)}</b>
                    </span>
                  ))}
                </div>
              )}
              {/* Сколько каких работ — цветом, как в журнале. */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(['oil', 'repair', 'service', 'inspection'] as const).map((k) => {
                  const n = (byTruck.get(sel.tr.id) ?? []).filter((r) => serviceKind(r) === k).length
                  return n ? (
                    <span key={k} className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${KIND_CHIP[k]}`}>
                      {t(locale, `service.kind.${k}`)} · {n}
                    </span>
                  ) : null
                })}
              </div>
            </section>
          )}

          <CostBars months={months} locale={locale} />

          <ServiceLog records={records} docs={docs} trucks={logTrucks} initialTruck={selected} locale={locale} />
        </div>
      )}
    </main>
  )
}
