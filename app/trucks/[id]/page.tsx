import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/back-button'
import { currentLoadForTruck, getTruck, listDocs, listLoads, rateConByLoad } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import {
  fleetStatusByUnit,
  getTruckMeta,
  listMaintenance,
  listTodos,
  oilStatus,
} from '@/lib/maintenance'
import { tripHistory } from '@/lib/eld'
import { loadMapData, statusTone } from '@/lib/load-map'
import { usd, usd2, weekBounds, loadWeekAnchorMs } from '@/lib/fmt'
import { FleetMap } from '@/components/fleet-map'
import { StatusBadge } from '@/components/status'
import { TruckForm } from '@/components/truck-form'
import { TruckCare } from '@/components/truck-care'
import { DriverCard } from '@/components/driver-card'
import { TruckRcDrop } from '@/components/truck-rc-drop'
import { OrphanRateCons } from '@/components/orphan-ratecons'
import { DocList, DocUpload } from '@/components/docs'
import { RateConButton } from '@/components/ratecon-button'
import { TripHistory } from '@/components/trip-history'
import { SmallRefreshButton } from '@/components/small-refresh-button'
import { TruckAvailability } from '@/components/truck-availability'
import { Info } from '@/components/info'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

// truck_position_log is pruned to 7 days on every write (lib/eld.ts) — that's the
// real ceiling on how far back "full history" can ever reach, not a UI choice.
const HISTORY_WINDOWS = [
  { hours: 24, key: 'trucks.history.24h' },
  { hours: 72, key: 'trucks.history.3d' },
  { hours: 168, key: 'trucks.history.7d' },
] as const

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ history?: string }>
}) {
  const { id } = await params
  const companyId = await companyScope()
  const locale = await getLocale()
  const truck = await getTruck(companyId, Number(id))
  if (!truck) notFound()

  const requestedHours = Number((await searchParams).history)
  const historyWindow =
    HISTORY_WINDOWS.find((w) => w.hours === requestedHours) ?? HISTORY_WINDOWS[0]

  const [loads, meta, records, todos, fleet, docs, rateCons, history] = await Promise.all([
    listLoads(companyId, { truckId: truck.id }),
    getTruckMeta(truck.id),
    listMaintenance(truck.id),
    listTodos(truck.id),
    fleetStatusByUnit(),
    listDocs(companyId, { truckId: truck.id }),
    rateConByLoad(companyId),
    truck.number ? tripHistory(truck.number, historyWindow.hours) : Promise.resolve([]),
  ])
  const fs = truck.number ? fleet.get(truck.number) : undefined

  const live = loads.filter((l) => l.status !== 'cancelled')
  const rows = live.map((l) => ({ load: l, r: calcLoad(l, truck) }))
  const active = live.filter((l) => l.status === 'booked' || l.status === 'in_transit').length

  // The hero chips are all "this truck's week at a glance" — Чистыми/Ставка-миля
  // must come from the SAME loads as Рейт за неделю, or net (from every active
  // load ever) reads as bigger than gross (from just this week), which looks like
  // the math is broken even though each number was individually correct.
  const { start: weekBegin, end: weekEnd } = weekBounds()
  // Same anchoring as the trucks list: this week's rows are the loads RUN this week
  // (pickup date, Monday→Monday), so week gross/net/RPM all describe the same 7 days.
  const weekRows = rows.filter((x) => {
    const ms = loadWeekAnchorMs(x.load.pickupDate, x.load.createdAt)
    return ms >= weekBegin && ms < weekEnd
  })
  const weekGross = weekRows.reduce((s, x) => s + x.load.rate, 0)
  const totalNet = weekRows.reduce((s, x) => s + x.r.net, 0)
  const weekMiles = weekRows.reduce((s, x) => s + x.r.totalMiles, 0)
  const avgRpm = weekMiles > 0 ? weekRows.reduce((s, x) => s + x.r.gross, 0) / weekMiles : 0
  const openTodos = todos.filter((t) => !t.doneAt).length
  const oil = oilStatus(meta, fs?.odometer ?? null)

  // The truck's current assignment — feeds the hero's route/dates summary AND the
  // map below it, so it's fetched once, unconditionally (a truck can have an active
  // load worth showing even with no live GPS fix yet).
  const activeLoad = await currentLoadForTruck(companyId, truck.id)

  // Map: the truck where it sits (ELD GPS) plus a delivery pin at its active load's
  // destination city, with rough miles + drive time to it.
  const { markers: mapMarkers, routes: mapRoutes, miles: routeMiles } = await loadMapData(activeLoad, truck, fs, locale)

  const toneClass = {
    move: 'text-good-400',
    on: 'text-haul-400',
    rest: 'text-white/70',
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/trucks" label={t(locale, 'trucks.detail.backAll')} />

      {/* ===== HERO: the truck in the centre, key info around it ===== */}
      <section className="relative mt-3 overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-ink-800/80 to-ink-950 px-4 pt-5 pb-4 sm:px-8">
        <div className="text-center">
          <h1 className="text-[26px] font-bold leading-none">{truck.number ?? truck.name}</h1>

          {/* One wrapping row instead of a stack of full-width lines — trailer,
              driver, phone and live GPS all read as one compact block on any width,
              wrapping to extra lines on narrow phones instead of stretching tall. */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 text-[13px]">
            {meta?.trailerNumber && (
              <>
                <span className="text-white/55">{t(locale, 'trucks.detail.trailer')} {meta.trailerNumber}</span>
                <span aria-hidden className="text-white/25">·</span>
              </>
            )}
            <span className="font-medium text-white/85">{truck.driverName || t(locale, 'trucks.detail.noDriver')}</span>
            <span aria-hidden className="text-white/25">·</span>
            {/* Driver contact — the number a dispatcher actually needs at hand. */}
            {meta?.driverPhone ? (
              <a
                href={`tel:${meta.driverPhone}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 font-medium text-white/85 transition-colors hover:bg-white/12"
              >
                📞 {meta.driverPhone}
              </a>
            ) : (
              <span className="text-white/40">{t(locale, 'trucks.detail.noPhone')}</span>
            )}
            {fs?.location && (
              <>
                <span aria-hidden className="text-white/25">·</span>
                <span className={toneClass[statusTone(fs.driveStatus)]}>
                  📍 {fs.location}
                  {fs.driveStatus && ` · ${fs.driveStatus}`}
                </span>
              </>
            )}
          </div>

          {(meta?.vin || meta?.plate) && (
            <p className="mt-1.5 text-[11px] text-white/45">
              {[meta.plate && `${t(locale, 'trucks.detail.plateLabel')} ${meta.plate}`, meta.vin && `VIN ${meta.vin}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {/* Manual availability — dims the truck across the app and pulls it out of
              the "free" counters until it's flipped back. */}
          <div className="mt-2.5">
            <TruckAvailability truckId={truck.id} current={truck.unavailable} locale={locale} />
          </div>
        </div>

        <img
          src="/truck.png"
          alt={`${t(locale, 'trucks.detail.truckAlt')} ${truck.number ?? ''}`}
          className="mx-auto my-1 w-full max-w-3xl drop-shadow-2xl"
        />

        {/* Info ring — the truck's numbers at a glance. */}
        {/* Five across once there's a fuel reading, four without — a truck whose ELD
            never reports fuel should not get an empty tile holding the space. */}
        <div className={`grid grid-cols-2 gap-2 ${fs?.fuel != null ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
          <Chip
            label={t(locale, 'trucks.chip.weekRate')}
            value={usd.format(weekGross)}
            tone={weekGross > 0 ? 'good' : undefined}
            info={t(locale, 'trucks.chip.weekRateInfo')}
          />
          <Chip
            label={t(locale, 'trucks.chip.net')}
            value={usd.format(totalNet)}
            tone={totalNet >= 0 ? 'good' : 'bad'}
            info={t(locale, 'trucks.chip.netInfo')}
          />
          <Chip
            label={t(locale, 'trucks.chip.rpm')}
            value={`${usd2.format(avgRpm)}`}
            info={t(locale, 'trucks.chip.rpmInfo')}
          />
          <Chip
            label={t(locale, 'trucks.chip.oilIn')}
            value={oil ? `${Math.max(0, oil.milesLeft).toLocaleString('en-US')} mi` : '—'}
            tone={oil?.tone}
            info={t(locale, 'trucks.chip.oilInInfo')}
          />
          {fs?.fuel != null && (
            <Chip
              label={t(locale, 'trucks.chip.fuel')}
              value={`${Math.round(fs.fuel)}%`}
              tone={fs.fuel <= 15 ? 'bad' : fs.fuel <= 30 ? 'warn' : undefined}
              info={t(locale, 'trucks.chip.fuelInfo')}
            />
          )}
        </div>

        {/* ===== Current assignment: route, pickup/delivery dates, at a glance ===== */}
        <div className="mt-4 border-t border-white/8 pt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'trucks.detail.currentAssignment')}
            <Info text={t(locale, 'trucks.detail.currentAssignmentInfo')} />
          </h2>
          {activeLoad ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/loads/${activeLoad.id}`}
                  className="truncate text-[16px] font-semibold hover:text-haul-400"
                >
                  {activeLoad.origin ?? '—'} → {activeLoad.destination ?? '—'}
                </Link>
                <StatusBadge status={activeLoad.status} locale={locale} />
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/45">{t(locale, 'trucks.detail.pickup')}</dt>
                  <dd className="font-medium text-white/85">
                    {activeLoad.pickupTime || activeLoad.pickupDate?.slice(0, 10) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/45">Delivery</dt>
                  <dd className="font-medium text-white/85">
                    {activeLoad.deliveryTime || activeLoad.deliveryDate?.slice(0, 10) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/45">{t(locale, 'trucks.detail.rate')}</dt>
                  <dd className="font-medium text-white/85">{usd.format(activeLoad.rate)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-white/55">
              {t(locale, 'trucks.detail.noActiveLoad')}
              <Link href={`/loads/new?truck=${truck.id}`} className="text-haul-400 hover:underline">
                {t(locale, 'trucks.detail.addLoad')}
              </Link>
            </div>
          )}
        </div>

        {/* ===== Driver: name, phone, licence dates — merged into the same card ===== */}
        <div className="mt-4 border-t border-white/8 pt-4">
          <DriverCard
            truckId={truck.id}
            name={truck.driverName}
            phone={meta?.driverPhone ?? null}
            cdlExpiry={meta?.cdlExpiry ?? null}
            medcardExpiry={meta?.medcardExpiry ?? null}
            hasPhoto={meta?.hasPhoto ?? false}
            embedded
            locale={locale}
          />
        </div>
      </section>

      {/* ===== Map: where the truck sits + where delivery is ===== */}
      {mapMarkers.length > 0 && (
        <section className="panel mt-4 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              {t(locale, 'trucks.detail.onMap')}
              <Info text={t(locale, 'trucks.detail.onMapInfo')} />
            </h2>
            <SmallRefreshButton />
          </div>
          <FleetMap markers={mapMarkers} routes={mapRoutes} height={300} distanceMi={routeMiles} />
        </section>
      )}

      {/* ===== Trip history: drive legs + stops, long rests called out ===== */}
      <details className="panel mt-4 p-4" open={history.length > 0}>
        <summary className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'trucks.detail.tripHistory')} · {t(locale, historyWindow.key)}
          <Info text={t(locale, 'trucks.detail.tripHistoryInfo')} />
          <SmallRefreshButton />
          <span className="ml-auto flex gap-1 normal-case">
            {HISTORY_WINDOWS.map((w) => (
              <Link
                key={w.hours}
                href={w.hours === 24 ? `/trucks/${truck.id}` : `/trucks/${truck.id}?history=${w.hours}`}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  w.hours === historyWindow.hours
                    ? 'bg-haul-500/15 text-haul-400'
                    : 'text-white/45 hover:text-white/75'
                }`}
              >
                {t(locale, w.key)}
              </Link>
            ))}
          </span>
        </summary>
        <div className="mt-3">
          <TripHistory legs={history} locale={locale} />
        </div>
      </details>

      {/* ===== RC drop — the fastest path: paperwork in, load out ===== */}
      <section className="panel mt-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'trucks.detail.newLoadFromRc')}
            <Info text={t(locale, 'trucks.detail.newLoadFromRcInfo')} />
          </h2>
          <Link
            href={`/loads/new?truck=${truck.id}`}
            className="text-[12px] text-white/55 hover:text-white/85"
          >
            {t(locale, 'trucks.detail.orManually')}
          </Link>
        </div>
        <TruckRcDrop truckId={truck.id} />
        <OrphanRateCons
          truckId={truck.id}
          docs={docs
            .filter((d) => d.kind === 'ratecon' && d.loadId === null)
            .map((d) => ({ id: d.id, title: d.title, uploadedAt: d.uploadedAt }))}
        />
      </section>

      {/* ===== Around the truck: loads + documents ===== */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/62">
              {t(locale, 'trucks.detail.loadsHeading')}{active > 0 && ` · ${active} ${t(locale, 'trucks.detail.inProgress')}`}
            </h2>
            <Link href={`/loads/new?truck=${truck.id}`} className="text-[12px] text-haul-400 hover:underline">
              {t(locale, 'trucks.detail.addLoad')}
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="text-[13px] text-white/55">{t(locale, 'trucks.detail.noLoadsYet')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map(({ load, r }) => {
                const rcId = rateCons.get(load.id)
                return (
                  /* Two lines, not one. This card sits in a half-width column beside the
                     documents panel, and the old single row asked the route, the status
                     badge, the rate and the RC button to share ~330px — so every route
                     clipped to "Denver, CO → Kansas C…". Route owns line one; the money
                     drops to line two, where it has the width to itself. */
                  <div
                    key={load.id}
                    className="rounded-xl border border-white/6 p-3 transition-colors hover:border-white/15"
                  >
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/loads/${load.id}`}
                        className="min-w-0 flex-1 truncate text-md font-medium hover:text-haul-400"
                      >
                        {load.origin ?? '—'} → {load.destination ?? '—'}
                      </Link>
                      <StatusBadge status={load.status} locale={locale} />
                      {rcId && <RateConButton docId={rcId} compact />}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="nums min-w-0 truncate text-sm text-white/60">
                        {t(locale, 'trucks.detail.netLower')}{' '}
                        <span className={r.net >= 0 ? 'text-good-400/90' : 'text-bad-400/90'}>
                          {usd.format(r.net)}
                        </span>{' '}
                        · {usd2.format(r.allInRpm)}/mi
                      </span>
                      {/* Headline is the load's actual RATE, never net — the owner reads
                          these cards as "what this load is worth". Net is the small line. */}
                      <span className="nums shrink-0 text-md font-bold">{usd.format(load.rate)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="panel p-4">
          <div className="mb-2">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              {t(locale, 'trucks.detail.documents')}
              <Info text={t(locale, 'trucks.detail.documentsInfo')} />
            </h2>
          </div>
          <DocUpload truckId={truck.id} />
          {/* attachTargets = this truck's live loads, so a file that came in via
              Telegram and landed under the truck can be recognised into a load or
              linked to an existing one straight from the list. */}
          <DocList
            docs={docs}
            attachTargets={live.map((l) => ({
              id: l.id,
              label: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
            }))}
          />
        </section>
      </div>

      {/* ===== Care: oil, to-fix, compliance dates, service log ===== */}
      <div className="mt-4">
        <TruckCare
          truckId={truck.id}
          meta={meta}
          records={records}
          todos={todos}
          currentOdometer={fs?.odometer ?? null}
          oil={oil}
          docs={docs}
          locale={locale}
        />
      </div>
      {openTodos > 0 && (
        <p className="mt-2 text-center text-[12px] text-bad-400">
          {t(locale, 'trucks.detail.needsFixPrefix')} {openTodos} {t(locale, 'trucks.detail.needsFixSuffix')}
        </p>
      )}

      {/* ===== Economics — collapsed by default (rarely changed) ===== */}
      <details className="panel mt-4 p-4">
        <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'trucks.detail.economics')}
          <Info text={t(locale, 'trucks.detail.economicsInfo')} />
        </summary>
        <div className="mt-4">
          <TruckForm
            id={truck.id}
            initial={{
              number: truck.number ?? '',
              driverName: truck.driverName ?? '',
              mpg: truck.mpg,
              fuelPricePerGallon: truck.fuelPricePerGallon,
              driverPay: truck.driverPay,
              truckPaymentPerDay: truck.truckPaymentPerDay,
              insurancePerDay: truck.insurancePerDay,
              eldPermitsPerDay: truck.eldPermitsPerDay,
              maintenanceCostPerMile: truck.maintenanceCostPerMile,
              factoringPercent: truck.factoringPercent,
              dispatchPercent: truck.dispatchPercent,
            }}
            locale={locale}
          />
        </div>
      </details>
    </main>
  )
}

function Chip({
  label,
  value,
  tone,
  info,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'warn'
  info?: string
}) {
  const color =
    tone === 'good' ? 'text-good-400' : tone === 'bad' ? 'text-bad-400' : tone === 'warn' ? 'text-warn-400' : 'text-white'
  return (
    <div className="rounded-xl border border-white/8 bg-ink-900/50 px-3 py-2 text-center backdrop-blur">
      <div className={`nums text-[16px] font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-white/55">
        {label}
        {info && <Info text={info} />}
      </div>
    </div>
  )
}
