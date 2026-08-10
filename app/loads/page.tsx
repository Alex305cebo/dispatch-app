import { Suspense } from 'react'
import { AlertTriangle, CalendarDays, PackageOpen, Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { ShowMore } from '@/components/collapse'
import { Empty } from '@/components/empty'
import Link from 'next/link'
import { listLoads, listTrucks, rateConByLoad } from '@/lib/loads'
import { truckLabel, STATUSES, type TruckRecord, type LoadRecord } from '@/lib/map'
import { calcLoad, type Breakdown } from '@/lib/profit'
import { truckPhotoFlags } from '@/lib/maintenance'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { usd, usd2, mondayOf, weekLabel, weekStart, loadWeekAnchorMs } from '@/lib/fmt'
import { StatusBadge, statusLabel } from '@/components/status'
import { RateConButton } from '@/components/ratecon-button'
import { DeleteButton } from '@/components/delete-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { deleteLoad } from '@/app/actions'
import { Info } from '@/components/info'
import { AttentionList } from '@/components/attention-list'

export const dynamic = 'force-dynamic'

// Same hue family as STATUS_STYLE (components/status.tsx) — a column accent, not a
// second color scheme, so the board and the badges never drift apart.
const COLUMN_ACCENT: Record<LoadRecord['status'], string> = {
  quoted: 'border-t-white/20',
  booked: 'border-t-cyan-400/60',
  in_transit: 'border-t-amber-400/60',
  delivered: 'border-t-fuchsia-400/60',
  paid: 'border-t-good-500/60',
  cancelled: 'border-t-bad-500/50',
}

// The page shell renders instantly; everything that needs the database lives in
// <LoadsBoard> behind a Suspense boundary. That split is what keeps switching tabs or
// paging the calendar from throwing the WHOLE page away: without it, the route-level
// app/loading.tsx fires and a dispatcher watches the header, the week summary and the
// attention list disappear and come back to see a different tab of the same data.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string; day?: string }>
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <Suspense fallback={<LoadsSkeleton />}>
        <LoadsBoard searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

/** Placeholder while LoadsBoard resolves. Mirrors the real shape — heading, week
 * summary, tab bar, cards — so nothing jumps when the data lands. */
function LoadsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-40 rounded-lg bg-white/8" />
      <div className="panel mt-4 h-[86px]" />
      <div className="panel mt-3 h-9" />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel h-24" />
        ))}
      </div>
    </div>
  )
}

