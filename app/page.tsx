import {
  CalendarClock,
  DollarSign,
  Fuel,
  MessageSquareWarning,
  Package,
  Palmtree,
  Plus,
  Route,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/button'
import { Suspense } from 'react'
import Link from 'next/link'
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
import { deliveryInfo } from '@/lib/geo-routing'
import { fleetExpiryAlerts, truckPhotoFlags, truckTrailerNumbers } from '@/lib/maintenance'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t as tr, type Locale } from '@/lib/i18n'
import { can } from '@/lib/capabilities-server'
import { usd, usd2, driveTime, weekStart } from '@/lib/fmt'
import { StatusBadge } from '@/components/status'
import { FleetHeatmap } from '@/components/fleet-heatmap'
import { buildWorkingDays } from '@/lib/heatmap'
import { RateConButton } from '@/components/ratecon-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

type FS = {
  unit: string
  drive_status: string | null
  location: string | null
  lat: number | null
  lng: number | null
  fuel: number | null
}

// HOS isn't connected (Live Share gives GPS only), so the dot shows the LIVE drive
// status instead of stale hours: rolling = green, on-duty = blue, else muted.
function driveDot(s: string | null): string {
  if (!s) return 'bg-white/20'
  if (/mi\/h|^d$/i.test(s)) return 'bg-good-500'
  if (/^on$/i.test(s)) return 'bg-haul-500'
  return 'bg-white/30'
}

function driveDotTitle(s: string | null, locale: Locale): string {
  if (!s) return tr(locale, 'overview.driveDot.noEld')
  if (/mi\/h|^d$/i.test(s)) return tr(locale, 'overview.driveDot.moving')
  if (/^on$/i.test(s)) return tr(locale, 'overview.driveDot.onDuty')
  return tr(locale, 'overview.driveDot.stopped')
}

// ELD gives "12.0mi N from Ashland, VA" — the card just wants "Ashland, VA".
function cityOf(location: string | null): string | null {
  if (!location) return null
  const m = location.match(/from\s+(.+)$/i)
  return m ? m[1] : location
}

