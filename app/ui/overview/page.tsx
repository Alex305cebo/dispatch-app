// Рабочий образец Обзора: те же настоящие данные, что и на главной, но разложенные
// по переставляемым плиткам. Настоящий Обзор (app/page.tsx) НЕ ТРОГАЕТСЯ — это
// отдельный адрес /ui/overview, в меню его нет. Смотрим, решаем, и только потом
// (если скажешь) переносим на главную.
//
// Данные читаются теми же функциями и теми же запросами, что и на главной. Страница
// только читает: ни одного действия и ни одной записи в базу здесь нет.

import { CalendarClock, DollarSign, Fuel, MessageSquareWarning, Package, Palmtree, Plus, Route, TrendingUp, Wallet, Wrench } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/button'
import {
  listLoads,
  listReceivables,
  listTrucks,
  listUninvoicedDelivered,
  rateConByLoad,
} from '@/lib/loads'
import { currentLoadsByTruck, truckLabel, type TruckRecord } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { sql } from '@/lib/db'
import { fleetExpiryAlerts, truckPhotoFlags, truckProfiles, truckTrailerNumbers } from '@/lib/maintenance'
import { homeUntil } from '@/lib/maintenance-core'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { fixPlace, placeCity } from '@/lib/place'
import { t as tr, type Locale } from '@/lib/i18n'
import { can } from '@/lib/capabilities-server'
import { usd, usd2, shortName, weekStart } from '@/lib/fmt'
import { StatusBadge } from '@/components/status'
import { NeedsLoad } from '@/components/needs-load'
import { FleetHeatmap } from '@/components/fleet-heatmap'
import { idleFleet } from '@/lib/idle-fleet'
import { buildWorkingDays } from '@/lib/heatmap'
import { todayEt } from '@/lib/payments'
import { RateConButton } from '@/components/ratecon-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { Stat } from '@/components/stat'
import { CopyPlace } from '@/components/copy-place'
import { WidgetGrid, type Widget } from '@/components/widget-grid'

export const dynamic = 'force-dynamic'

type FS = {
  unit: string
  drive_status: string | null
  location: string | null
  lat: number | null
  lng: number | null
  fuel: number | null
}

// ELD отдаёт живой статус движения, а не часы (HOS не подключён): едет — зелёный,
// на смене — фирменный, иначе приглушённый. Та же логика, что на главной.
function driveDot(s: string | null): string {
  if (!s) return 'bg-white/20'
  if (/mi\/h|^d$/i.test(s)) return 'bg-good-500'
  if (/^on$/i.test(s)) return 'bg-haul-500'
  return 'bg-white/30'
}

/** Обёртка виджета: подпись капсом и содержимое. Ровно та же анатомия, что у плитки с
 * цифрой (components/stat.tsx), чтобы в одной сетке они читались как одна семья. */