async function LoadsBoard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string; day?: string }>
}) {
  const sp = await searchParams
  const view = sp.view === 'board' ? 'board' : sp.view === 'calendar' ? 'calendar' : 'driver'
  // Snapped to Monday even if the URL was hand-edited to a mid-week date — a
  // calendar link can never land on a broken, non-Monday week.
  const parsedWeek = sp.week ? Date.parse(`${sp.week}T00:00:00`) : NaN
  const weekMonday = Number.isNaN(parsedWeek) ? weekStart() : mondayOf(parsedWeek)
  const selectedDay = sp.day ?? null
  const companyId = await companyScope()
  const locale = await getLocale()
  const [loads, trucks, rateCons, photoIds] = await Promise.all([
    listLoads(companyId),
    listTrucks(companyId),
    rateConByLoad(companyId),
    truckPhotoFlags(companyId),
  ])
  const byId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const fallback = trucks[0]

  // One section per driver instead of one flat list — same truck resolution as
  // before (a load with no truck, or a dangling truck_id, falls back to the first
  // truck), just bucketed by the resolved truck instead of rendered inline.
  const byTruck = new Map<number, LoadRecord[]>()
  for (const l of loads) {
    const truck = (l.truckId !== null ? byId.get(l.truckId) : undefined) ?? fallback
    if (!truck) continue
    if (!byTruck.has(truck.id)) byTruck.set(truck.id, [])
    byTruck.get(truck.id)!.push(l)
  }
  // listLoads() already orders newest-first, so each bucket stays newest-first too.
  const groups = trucks
    .map((truck) => ({ truck, loads: byTruck.get(truck.id) ?? [] }))
    .filter((g) => g.loads.length > 0)

  // ── Two summaries above the board ────────────────────────────────────────────
  // Both are computed from the loads ALREADY fetched above — no extra query, no new
  // table. Which is also why these particular numbers: revenue per truck, all-in
  // rate per mile and deadhead share are what the trade press calls a dispatcher's
  // daily minimum, and all three were already derivable here and going unused.
  const priced = loads.map((l) => {
    const truck = (l.truckId !== null ? byId.get(l.truckId) : undefined) ?? fallback
    return { load: l, truck, r: truck ? calcLoad(l, truck) : null }
  })

  // The CURRENT week, always — not `weekMonday`, which follows the calendar tab's
  // ?week param. A summary that silently retitled itself when someone paged back
  // through the calendar would be worse than no summary at all.
  const wkFrom = weekStart()
  const wkTo = wkFrom + 7 * 24 * 60 * 60 * 1000
  const weekRows = priced.filter(({ load }) => {
    if (load.status === 'cancelled') return false
    const ms = loadWeekAnchorMs(load.pickupDate, load.createdAt)
    return ms >= wkFrom && ms < wkTo
  })
  const weekGross = weekRows.reduce((s, x) => s + x.load.rate, 0)
  const weekMiles = weekRows.reduce((s, x) => s + (x.r?.totalMiles ?? 0), 0)
  const weekDeadhead = weekRows.reduce((s, x) => s + x.load.deadheadMiles, 0)
  // Per truck that actually RAN, not per truck owned — a unit parked all week would
  // otherwise drag the number down and read as a rate problem when it's a coverage one.
  const trucksRun = new Set(weekRows.map((x) => x.truck?.id).filter((id) => id != null)).size
  const week = {
    gross: weekGross,
    net: weekRows.reduce((s, x) => s + (x.r?.net ?? 0), 0),
    rpm: weekMiles > 0 ? weekGross / weekMiles : 0,
    deadheadPct: weekMiles > 0 ? (weekDeadhead / weekMiles) * 100 : 0,
    perTruck: trucksRun > 0 ? weekGross / trucksRun : 0,
    count: weekRows.length,
  }

  // Loads with money or paperwork stuck to them. A quoted load is a draft — nothing
  // is owed and no paperwork is late yet — so it is never flagged.
  const now = Date.now()
  const flagged: { load: LoadRecord; reasons: Reason[] }[] = []
  for (const { load, r } of priced) {
    if (load.status === 'cancelled' || load.status === 'quoted') continue
    const reasons: Reason[] = []
    if (r && r.net < 0) reasons.push({ key: 'loads.attention.losing', bad: true })
    if (load.invoicedAt && !load.paidAt) {
      const dueMs = Date.parse(load.invoicedAt) + load.paymentTermsDays * 24 * 60 * 60 * 1000
      if (now > dueMs) reasons.push({ key: 'loads.attention.overdue', bad: true })
    } else if (load.status === 'delivered' && !load.invoicedAt) {
      reasons.push({ key: 'loads.attention.uninvoiced', bad: false })
    }
    if (!rateCons.has(load.id)) reasons.push({ key: 'loads.attention.noRc', bad: false })
    if (reasons.length) flagged.push({ load, reasons })
  }
  // Money-losing and overdue first: those are the ones that cost something today.
  flagged.sort((a, b) => Number(b.reasons.some((x) => x.bad)) - Number(a.reasons.some((x) => x.bad)))

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight">
            {t(locale, 'loads.page.title')}
            <Info side="bottom" text={t(locale, 'loads.page.tooltip')} />
          </h1>
          <p className="text-[13px] text-white/65">{t(locale, 'loads.page.countSuffix').replace('{n}', String(loads.length))}</p>
        </div>
        <Button href="/loads/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
          {t(locale, 'loads.page.new')}
        </Button>
      </div>

      {loads.length > 0 && <WeekSummary week={week} locale={locale} />}
      {flagged.length > 0 && <NeedsAttention items={flagged} locale={locale} />}

      {loads.length > 0 && (
        <div className="mb-5 flex gap-1.5 border-b border-white/8">
          <ViewTab href="/loads" active={view === 'driver'}>
            {t(locale, 'loads.page.tabByDriver')}
          </ViewTab>
          <ViewTab href="/loads?view=board" active={view === 'board'}>
            {t(locale, 'loads.page.tabByStatus')}
          </ViewTab>
          <ViewTab href="/loads?view=calendar" active={view === 'calendar'}>
            {t(locale, 'loads.page.tabCalendar')}
          </ViewTab>
        </div>
      )}

      {loads.length === 0 ? (
        <Empty
          icon={PackageOpen}
          title={t(locale, 'loads.page.emptyTitle')}
          text={t(locale, 'loads.page.emptyText')}
          action={{
            href: '/loads/new',
            label: t(locale, 'loads.page.new'),
            icon: <Plus size={14} strokeWidth={2.5} />,
          }}
        />
      ) : view === 'board' ? (
        <StatusBoard loads={loads} byId={byId} fallback={fallback} rateCons={rateCons} locale={locale} />
      ) : view === 'calendar' ? (
        <Calendar
          loads={loads}
          weekMonday={weekMonday}
          selectedDay={selectedDay}
          byId={byId}
          fallback={fallback}
          rateCons={rateCons}
          locale={locale}
        />
      ) : (
        <div className="stagger flex flex-col gap-3">
          {groups.map(({ truck, loads }) => (
            <DriverGroup
              key={truck.id}
              truck={truck}
              loads={loads}
              rateCons={rateCons}
              hasPhoto={photoIds.has(truck.id)}
              locale={locale}
            />
          ))}
        </div>
      )}
    </>
  )
}

function ViewTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        active ? 'border-haul-500 text-white' : 'border-transparent text-white/55 hover:text-white/85'
      }`}
    >
      {children}
    </Link>
  )
}

type Reason = { key: MsgKey; bad: boolean }

/** One figure in the week strip. Same nested-glass shape as the tracking page's
 * counters, so the app's two summaries read as one family rather than two designs. */
function Tile({ value, label, tone }: { value: string; label: string; tone?: 'good' | 'bad' | 'warn' }) {
  const color =
    tone === 'good' ? 'text-good-400' : tone === 'bad' ? 'text-bad-400' : tone === 'warn' ? 'text-warn-400' : 'text-white/90'
  return (
    <div className="panel-inset flex flex-col justify-center px-3 py-2.5">
      <div className={`nums truncate text-[17px] leading-tight ${color}`}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-white/45">{label}</div>
    </div>
  )
}

/** The week in five numbers. The page used to open straight onto driver cards: it
 * showed WHAT is being hauled and never once said how the week is going, which is
 * the first thing anyone opening a dispatch board actually wants to know. */
function WeekSummary({
  week,
  locale,
}: {
  week: { gross: number; net: number; rpm: number; deadheadPct: number; perTruck: number; count: number }
  locale: Locale
}) {
  if (week.count === 0) {
    return <p className="panel mb-4 px-4 py-3 text-[13px] text-white/45">{t(locale, 'loads.week.empty')}</p>
  }
  return (
    <section className="panel mb-3 p-2.5">
      <h2 className="mb-2 px-1.5 text-2xs font-semibold uppercase tracking-wider text-white/62">
        {t(locale, 'loads.week.title')}
      </h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Tile value={usd.format(week.gross)} label={t(locale, 'loads.week.gross')} />
        <Tile
          value={usd.format(week.net)}
          label={t(locale, 'loads.week.net')}
          tone={week.net >= 0 ? 'good' : 'bad'}
        />
        <Tile value={`${usd2.format(week.rpm)}/mi`} label={t(locale, 'loads.week.rpm')} />
        {/* Amber past 20%: the industry runs 15–20% empty, so above that this stopped
            being background cost and became something to route around. */}
        <Tile
          value={`${week.deadheadPct.toFixed(0)}%`}
          label={t(locale, 'loads.week.deadhead')}
          tone={week.deadheadPct > 20 ? 'warn' : undefined}
        />
        <Tile value={usd.format(week.perTruck)} label={t(locale, 'loads.week.perTruck')} />
      </div>
    </section>
  )
}

/** Loads with money or paperwork stuck to them, newest problems first. Every row is
 * a link to the load itself — a list that names a problem without offering the way
 * to fix it just moves the search work somewhere else. */
function NeedsAttention({
  items,
  locale,
}: {
  items: { load: LoadRecord; reasons: Reason[] }[]
  locale: Locale
}) {
  return (
    <section className="panel mb-5 p-3">
      <h2 className="mb-2 flex items-center gap-1.5 px-0.5 text-2xs font-semibold uppercase tracking-wider text-white/62">
        <AlertTriangle size={12} className="text-warn-400" />
        {t(locale, 'loads.attention.title')} · <span className="nums">{items.length}</span>
      </h2>
      {/* Translated here, on the server, rather than shipping message keys and a
          locale into the client component — the labels are a closed set of four. */}
      <AttentionList
        items={items.map(({ load, reasons }) => ({
          id: load.id,
          route: `${load.origin ?? '—'} → ${load.destination ?? '—'}`,
          reasons: reasons.map((r) => ({ label: t(locale, r.key), bad: r.bad })),
        }))}
      />
    </section>
  )
}

/** The color-coded dispatch board — every load in one glance, grouped by status
 * instead of by driver, so "what's still quoted" or "what's in transit right now"
 * doesn't require opening every driver's section to count. */
function StatusBoard({
  loads,
  byId,
  fallback,
  rateCons,
  locale,
}: {
  loads: LoadRecord[]
  byId: Map<number, TruckRecord>
  fallback: TruckRecord | undefined
  rateCons: Map<number, number>
  locale: Locale
}) {
  const columns = STATUSES.map((status) => ({
    status,
    loads: loads.filter((l) => l.status === status),
  })).filter((c) => c.loads.length > 0)

  return (
    /* Third column only at 2xl (1536px). At `lg` a 1280px laptop was splitting the
       board into three ~230px columns, which is narrower than a US city pair needs
       ("Phoenix, AZ → Los Angeles, CA") — so every card truncated to earn a column
       nobody could read. Two roomy columns beat three cramped ones. */
    <div className="stagger grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {columns.map(({ status, loads }) => (
        <section
          key={status}
          className={`panel border-t-2 p-3 ${COLUMN_ACCENT[status]}`}
        >
          {/* Count AND money in the header. A column that says only "37" tells the
              dispatcher how much work is in it but nothing about what it's worth,
              which is the number they actually compare columns on. */}
          <h2 className="mb-2 flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-wider text-white/62">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{statusLabel(locale, status)}</span>
              <span className="nums shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 font-bold text-white/70">
                {loads.length}
              </span>
            </span>
            <span className="nums shrink-0 text-base font-bold text-white/85">
              {usd.format(loads.reduce((s, l) => s + l.rate, 0))}
            </span>
          </h2>
          <div className="flex flex-col gap-1.5">
            {/* Long columns were the complaint: a single status could run to dozens of
                rows and push everything below it off the screen. Six is roughly what
                fits beside its neighbours before the grid stops reading as columns. */}
            <ShowMore limit={6} label={t(locale, 'loads.page.showMore')} items={loads.map((load) => {
              const truck = (load.truckId !== null ? byId.get(load.truckId) : undefined) ?? fallback
              const r = truck ? calcLoad(load, truck) : null
              return (
                /* Stacked, not side-by-side. Three columns on a laptop leave each card
                   ~230px, and the old row put the route, the driver, the rate and the
                   RC button in ONE horizontal line — measured: "Phoenix, AZ → Los
                   Angeles, CA" losing 103px and every driver line losing 120-130px to
                   the ellipsis. Giving the route the full width and dropping the meta
                   underneath costs one extra line and truncates nothing. */
                <div key={load.id} className="rounded-lg border border-white/6 p-2.5">
                  <div className="flex items-start gap-2">
                    <Link href={`/loads/${load.id}`} className="min-w-0 flex-1">
                      <div className="truncate text-base font-medium">
                        {load.origin ?? '—'} → {load.destination ?? '—'}
                      </div>
                    </Link>
                    {rateCons.get(load.id) && (
                      <span className="-mt-0.5 shrink-0">
                        <RateConButton docId={rateCons.get(load.id)!} compact />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    {/* Truck NUMBER only, not truckLabel's "number · driver". In a
                        230px column the driver's name pushed this line 110px past its
                        box on every card; the number is what identifies a truck on a
                        board about loads, and the driver is one click away. */}
                    <span className="min-w-0 truncate text-xs text-white/55">
                      {truck ? (truck.number?.trim() || truck.name) : '—'}
                      {r && ` · ${t(locale, 'loads.page.net')} ${usd.format(r.net)}`}
                    </span>
                    <span className="shrink-0 whitespace-nowrap">
                      <span className="nums text-base font-bold">{usd.format(load.rate)}</span>
                      {load.loadedMiles > 0 && (
                        <span className="nums ml-1.5 text-2xs font-medium text-haul-300">
                          {Math.round(load.loadedMiles).toLocaleString('en-US')} mi
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )
            })} />
          </div>
        </section>
      ))}
    </div>
  )
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_KEYS = [
  'loads.page.weekdayMon',
  'loads.page.weekdayTue',
  'loads.page.weekdayWed',
  'loads.page.weekdayThu',
  'loads.page.weekdayFri',
  'loads.page.weekdaySat',
  'loads.page.weekdaySun',
] as const

/** ISO date (YYYY-MM-DD, local) — the calendar buckets by calendar day, not by
 * timestamp, so this must never go through toISOString() (UTC) or a load booked
 * late at night can land on the wrong day's column. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** History of every load (any status, including cancelled — this is a record, not
 * a work queue), one week at a time. Pickup date is the natural anchor — "what's
 * moving this day" — falling back to when the load was entered for anything the
 * rate con never printed a pickup date for, so nothing silently vanishes from the
 * calendar entirely.
 *
 * Layout is a day STRIP + a detail pane, not seven cramped columns: a week of
 * full load cards never fit 7-abreast (routes truncated to "Atl…"), so the days
 * themselves are big tappable tiles (with a load-count badge) and the selected
 * day's loads render below at full size — same card language as the Обзор list. */
function Calendar({
  loads,
  weekMonday,
  selectedDay,
  byId,
  fallback,
  rateCons,
  locale,
}: {
  loads: LoadRecord[]
  weekMonday: number
  selectedDay: string | null
  byId: Map<number, TruckRecord>
  fallback: TruckRecord | undefined
  rateCons: Map<number, number>
  locale: Locale
}) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekMonday + i * DAY_MS))
  const weekIsos = days.map(isoDate)
  const todayIso = isoDate(new Date())

  const byDay = new Map<string, LoadRecord[]>()
  for (const l of loads) {
    const anchor = l.pickupDate ?? l.createdAt.slice(0, 10)
    if (!byDay.has(anchor)) byDay.set(anchor, [])
    byDay.get(anchor)!.push(l)
  }

  // Which day is open: the URL's pick if it's inside this week, else today (when
  // browsing the current week), else the week's first day that has loads — landing
  // on a past week should open something interesting, not an empty Monday.
  const activeIso =
    selectedDay && weekIsos.includes(selectedDay)
      ? selectedDay
      : weekIsos.includes(todayIso)
        ? todayIso
        : (weekIsos.find((iso) => (byDay.get(iso) ?? []).length > 0) ?? weekIsos[0]!)

  const dayLoads = byDay.get(activeIso) ?? []
  const dayGross = dayLoads.reduce((s, l) => s + l.rate, 0)
  const activeDate = new Date(`${activeIso}T00:00:00`)
  const dayTitle = activeDate.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const prevWeek = isoDate(new Date(weekMonday - 7 * DAY_MS))
  const nextWeek = isoDate(new Date(weekMonday + 7 * DAY_MS))
  const isCurrentWeek = weekMonday === weekStart()

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/loads?view=calendar&week=${prevWeek}`}
          className="rounded-xl border border-white/10 px-3.5 py-2 text-[12px] font-semibold text-white/75 transition-colors hover:border-white/25 hover:bg-white/5"
        >
          {t(locale, 'loads.page.prevWeek')}
        </Link>
        <span className="flex items-center gap-2 text-[13.5px] font-semibold capitalize text-white/90">
          {weekLabel(weekMonday, locale)}
          {!isCurrentWeek && (
            <Link
              href="/loads?view=calendar"
              className="rounded-full bg-haul-500/15 px-2 py-0.5 text-[11px] font-semibold normal-case text-haul-400 transition-colors hover:bg-haul-500/25"
            >
              {t(locale, 'loads.page.today')}
            </Link>
          )}
        </span>
        <Link
          href={`/loads?view=calendar&week=${nextWeek}`}
          className="rounded-xl border border-white/10 px-3.5 py-2 text-[12px] font-semibold text-white/75 transition-colors hover:border-white/25 hover:bg-white/5"
        >
          {t(locale, 'loads.page.nextWeek')}
        </Link>
      </div>

      {/* The week itself: 7 big tap targets. The count bubble is the "something
          happened this day" signal at a glance; selection is the filled tile. */}
      <div className="mb-4 grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((d, i) => {
          const iso = weekIsos[i]!
          const count = (byDay.get(iso) ?? []).length
          const isToday = iso === todayIso
          const isActive = iso === activeIso
          return (
            <Link
              key={iso}
              href={`/loads?view=calendar&week=${weekIsos[0]}&day=${iso}`}
              className={`group relative flex flex-col items-center gap-0.5 rounded-2xl border px-1 py-2.5 text-center transition-all sm:py-3.5 ${
                isActive
                  ? 'border-haul-500/60 bg-gradient-to-b from-haul-500/25 to-haul-500/10 shadow-lg shadow-haul-500/10'
                  : 'border-white/8 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  isActive ? 'text-haul-300' : isToday ? 'text-haul-400' : 'text-white/45'
                }`}
              >
                {t(locale, WEEKDAY_KEYS[i]!)}
              </span>
              <span
                className={`nums text-[17px] font-bold leading-none sm:text-[20px] ${
                  isActive ? 'text-white' : isToday ? 'text-haul-400' : count > 0 ? 'text-white/85' : 'text-white/35'
                }`}
              >
                {d.getDate()}
              </span>
              {count > 0 ? (
                <span
                  className={`nums mt-0.5 rounded-full px-1.5 py-px text-[10px] font-bold ${
                    isActive ? 'bg-haul-500 text-white' : 'bg-white/10 text-white/70 group-hover:bg-white/15'
                  }`}
                >
                  {count}
                </span>
              ) : (
                <span className="mt-0.5 text-[10px] text-white/20">·</span>
              )}
              {isToday && !isActive && (
                <span className="absolute -bottom-px left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-haul-500" />
              )}
            </Link>
          )
        })}
      </div>

      {/* The selected day, full size. */}
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold capitalize">{dayTitle}</h2>
        {dayLoads.length > 0 && (
          <span className="nums text-[13px] text-white/60">
            {t(locale, 'loads.page.countLoads').replace('{n}', String(dayLoads.length))} ·{' '}
            <span className="font-semibold text-white/85">{usd.format(dayGross)}</span>
          </span>
        )}
      </div>

      {dayLoads.length === 0 ? (
        <Empty
          icon={CalendarDays}
          title={t(locale, 'loads.page.emptyDayTitle')}
          text={t(locale, 'loads.page.emptyDayText')}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {dayLoads.map((l) => {
            const truck = (l.truckId !== null ? byId.get(l.truckId) : undefined) ?? fallback
            let r: Breakdown | null = null
            try {
              r = truck ? calcLoad(l, truck) : null
            } catch {
              r = null // legacy rows with broken economics still deserve a card
            }
            const rcId = rateCons.get(l.id)
            return (
              <div
                key={l.id}
                className="panel panel-interactive flex items-center gap-3 p-4 sm:p-5"
              >
                <Link href={`/loads/${l.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15.5px] font-semibold sm:text-[17px]">
                        {l.origin ?? '—'} → {l.destination ?? '—'}
                      </span>
                      <StatusBadge status={l.status} locale={locale} />
                    </div>
                    <div className="nums mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-white/60">
                      {truck && <span className="text-white/45">{truckLabel(truck)}</span>}
                      {r && (
                        <>
                          <span>
                            {t(locale, 'loads.page.net')}{' '}
                            <span className={`font-semibold ${r.net >= 0 ? 'text-good-400' : 'text-bad-400'}`}>
                              {usd.format(r.net)}
                            </span>
                          </span>
                          <span>{Math.round(r.totalMiles)} mi</span>
                          <span>{usd2.format(r.allInRpm)}/mi</span>
                        </>
                      )}
                      {l.pickupTime && <span className="text-white/45">🕐 {l.pickupTime}</span>}
                    </div>
                  </div>
                  <span className="nums shrink-0 text-right text-[19px] font-bold sm:text-[22px]">
                    {usd.format(l.rate)}
                  </span>
                </Link>
                {rcId && <RateConButton docId={rcId} compact />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DriverGroup({
  truck,
  loads,
  rateCons,
  hasPhoto,
  locale,
}: {
  truck: TruckRecord
  loads: LoadRecord[]
  rateCons: Map<number, number>
  hasPhoto: boolean
  locale: Locale
}) {
  // The load that matters right now: in transit beats booked beats everything else;
  // with none active, the newest load (loads is already newest-first) stands in for
  // "last load" — either way, one load is always featured, the rest fold away.
  const active = loads.find((l) => l.status === 'in_transit') ?? loads.find((l) => l.status === 'booked')
  const featured = active ?? loads[0]!
  const rest = loads.filter((l) => l.id !== featured.id)

  // The header used to carry a name and a count and nothing else, across the full
  // width of the card — a lot of empty space for two short facts. What the money adds
  // is the answer to "is this driver worth what he's running", which is the question
  // the count alone raises and never answers.
  const total = loads.reduce((s, l) => (l.status === 'cancelled' ? s : s + l.rate), 0)

  return (
    <section className="panel p-3">
      <Link
        href={`/trucks/${truck.id}`}
        className="mb-2 flex items-center gap-2.5 transition-colors hover:text-haul-400"
      >
        <DriverAvatar truckId={truck.id} name={truck.driverName} hasPhoto={hasPhoto} size={30} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{truckLabel(truck)}</span>
        <span className="nums shrink-0 text-[12px] font-semibold text-white/75">{usd.format(total)}</span>
        {/* The count is the first thing to go on a narrow phone: it's the least of the
            three facts here, and keeping it would cost the driver's own name letters. */}
        <span className="hidden shrink-0 text-[11px] font-normal text-white/40 min-[380px]:inline">
          {t(locale, 'loads.page.countLoads').replace('{n}', String(loads.length))}
        </span>
      </Link>

      <LoadRow load={featured} truck={truck} rcId={rateCons.get(featured.id)} locale={locale} />

      {rest.length > 0 && (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-[12px] font-medium text-white/55 transition-colors hover:text-white">
            <span className="text-white/40 transition-transform group-open:rotate-90">▸</span>
            {t(locale, 'loads.page.moreLoads').replace('{n}', String(rest.length))}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {rest.map((l) => (
              <LoadRow key={l.id} load={l} truck={truck} rcId={rateCons.get(l.id)} locale={locale} />
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function LoadRow({
  load,
  truck,
  rcId,
  locale,
}: {
  load: LoadRecord
  truck: TruckRecord
  rcId: number | undefined
  locale: Locale
}) {
  // Each load costs against its OWN truck. Money lives in calcLoad, not SQL.
  const r: Breakdown = calcLoad(load, truck)
  return (
    // Row is a flex container, not one big <Link>: the rate con button must
    // be a sibling of the link, never nested inside it.
    // Padding and type both a step down from before: one row of text was sitting in a
    // card tall enough for three, which is what made the list read as mostly air.
    // Nothing was dropped to get there — every figure that was here still is.
    <div className="flex items-center gap-2 rounded-xl border border-white/6 px-3 py-2 transition-colors hover:border-white/15">
      {/* Stacked on a phone, one row from `sm` up. Side by side at 375px the route had
          to share ~270px with the status badge AND the rate, so "Kansas City, MO →
          Chicago, IL" clipped to a few letters — and the city pair is the one thing on
          this row that must never be cut. Stacked, it gets the full width and the money
          moves onto the line below, beside the figures it belongs with. */}
      <Link
        href={`/loads/${load.id}`}
        className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-medium">
              {load.origin ?? '—'} → {load.destination ?? '—'}
            </span>
            <StatusBadge status={load.status} locale={locale} />
          </div>
          <div className="nums mt-0.5 truncate text-[11.5px] text-white/60">
            {t(locale, 'loads.page.net')}{' '}
            <span className={r.net >= 0 ? 'text-good-400/90' : 'text-bad-400/90'}>
              {usd.format(r.net)}
            </span>{' '}
            · {Math.round(r.totalMiles)} mi · {usd2.format(r.allInRpm)}/mi
          </div>
        </div>
        {/* Inline pair on the phone (rate then loaded miles, reading left to right),
            stacked block on the right from `sm` up. */}
        <div className="flex shrink-0 items-baseline gap-2 sm:block sm:text-right">
          <div className="nums text-[15px] font-bold leading-tight">{usd.format(load.rate)}</div>
          {load.loadedMiles > 0 && (
            <div className="nums text-[11px] font-medium text-haul-300">
              {Math.round(load.loadedMiles).toLocaleString('en-US')} mi
            </div>
          )}
        </div>
      </Link>
      {rcId && <RateConButton docId={rcId} compact />}
      <DeleteButton
        action={deleteLoad}
        id={load.id}
        title={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
        note={t(locale, 'loads.page.deleteNote')}
      />
    </div>
  )
}