export default async function Page() {
  const companyId = await companyScope()
  const locale = await getLocale()
  const user = await getCurrentUser()
  const showFinances = await can(user, 'finances')
  const [loads, trucks, fleetRaw, alerts, rateCons, photoIds, trailers, receivables, uninvoiced] =
    await Promise.all([
      listLoads(companyId),
      listTrucks(companyId),
      sql`SELECT unit, drive_status, location, lat, lng, fuel FROM fleet_status`,
      // Без локали функция подставляла 'en' по умолчанию, и подписи о сроках
      // документов на главной были английскими при русском интерфейсе.
      fleetExpiryAlerts(companyId, locale),
      rateConByLoad(companyId),
      truckPhotoFlags(companyId),
      truckTrailerNumbers(companyId),
      // Only fetched when actually shown below — a dispatcher without the finances
      // capability shouldn't see money figures even loaded, not just hidden by CSS.
      showFinances ? listReceivables(companyId) : Promise.resolve([]),
      showFinances ? listUninvoicedDelivered(companyId) : Promise.resolve([]),
    ])
  const fleet = fleetRaw as FS[]
  const byId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const byUnit = new Map(fleet.map((f) => [f.unit, f]))
  const fallback = trucks[0]

  // Each load is costed against its own truck, then summed across the fleet.
  const live = loads.filter((l) => l.status !== 'cancelled')

  // Was a currentLoadForTruck() query PER TRUCK, on top of the listLoads() above that
  // had already fetched every one of them. Same answer, N fewer round trips.
  const currentByTruck = currentLoadsByTruck(live)
  const rows = live.flatMap((load) => {
    const truck = (load.truckId !== null ? byId.get(load.truckId) : undefined) ?? fallback
    return truck ? [{ load, truck, r: calcLoad(load, truck) }] : []
  })
  const totalNet = rows.reduce((s, x) => s + x.r.net, 0)
  const totalGross = rows.reduce((s, x) => s + x.r.gross, 0)
  const totalMiles = rows.reduce((s, x) => s + x.r.totalMiles, 0)
  const avgRpm = totalMiles > 0 ? rows.reduce((s, x) => s + x.r.gross, 0) / totalMiles : 0
  const active = live.filter((l) => l.status === 'booked' || l.status === 'in_transit').length
  // Trucks with nothing booked/in_transit right now — free to take a load. A truck
  // manually flagged в ремонте/отпуск isn't free either, whatever its load list says.
  const busyTruckIds = new Set(
    live.filter((l) => (l.status === 'booked' || l.status === 'in_transit') && l.truckId != null).map((l) => l.truckId),
  )
  const freeTrucks = trucks.filter((t) => !busyTruckIds.has(t.id) && !t.unavailable).length

  // Per-truck gross (rate) booked this calendar week (Mon–Mon) — replaces the useless
  // HOS % in the fleet list now that HOS isn't wired up.
  const weekBegin = weekStart()
  const weekGrossByTruck = new Map<number, number>()
  for (const l of live) {
    if (l.truckId == null || new Date(l.createdAt).getTime() < weekBegin) continue
    weekGrossByTruck.set(l.truckId, (weekGrossByTruck.get(l.truckId) ?? 0) + l.rate)
  }

  // Ждём оплаты: everything invoiced-but-unpaid, plus delivered loads with no
  // invoice yet at all — same two buckets the Финансы page's "Не оплачено" tab uses,
  // just summed to one figure for the dashboard.
  const unpaidTotal = receivables.reduce((s, r) => s + r.load.rate, 0) + uninvoiced.reduce((s, l) => s + l.rate, 0)
  const overdue = receivables.filter((r) => r.overdue)
  const overdueTotal = overdue.reduce((s, r) => s + r.load.rate, 0)

  // Важное от брокера, ещё не прочитанное — the same "must-read" flag BrokerNotes
  // highlights on the load page, surfaced here so it can't get missed by never
  // opening that particular load.
  const unreadNotes = live.filter((l) => l.brokerNotes && !l.notesReadAt)

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{tr(locale, 'overview.title')}</h1>
          <p className="mt-0.5 text-base text-white/60">
            {tr(locale, 'overview.truckCount').replace('{n}', String(trucks.length))}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <Button href="/loads/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
            {tr(locale, 'overview.addLoad')}
          </Button>
          <Info side="bottom" text={tr(locale, 'overview.addLoadInfo')} />
        </span>
      </header>

      {alerts.length > 0 && (
        <div className="mb-3 flex gap-2.5 rounded-xl border border-warn-400/25 bg-warn-400/[0.07] px-3.5 py-2.5">
          {/* A coloured rule down the left edge plus an icon chip: at a glance this is
              now recognisably a WARNING block rather than one more card of text. */}
          <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-warn-400/15 text-warn-400 ring-1 ring-warn-400/25">
            <CalendarClock size={15} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-warn-400">
            {tr(locale, 'overview.docDeadlines')}
            <Info text={tr(locale, 'overview.docDeadlinesInfo')} />
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-base">
            {alerts.slice(0, 6).map((a) => (
              <Link
                key={`${a.truckId}-${a.item.label}`}
                href={`/trucks/${a.truckId}#care`}
                className="text-white/80 hover:underline"
              >
                <span className="text-white/50">#{a.number}</span> {a.item.label} —{' '}
                <span className={a.item.tone === 'bad' ? 'text-bad-400' : 'text-warn-400'}>
                  {a.item.daysLeft < 0 ? tr(locale, 'overview.overdue') : tr(locale, 'overview.daysLeft').replace('{n}', String(a.item.daysLeft))}
                </span>
              </Link>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* The two SHORT alerts share a row on a wide screen. The deadline strip above
          keeps the full width on purpose — it carries up to six items, and a third of
          a row shreds them into unreadable stubs. These two split into columns only
          when BOTH are present: a single banner sitting at half width reads like the
          other half failed to load. */}
      {(unreadNotes.length > 0 || (showFinances && unpaidTotal > 0)) && (
        <div
          className={`mb-3 grid gap-2.5 ${
            unreadNotes.length > 0 && showFinances && unpaidTotal > 0 ? 'lg:grid-cols-2' : ''
          }`}
        >
      {unreadNotes.length > 0 && (
        <div className="flex gap-2.5 rounded-xl border border-haul-400/25 bg-haul-500/[0.09] px-3.5 py-2.5">
          <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-haul-500/20 text-haul-300 ring-1 ring-haul-400/25">
            <MessageSquareWarning size={15} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-haul-300">
              {tr(locale, 'overview.brokerUnread')}
              <Info text={tr(locale, 'overview.brokerUnreadInfo')} />
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-base">
              {unreadNotes.slice(0, 6).map((l) => (
                <Link key={l.id} href={`/loads/${l.id}`} className="text-white/80 hover:underline">
                  {l.origin ?? '—'} → {l.destination ?? '—'}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFinances && unpaidTotal > 0 && (
        <div
          className={`flex gap-2.5 rounded-xl border px-3.5 py-2.5 ${
            overdueTotal > 0 ? 'border-bad-500/25 bg-bad-500/[0.07]' : 'border-white/10 bg-white/[0.03]'
          }`}
        >
          {/* Same icon-chip anatomy as the two banners above, so the three of them read
              as one family of "things needing attention" instead of three loose boxes.
              The chip is the only part that changes colour when money is overdue. */}
          <span
            className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ${
              overdueTotal > 0
                ? 'bg-bad-500/15 text-bad-400 ring-bad-400/25'
                : 'bg-white/[0.06] text-white/60 ring-white/10'
            }`}
          >
            <Wallet size={15} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
          <p
            className={`flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider ${
              overdueTotal > 0 ? 'text-bad-400' : 'text-white/55'
            }`}
          >
            {tr(locale, 'overview.awaitingPayment')}
            <Info text={tr(locale, 'overview.awaitingPaymentInfo')} />
          </p>
          <p className="mt-1 text-base text-white/80">
            <Link href="/invoices" className="nums font-semibold hover:underline">
              {usd.format(unpaidTotal)}
            </Link>
            {overdueTotal > 0 && (
              <span className="text-bad-400">
                {' '}
                — {tr(locale, 'overview.ofWhichOverdue')}{' '}
                <Link href="/invoices" className="nums font-semibold hover:underline">
                  {usd.format(overdueTotal)}
                </Link>{' '}
                ({overdue.length})
              </span>
            )}
          </p>
          </div>
        </div>
      )}
        </div>
      )}

      {/* Четыре в ряд только с lg. На 640px четвёрка давала по ~155px на плитку, и
          «$81,799» вылезал за край, а подпись схлопывалась в «TOT…». На планшете две
          широкие читаются, четыре узкие — нет. */}
      {loads.length > 0 && (
        <div className="panel mb-4 grid grid-cols-2 gap-2.5 p-2.5 lg:grid-cols-4">
          <Stat
            href="/loads"
            hero
            icon={<DollarSign size={15} strokeWidth={2.5} />}
            accent="haul"
            label={tr(locale, 'overview.rateTotal')}
            value={usd.format(totalGross)}
            sub={tr(locale, 'overview.rateTotalSub').replace('{v}', usd.format(totalNet))}
            subTone={totalNet >= 0 ? 'good' : 'bad'}
            info={tr(locale, 'overview.rateTotalInfo')}
            /* Share of the gross that survives as profit — the one ratio an owner
               actually watches, and the reason this tile is the widest. */
            meter={totalGross > 0 ? Math.max(0, Math.min(1, totalNet / totalGross)) : 0}
          />
          <Stat
            href="/trucks"
            icon={<TrendingUp size={15} strokeWidth={2.5} />}
            accent="good"
            label={tr(locale, 'overview.rpm')}
            value={`${usd2.format(avgRpm)}/mi`}
            info={tr(locale, 'overview.rpmInfo')}
          />
          <Stat
            href="/loads"
            icon={<Package size={15} strokeWidth={2.5} />}
            accent="warn"
            label={tr(locale, 'overview.inWork')}
            value={String(active)}
            sub={trucks.length > 0 ? tr(locale, 'overview.inWorkSub').replace('{n}', String(freeTrucks)) : undefined}
            subTone={freeTrucks > 0 ? 'good' : undefined}
            info={tr(locale, 'overview.inWorkInfo')}
          />
          <Stat
            href="/tracking"
            icon={<Route size={15} strokeWidth={2.5} />}
            accent="haul"
            label={tr(locale, 'overview.totalMiles')}
            value={Math.round(totalMiles).toLocaleString('en-US')}
            info={tr(locale, 'overview.totalMilesInfo')}
          />
        </div>
      )}

      {/* Fleet utilisation heatmap — the same section as /trucks, surfaced on the
          Overview so idle trucks and fleet-wide gaps are visible without leaving the
          dashboard. Only when there are loads to plot. */}
      {trucks.length > 0 && live.length > 0 && (
        <div className="mb-6">
          <FleetHeatmap
            rows={trucks.map((t) => ({
              id: t.id,
              label: t.number?.trim() || t.name,
              working: buildWorkingDays(live.filter((l) => l.truckId === t.id)),
            }))}
          />
        </div>
      )}

      {/* Fleet at a glance — driver + last-known ELD status, straight from the trucks. */}
      <div className="mb-2 mt-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {tr(locale, 'overview.fleetHeading')}
          <Info text={tr(locale, 'overview.fleetInfo')} />
        </h2>
        <Link href="/tracking" className="text-[12px] text-haul-400 hover:underline">
          {tr(locale, 'overview.trackingLink')}
        </Link>
      </div>
      <div className="stagger grid gap-2 sm:grid-cols-2">
        {trucks.map((t) => {
          const fs = t.number ? byUnit.get(t.number) : undefined
          const week = weekGrossByTruck.get(t.id) ?? 0
          // Where it's headed is known for free right here; how far is a routing call,
          // so the destination paints instantly and only the mileage streams in.
          const cur = currentByTruck.get(t.id)
          const dest =
            fs?.lat != null && fs.lng != null && cur?.destination
              ? { lat: fs.lat, lng: fs.lng, to: cur.destination }
              : null
          return (
            <Link
              key={t.id}
              href={`/trucks/${t.id}`}
              // min-w-0: this card is a grid item (single column below `sm`) and grid
              // items default to min-width:auto, so its own natural content width
              // was blowing out the grid track past the viewport on narrow phones.
              className="panel panel-interactive group flex min-w-0 flex-col gap-2.5 p-3.5"
            >
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <DriverAvatar truckId={t.id} name={t.driverName} hasPhoto={photoIds.has(t.id)} size={40} />
                  <span
                    title={driveDotTitle(fs?.drive_status ?? null, locale)}
                    className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-ink-900 ${driveDot(fs?.drive_status ?? null)}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-md font-medium">{truckLabel(t)}</span>
                    {/* Icon-only, with the words on hover. Spelled out ("🔧 в ремонте")
                        this badge took ~55px out of the very row that holds the truck
                        number and driver name, and those two are what the card is for
                        — the wrench already says everything at a glance. */}
                    {t.unavailable && (
                      <span
                        title={
                          t.unavailable === 'repair'
                            ? tr(locale, 'overview.repair')
                            : tr(locale, 'overview.onVacation')
                        }
                        className="flex size-4 shrink-0 items-center justify-center rounded-full bg-warn-400/15 text-warn-400"
                      >
                        {t.unavailable === 'repair' ? (
                          <Wrench size={9.5} strokeWidth={2.75} />
                        ) : (
                          <Palmtree size={9.5} strokeWidth={2.75} />
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 truncate text-[12px] text-white/60">
                    <span className="min-w-0 truncate">
                      {trailers.has(t.id) && <>{tr(locale, 'overview.trailer').replace('{n}', String(trailers.get(t.id)))}</>}
                      {cityOf(fs?.location ?? null) ?? tr(locale, 'overview.noEldData')}
                    </span>
                    {/* Tank level rides with the location line — same glance, and it
                        never has to compete with the week's money on the right. */}
                    {fs?.fuel != null && (
                      <span
                        title={tr(locale, 'trucks.chip.fuelInfo')}
                        className={`nums flex shrink-0 items-center gap-0.5 text-2xs font-medium ${
                          fs.fuel <= 15
                            ? 'text-bad-400'
                            : fs.fuel <= 30
                              ? 'text-warn-400'
                              : 'text-white/45'
                        }`}
                      >
                        <Fuel size={10} strokeWidth={2.5} />
                        {Math.round(fs.fuel)}%
                      </span>
                    )}
                  </div>
                </div>
                {/* The week's money. It briefly had a tinted plate with its own ring
                    and padding, which read well but stole ~24px from the same row as
                    the driver's name — enough that "DEMO-428 · Casey Brooks" started
                    clipping on any truck that also carries a repair/vacation badge.
                    Colour alone carries the emphasis; the box was costing more than
                    it was worth. */}
                <div className="min-w-0 shrink-0 text-right">
                  <div
                    className={`nums whitespace-nowrap text-md font-bold leading-tight ${week > 0 ? 'text-good-400' : 'text-white/40'}`}
                  >
                    {usd.format(week)}
                  </div>
                  <div className="flex items-center justify-end gap-1 text-2xs uppercase tracking-wider text-white/40">
                    {tr(locale, 'overview.perWeek')}
                    <Info text={tr(locale, 'overview.perWeekInfo')} />
                  </div>
                </div>
              </div>
              {dest && (
                <Suspense fallback={<DeliveryRow to={dest.to} locale={locale} />}>
                  <DeliveryLine lat={dest.lat} lng={dest.lng} to={dest.to} locale={locale} />
                </Suspense>
              )}
            </Link>
          )
        })}
      </div>

      {rows.length > 0 ? (
        <>
          <h2 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {tr(locale, 'overview.recentLoads')}
          </h2>
          <div className="flex flex-col gap-2">
            {rows.slice(0, 5).map(({ load, truck, r }) => {
              const rcId = rateCons.get(load.id)
              return (
                <div
                  key={load.id}
                  className="panel flex items-center gap-3 p-4 transition-colors hover:border-white/15"
                >
                  <Link href={`/loads/${load.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Route gets the whole line and wraps in full instead of truncating —
                          the badge moved down to the details row so nothing steals its width. */}
                      <div className="text-[14px] font-medium leading-snug">
                        {load.origin ?? '—'} → {load.destination ?? '—'}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusBadge status={load.status} locale={locale} />
                        <span className="nums min-w-0 text-[12px] text-white/65">
                          <span className="text-white/45">{truckLabel(truck)}</span> · {tr(locale, 'overview.net')}{' '}
                          <span className={r.net >= 0 ? 'text-good-400/90' : 'text-bad-400/90'}>
                            {usd.format(r.net)}
                          </span>{' '}
                          · {usd2.format(r.allInRpm)}/mi
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="nums text-[15px] font-bold">{usd.format(load.rate)}</div>
                      {load.loadedMiles > 0 && (
                        <div className="nums text-[11px] font-medium text-haul-300">
                          {Math.round(load.loadedMiles).toLocaleString('en-US')} mi
                        </div>
                      )}
                    </div>
                  </Link>
                  {rcId && <RateConButton docId={rcId} compact />}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="panel mt-6 p-6 text-center">
          <p className="text-[14px] font-medium">{tr(locale, 'overview.noLoadsYet')}</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-white/65">
            {tr(locale, 'overview.noLoadsBody')}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button href="/loads/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
              {tr(locale, 'overview.addLoad')}
            </Button>
            <Button href="/import" variant="secondary">
              {tr(locale, 'overview.rateCon')}
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}

/** The "→ Ashland, VA … 220 mi · ~4h" strip on a fleet card. Rendered by both the
 * streamed result and its placeholder, so the card never changes height when the
 * mileage lands — only the figure on the right swaps in. */
function DeliveryRow({ to, locale, figure }: { to: string; locale: Locale; figure?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5">
      <span className="min-w-0 truncate text-[11px] text-white/55">
        {tr(locale, 'overview.toDelivery')}
        <span className="text-white/75">{to}</span>
      </span>
      <span className="nums shrink-0 text-[11px] font-semibold text-white/80">
        {figure ?? (
          <span className="inline-block h-3 w-20 animate-pulse rounded bg-white/10 align-middle" />
        )}
      </span>
    </div>
  )
}

/** Road miles + drive time from the truck's live GPS to its delivery, via a free
 * external router (OSRM, no SLA). Streamed in its own Suspense boundary: the dashboard
 * previously awaited this for EVERY truck before emitting a single byte of HTML, which
 * put a third-party service squarely in the critical path of the whole page. */
async function DeliveryLine({
  lat,
  lng,
  to,
  locale,
}: {
  lat: number
  lng: number
  to: string
  locale: Locale
}) {
  const del = await deliveryInfo({ lat, lng }, to)
  // Em-dash rather than nothing when routing can't answer — the row stays put instead
  // of appearing and then vanishing under the reader's eye.
  return (
    <DeliveryRow
      to={to}
      locale={locale}
      figure={del ? `${del.miles} mi · ~${driveTime(del.etaMin, locale)}` : '—'}
    />
  )
}

/** Tint used by a tile's icon chip and its meter. Kept to the semantic four so a
 * figure's colour still means something rather than just decorating the grid. */
const ACCENTS = {
  haul: { chip: 'bg-haul-500/15 text-haul-300 ring-haul-400/20', bar: 'bg-haul-400' },
  good: { chip: 'bg-good-500/15 text-good-400 ring-good-400/20', bar: 'bg-good-400' },
  warn: { chip: 'bg-warn-400/15 text-warn-400 ring-warn-400/20', bar: 'bg-warn-400' },
  bad: { chip: 'bg-bad-500/15 text-bad-400 ring-bad-400/20', bar: 'bg-bad-400' },
} as const

function Stat({
  label,
  value,
  tone,
  sub,
  subTone,
  info,
  href,
  icon,
  accent = 'haul',
  meter,
  hero,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
  /** Secondary line under the big number — e.g. "чистыми $1,740". */
  sub?: string
  subTone?: 'good' | 'bad'
  info?: string
  /** Where the card leads — e.g. the loads list behind a rate total. */
  href?: string
  icon?: React.ReactNode
  accent?: keyof typeof ACCENTS
  /** 0..1 — draws a thin fill bar along the bottom of the tile. */
  meter?: number
  /** The one figure an owner watches first (rate/profit). Lifts the tile to elevation
   * tier 2 and caps it with an accent strip, so four equal numbers gain a focal point
   * instead of reading as an undifferentiated row. */
  hero?: boolean
}) {
  const a = ACCENTS[accent]
  const body = (
    <>
      {hero && (
        <span
          aria-hidden
          className={`absolute inset-x-0 top-0 h-[3px] rounded-t-2xl ${a.bar}`}
        />
      )}
      {/* Label first, figure second. The old tile led with the number and buried the
          label underneath in 10px grey, so four tiles in a row read as four loose
          numbers with no way to tell at a glance which was which. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-white/55">
          {/* Переносится на вторую строку, а не обрезается: «TOT…» не говорит ничего,
              две строки говорят всё. Плитки в ряду тянутся до общей высоты. */}
          <span className="min-w-0">{label}</span>
          {info && <Info text={info} />}
        </div>
        {icon && (
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ${a.chip}`}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Размер по ширине экрана: на узком крупный шрифт не помещался и число
          обрезалось молча — это хуже, чем то же число на пару пунктов мельче. */}
      <div
        className={`nums mt-2 break-all font-bold leading-none tracking-tight ${
          hero ? 'text-2xl lg:text-3xl' : 'text-xl lg:text-2xl'
        } ${
          tone === 'good' ? 'text-good-400' : tone === 'bad' ? 'text-bad-400' : ''
        }`}
      >
        {value}
      </div>

      {sub && (
        <div
          className={`nums mt-1 text-xs font-medium ${
            subTone === 'good' ? 'text-good-400/90' : subTone === 'bad' ? 'text-bad-400/90' : 'text-white/55'
          }`}
        >
          {sub}
        </div>
      )}

      {meter !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full ${a.bar}`}
            style={{ width: `${Math.round(meter * 100)}%` }}
          />
        </div>
      )}
    </>
  )

  // Tier 2, not a card of its own: these four sit INSIDE one panel now, the way the
  // reference nests a stats tile inside a stats card. No lift on hover either — an
  // inner tile that rises off its parent breaks the illusion that they're one object;
  // it brightens instead.
  if (href)
    return (
      <Link
        href={href}
        className={`panel-inset block px-4 py-4 transition-colors duration-150 hover:bg-white/[0.06] ${
          hero ? 'relative overflow-hidden' : ''
        }`}
      >
        {body}
      </Link>
    )
  return <div className="panel-inset px-3.5 py-3">{body}</div>
}