function Tile({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel-inset px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-t3">{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

export default async function Page() {
  const companyId = await companyScope()
  const locale = await getLocale()
  const user = await getCurrentUser()
  const showFinances = await can(user, 'finances')

  const [loads, trucks, fleetRaw, alerts, rateCons, photoIds, trailers, receivables, uninvoiced, profiles] =
    await Promise.all([
      listLoads(companyId),
      listTrucks(companyId),
      sql`SELECT unit, drive_status, location, lat, lng, fuel FROM fleet_status`,
      fleetExpiryAlerts(companyId, locale),
      rateConByLoad(companyId),
      truckPhotoFlags(companyId),
      truckTrailerNumbers(companyId),
      showFinances ? listReceivables(companyId) : Promise.resolve([]),
      showFinances ? listUninvoicedDelivered(companyId) : Promise.resolve([]),
      truckProfiles(companyId),
    ])

  const homeByTruck = new Map([...profiles].map(([id, p]) => [id, homeUntil(p, todayEt())]))
  const fleet = (fleetRaw as FS[]).map((r) => ({ ...r, location: fixPlace(r.location, r.lat, r.lng) }))
  const byId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const byUnit = new Map(fleet.map((f) => [f.unit, f]))
  const fallback = trucks[0]
  const placeByTruck = new Map<number, string | null>(
    trucks.map((t) => [t.id, (t.number ? byUnit.get(t.number)?.location : null) ?? null]),
  )

  const live = loads.filter((l) => l.status !== 'cancelled')
  const currentByTruck = currentLoadsByTruck(live)
  const rows = live.flatMap((load) => {
    const truck = (load.truckId !== null ? byId.get(load.truckId) : undefined) ?? fallback
    return truck ? [{ load, truck, r: calcLoad(load, truck) }] : []
  })
  const totalGross = rows.reduce((s, x) => s + x.r.gross, 0)
  const totalMiles = rows.reduce((s, x) => s + x.r.totalMiles, 0)
  const avgRpm = totalMiles > 0 ? totalGross / totalMiles : 0
  const active = live.filter((l) => l.status === 'booked' || l.status === 'in_transit').length
  const busyTruckIds = new Set(
    live.filter((l) => (l.status === 'booked' || l.status === 'in_transit') && l.truckId != null).map((l) => l.truckId),
  )
  const freeTrucks = trucks.filter((t) => !busyTruckIds.has(t.id) && !t.unavailable).length

  const weekBegin = weekStart()
  const weekGrossByTruck = new Map<number, number>()
  for (const l of live) {
    if (l.truckId == null || new Date(l.createdAt).getTime() < weekBegin) continue
    weekGrossByTruck.set(l.truckId, (weekGrossByTruck.get(l.truckId) ?? 0) + l.rate)
  }

  const unpaidTotal = receivables.reduce((s, r) => s + r.load.rate, 0) + uninvoiced.reduce((s, l) => s + l.rate, 0)
  const overdue = receivables.filter((r) => r.overdue)
  const overdueTotal = overdue.reduce((s, r) => s + r.load.rate, 0)
  const unreadNotes = live.filter((l) => l.brokerNotes && !l.notesReadAt)

  // Виджеты собираются по одному и только те, которым есть что показать: пустая
  // плитка «Ждём оплаты: $0» занимает место ряда и не говорит ничего.
  const widgets: Widget[] = []

  if (loads.length > 0) {
    widgets.push(
      {
        id: 'gross',
        node: (
          <Stat
            compact
            href="/loads"
            hero
            icon={<DollarSign size={15} strokeWidth={2.5} />}
            accent="haul"
            label={tr(locale, 'overview.rateTotal')}
            value={usd.format(totalGross)}
            info={tr(locale, 'overview.rateTotalInfo')}
          />
        ),
      },
      {
        id: 'rpm',
        node: (
          <Stat
            compact
            href="/trucks"
            icon={<TrendingUp size={15} strokeWidth={2.5} />}
            accent="good"
            label={tr(locale, 'overview.rpm')}
            value={`${usd2.format(avgRpm)}/mi`}
            info={tr(locale, 'overview.rpmInfo')}
          />
        ),
      },
      {
        id: 'active',
        node: (
          <Stat
            compact
            href="/loads"
            icon={<Package size={15} strokeWidth={2.5} />}
            accent="warn"
            label={tr(locale, 'overview.inWork')}
            value={String(active)}
            sub={trucks.length > 0 ? tr(locale, 'overview.inWorkSub').replace('{n}', String(freeTrucks)) : undefined}
            subTone={freeTrucks > 0 ? 'good' : undefined}
            info={tr(locale, 'overview.inWorkInfo')}
          />
        ),
      },
      {
        id: 'miles',
        node: (
          <Stat
            compact
            href="/trucks"
            icon={<Route size={15} strokeWidth={2.5} />}
            accent="haul"
            label={tr(locale, 'overview.totalMiles')}
            value={Math.round(totalMiles).toLocaleString('en-US')}
            info={tr(locale, 'overview.totalMilesInfo')}
          />
        ),
      },
    )
  }

  if (alerts.length > 0) {
    widgets.push({
      id: 'alerts',
      span: 2,
      node: (
        <Tile
          title={tr(locale, 'overview.docDeadlines')}
          right={
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-warn-400/15 text-warn-400 ring-1 ring-warn-400/25">
              <CalendarClock size={15} strokeWidth={2.5} />
            </span>
          }
        >
          <div className="flex flex-col gap-1 text-base">
            {alerts.slice(0, 6).map((a) => (
              <Link
                key={`${a.truckId}-${a.item.label}`}
                href={`/trucks/${a.truckId}#care`}
                className="text-t1 hover:underline"
              >
                <span className="text-t3">#{a.number}</span> {a.item.label} —{' '}
                <span className={a.item.tone === 'bad' ? 'text-bad-400' : 'text-warn-400'}>
                  {a.item.daysLeft < 0
                    ? tr(locale, 'overview.overdue')
                    : tr(locale, 'overview.daysLeft').replace('{n}', String(a.item.daysLeft))}
                </span>
              </Link>
            ))}
          </div>
        </Tile>
      ),
    })
  }

  if (unreadNotes.length > 0) {
    widgets.push({
      id: 'broker',
      span: 2,
      node: (
        <Tile
          title={tr(locale, 'overview.brokerUnread')}
          right={
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-haul-500/20 text-haul-300 ring-1 ring-haul-400/25">
              <MessageSquareWarning size={15} strokeWidth={2.5} />
            </span>
          }
        >
          <div className="flex flex-col gap-1 text-base">
            {unreadNotes.slice(0, 6).map((l) => (
              <Link key={l.id} href={`/loads/${l.id}`} className="text-t1 hover:underline">
                {l.origin ?? '—'} → {l.destination ?? '—'}
              </Link>
            ))}
          </div>
        </Tile>
      ),
    })
  }

  if (showFinances && unpaidTotal > 0) {
    widgets.push({
      id: 'unpaid',
      span: 2,
      node: (
        <Tile
          title={tr(locale, 'overview.awaitingPayment')}
          right={
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ${
                overdueTotal > 0
                  ? 'bg-bad-500/15 text-bad-400 ring-bad-400/25'
                  : 'bg-white/[0.06] text-t2 ring-white/10'
              }`}
            >
              <Wallet size={15} strokeWidth={2.5} />
            </span>
          }
        >
          <p className="text-base text-t1">
            <Link href="/docs?tab=unpaid" className="nums text-2xl font-bold hover:underline">
              {usd.format(unpaidTotal)}
            </Link>
            {overdueTotal > 0 && (
              <span className="text-bad-400">
                {' '}
                — {tr(locale, 'overview.ofWhichOverdue')}{' '}
                <Link href="/docs?tab=unpaid" className="nums font-semibold hover:underline">
                  {usd.format(overdueTotal)}
                </Link>{' '}
                ({overdue.length})
              </span>
            )}
          </p>
        </Tile>
      ),
    })
  }

  if (trucks.length > 0 && live.length > 0) {
    widgets.push({
      id: 'heatmap',
      span: 'full',
      node: (
        <div className="panel-inset [&>div]:mb-0 [&>div]:border-0 [&>div]:bg-transparent [&>div]:shadow-none">
          <FleetHeatmap
            today={todayEt()}
            rows={trucks.map((t) => {
              const cur = currentByTruck.get(t.id)
              return {
                id: t.id,
                label: t.number?.trim() || t.name,
                sub: shortName(t.driverName),
                working: buildWorkingDays(live.filter((l) => l.truckId === t.id)),
                place: cur
                  ? `→ ${cur.destination ?? '—'}`
                  : (placeCity((t.number ? byUnit.get(t.number)?.location : null) ?? null) ??
                     tr(locale, 'overview.noEldData')),
                when: t.unavailable
                  ? {
                      text: tr(locale, t.unavailable === 'repair' ? 'overview.repair' : 'overview.onVacation'),
                      tone: 'off' as const,
                    }
                  : cur
                    ? { text: tr(locale, 'trucks.heatmap.onLoad'), tone: 'busy' as const }
                    : { text: tr(locale, 'trucks.heatmap.free'), tone: 'free' as const },
              }
            })}
          />
        </div>
      ),
    })
  }

  widgets.push({
    id: 'needs-load',
    span: 'full',
    node: (
      <div className="panel-inset [&>section]:mb-0 [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
        <NeedsLoad
          rows={idleFleet(trucks, live, placeByTruck, Date.now(), homeByTruck)}
          trucks={byId}
          trailers={trailers}
          locale={locale}
        />
      </div>
    ),
  })

  if (trucks.length > 0) {
    widgets.push({
      id: 'fleet',
      span: 'full',
      node: (
        <Tile
          title={tr(locale, 'overview.fleetHeading')}
          right={
            <Link href="/trucks" className="text-xs text-haul-400 hover:underline">
              {tr(locale, 'overview.trackingLink')}
            </Link>
          }
        >
          {/* Плиток в плитке нет: внутри виджета парк — это список строк, иначе две
              сетки друг в друге спорят за одни и те же колонки. */}
          <div className="grid gap-1 lg:grid-cols-2">
            {trucks.map((t) => {
              const fs = t.number ? byUnit.get(t.number) : undefined
              const week = weekGrossByTruck.get(t.id) ?? 0
              return (
                <Link
                  key={t.id}
                  href={`/trucks/${t.id}`}
                  /* min-h на телефоне: у трака без места кнопок нет, и без общей высоты
                     он оказывался на четверть ниже соседей — строки шли лесенкой. */
                  className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-white/[0.06] max-sm:min-h-[4.5rem]"
                >
                  <div className="relative shrink-0">
                    <DriverAvatar truckId={t.id} name={t.driverName} hasPhoto={photoIds.has(t.id)} size={30} />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-ink-900 ${driveDot(fs?.drive_status ?? null)}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-base font-medium">
                        {truckLabel(t, trailers.get(t.id))}
                      </span>
                      {t.unavailable && (
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-warn-400/15 text-warn-400">
                          {t.unavailable === 'repair' ? (
                            <Wrench size={9.5} strokeWidth={2.75} />
                          ) : (
                            <Palmtree size={9.5} strokeWidth={2.75} />
                          )}
                        </span>
                      )}
                    </div>
                    {/* Место и топливо — одной строкой, кнопки «Копировать» и «Карта» —
                        отдельной под ними. Раньше они стояли в общей строке с переносом,
                        и от длины названия города зависело, где именно строка порвётся:
                        у одного трака кнопки вставали рядом, у другого — столбиком, и
                        список шёл лесенкой в четыре строки на трак вместо трёх. */}
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-t2">
                      <span className="min-w-0 truncate">
                        {placeCity(fs?.location ?? null) ?? tr(locale, 'overview.noEldData')}
                      </span>
                      {fs?.fuel != null && (
                        <span
                          className={`nums flex shrink-0 items-center gap-0.5 text-2xs font-medium ${
                            fs.fuel <= 15 ? 'text-bad-400' : fs.fuel <= 30 ? 'text-warn-400' : 'text-t3'
                          }`}
                        >
                          <Fuel size={10} strokeWidth={2.5} />
                          {Math.round(fs.fuel)}%
                        </span>
                      )}
                      {placeCity(fs?.location ?? null) && (
                        <CopyPlace
                          hideText
                          text={placeCity(fs?.location ?? null)!}
                          coords={{ lat: fs?.lat, lng: fs?.lng }}
                          size="sm"
                          /* На телефоне кнопки занимают всю ширину и потому всегда
                             оказываются на своей строке — одинаково у всех траков.
                             На широком экране места хватает, и они встают рядом с
                             городом, как и было. */
                          className="max-sm:basis-full"
                        />
                      )}
                    </div>
                  </div>
                  <div
                    className={`nums shrink-0 whitespace-nowrap text-md font-bold ${week > 0 ? 'text-good-400' : 'text-t3'}`}
                  >
                    {usd.format(week)}
                  </div>
                </Link>
              )
            })}
          </div>
        </Tile>
      ),
    })
  }

  if (rows.length > 0) {
    widgets.push({
      id: 'loads',
      span: 'full',
      node: (
        <Tile
          title={tr(locale, 'overview.recentLoads')}
          right={
            <Link href="/loads" className="text-xs text-haul-400 hover:underline">
              {tr(locale, 'nav.loads')}
            </Link>
          }
        >
          {/* Строка-журнал: на телефоне в две строки, на широком экране в одну. */}
          {rows.slice(0, 8).map(({ load, truck, r }) => {
            const rcId = rateCons.get(load.id)
            return (
              <div
                key={load.id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 border-t border-white/[0.06] py-2 first:border-0 lg:grid-cols-[1fr_auto_auto_auto] lg:gap-x-5"
              >
                <Link href={`/loads/${load.id}`} className="min-w-0 truncate text-base hover:underline">
                  {load.origin ?? '—'} → {load.destination ?? '—'}
                </Link>
                <span className="nums text-right text-base font-semibold lg:order-last">
                  {usd.format(load.rate)}
                </span>
                <span className="col-span-2 flex items-center gap-2 lg:col-span-1">
                  <StatusBadge status={load.status} locale={locale} />
                  <span className="nums min-w-0 truncate text-xs text-t3">
                    <span className="text-t3">{truckLabel(truck)}</span> · {usd2.format(r.allInRpm)}/mi
                  </span>
                </span>
                {rcId && (
                  <span className="hidden lg:block">
                    <RateConButton docId={rcId} compact />
                  </span>
                )}
              </div>
            )
          })}
        </Tile>
      ),
    })
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{tr(locale, 'overview.title')}</h1>
          <p className="mt-0.5 text-base text-t2">
            {tr(locale, 'overview.truckCount').replace('{n}', String(trucks.length))}
          </p>
        </div>
        <Button href="/loads/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
          {tr(locale, 'overview.addLoad')}
        </Button>
      </header>

      <p className="mb-3 rounded-xl border border-haul-400/25 bg-haul-500/[0.09] px-3.5 py-2 text-base text-haul-300">
        Образец. Данные настоящие, но это копия — рабочий Обзор остаётся{' '}
        <Link href="/" className="font-semibold underline">
          на главной
        </Link>
        .
      </p>

      <div className="panel p-2.5">
        <WidgetGrid
          storageKey="ui-overview"
          hintTouch={tr(locale, 'grid.hintTouch')}
          hintPointer={tr(locale, 'grid.hintPointer')}
          rearrangeLabel={tr(locale, 'grid.rearrange')}
          doneLabel={tr(locale, 'grid.done')}
          resetLabel={tr(locale, 'grid.reset')}
          widgets={widgets}
        />
      </div>
    </main>
  )
}
