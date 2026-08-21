import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/back-button'
import { getTruck, listDocs, listLoads, rateConByLoad } from '@/lib/loads'
import { currentLoadsByTruck, truckLabel } from '@/lib/map'
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
import { TripHistoryPanel } from '@/components/trip-history-panel'
import { SmallRefreshButton } from '@/components/small-refresh-button'
import { TruckAvailability } from '@/components/truck-availability'
import { Info } from '@/components/info'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

// The log itself now keeps 100 days (lib/eld.ts, so a quarterly IFTA report has data
// to stand on), but the UI still offers at most 7: further back the trail is useful to
// a tax calculation, not to a dispatcher reading a trip.
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
  const hasUrgentTodo = todos.some((t) => !t.doneAt && t.priority === 'urgent')
  const oil = oilStatus(meta, fs?.odometer ?? null)

  // The truck's current assignment — feeds the hero's route/dates summary AND the map
  // below it. From the loads already in hand, not a fresh query. currentLoadForTruck() asked the
  // database for exactly what listLoads({ truckId }) fetched at the top of this function
  // — newest booked/in_transit load for this truck — and it sat SERIAL in front of
  // loadMapData()'s external routing call, so the round trip was on the page's critical
  // path twice over. currentLoadsByTruck() is the same rule, in memory, and is what
  // /trucks and /tracking already use.
  const activeLoad = currentLoadsByTruck(live).get(truck.id) ?? null

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
                {/* Кнопка, а не текст-ссылка: маршрут — единственный переход с трака на
                    его груз, и подчёркиванием при наведении он себя не выдавал. */}
                <Link
                  href={`/loads/${activeLoad.id}`}
                  className="group flex min-w-0 items-center gap-2 rounded-xl border border-haul-500/35 bg-haul-500/[0.10] px-3 py-1.5 transition-colors hover:border-haul-400/60 hover:bg-haul-500/20"
                >
                  <span className="truncate text-[16px] font-semibold">
                    {activeLoad.origin ?? '—'} → {activeLoad.destination ?? '—'}
                  </span>
                  <span className="shrink-0 text-[14px] text-haul-300 transition-transform group-hover:translate-x-0.5">
                    ↗
                  </span>
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

      {/* Незакрытый ремонт — прямо над картой, а не строкой в самом низу страницы: раньше
          о поломке узнавали, только домотав до «Журнала», то есть практически никогда.
          Висит, пока пункт не отметят выполненным в разделе «Нужно починить». */}
      {openTodos > 0 && (
        <a
          href="#care"
          className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
            hasUrgentTodo
              ? 'border-bad-500/35 bg-bad-500/[0.10] hover:bg-bad-500/[0.15]'
              : 'border-warn-500/30 bg-warn-500/[0.08] hover:bg-warn-500/[0.13]'
          }`}
        >
          <span
            className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ${
              hasUrgentTodo
                ? 'bg-bad-500/20 text-bad-400 ring-bad-400/25'
                : 'bg-warn-500/20 text-warn-400 ring-warn-400/25'
            }`}
          >
            <span className="text-[12px] leading-none">🔧</span>
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`text-2xs font-semibold uppercase tracking-wider ${
                hasUrgentTodo ? 'text-bad-400' : 'text-warn-400'
              }`}
            >
              {t(locale, 'trucks.care.todoHeading')} · {openTodos}
            </p>
            <p className="mt-0.5 text-[13px] text-white/80">
              {todos
                .filter((x) => !x.doneAt)
                .slice(0, 4)
                .map((x) => (x.priority === 'urgent' ? `${x.title} (${t(locale, 'trucks.care.prioUrgent')})` : x.title))
                .join(' · ')}
              {openTodos > 4 && ` … +${openTodos - 4}`}
            </p>
          </div>
        </a>
      )}

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
      {/* The window switch is client-side now — see components/trip-history-panel.tsx.
          ?history= is still honoured for the initial render so existing links keep
          working, it just isn't how the buttons change the window any more. */}
      <TripHistoryPanel
        truckId={truck.id}
        windows={HISTORY_WINDOWS}
        initialHours={historyWindow.hours}
        initialLegs={history}
        // Города погрузок и выгрузок этого трака — по ним стоянка в истории
        // распознаётся как детеншен. Грузы уже загружены выше, нового запроса нет.
        stops={loads.flatMap((l) => [
          ...(l.origin ? [{ city: l.origin, kind: 'pickup' as const, day: l.pickupDate }] : []),
          ...(l.destination ? [{ city: l.destination, kind: 'delivery' as const, day: l.deliveryDate }] : []),
        ])}
      />

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
      {/* No `items-start` here on purpose. With it each column was only as tall as its
          own content, so a truck with seven loads and three documents left a column of
          bare page background beside the documents panel. Stretched, both panels end on
          the same line, and the lists inside them are capped and scroll — so whichever
          side has more rows, the block stays the same compact height. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="panel flex flex-col p-4">
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
            <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
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
                    className="panel-interactive relative rounded-xl border border-white/6 p-3"
                  >
                    {/* The WHOLE row opens the load now, not just the route text — a
                        2cm-wide link inside a card-sized target is a miss waiting to
                        happen. Overlay link, so the RC button next to it keeps working
                        (an anchor inside an anchor is invalid HTML and eats clicks). */}
                    <Link
                      href={`/loads/${load.id}`}
                      aria-label={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
                      className="absolute inset-0 rounded-[inherit]"
                    />
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-md font-medium">
                        {load.origin ?? '—'} → {load.destination ?? '—'}
                      </span>
                      <StatusBadge status={load.status} locale={locale} />
                      {rcId && (
                        <span className="relative z-10">
                          <RateConButton docId={rcId} compact />
                        </span>
                      )}
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

        <section className="panel flex flex-col p-4">
          <div className="mb-2">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              {t(locale, 'trucks.detail.documents')}
              <Info text={t(locale, 'trucks.detail.documentsInfo')} />
            </h2>
          </div>
          <DocUpload truckId={truck.id} />
          {/* attachTargets = this truck's live loads, so a file that came in via
              Telegram and landed under the truck can be recognised into a load or
              linked to an existing one straight from the list.
              Capped like the loads list opposite: a truck with a dozen files would
              otherwise stretch this column past the loads beside it — the same
              imbalance, just mirrored. */}
          <div className="max-h-[28rem] overflow-y-auto pr-1">
            <DocList
              docs={docs}
              attachTargets={live.map((l) => ({
                id: l.id,
                label: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
              }))}
            />
          </div>
        </section>
      </div>

      {/* ===== Care: oil, to-fix, compliance dates, service log =====
           id="care" is the target of the document-deadline links on the dashboard.
           They used to point at ?tab=care — a parameter nothing has ever read, so the
           click landed at the top of the page and left the dispatcher to scroll for the
           expiry they had just clicked on. */}
      <div id="care" className="mt-4 scroll-mt-4">
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

      {/* ===== Economics — collapsed by default (rarely changed) ===== */}
      <details className="group panel mt-4 p-4">
        <summary className="-m-1 flex cursor-pointer list-none items-center gap-1.5 rounded-lg p-1 text-[11px] font-semibold uppercase tracking-wider text-white/62 transition-colors hover:bg-white/[0.03] hover:text-white/90">
          <span className="text-[13px] leading-none text-white/40 transition-transform duration-200 group-open:rotate-90">
            ▸
          </span>
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
