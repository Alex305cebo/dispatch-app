import { Suspense } from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { listLoads, listTrucks, podLoadIds, rateConByLoad } from '@/lib/loads'
import { type TruckRecord, type LoadRecord } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { truckPhotoFlags } from '@/lib/maintenance'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { usd, usd2, weekAnchorOf, weekStart, loadWeekAnchorMs } from '@/lib/fmt'
import { Info } from '@/components/info'
import { AttentionList } from '@/components/attention-list'
import { LaneStats } from '@/components/lane-stats'
import { LoadsViews } from './loads-views'

export const dynamic = 'force-dynamic'


// The page shell renders instantly; everything that needs the database lives in
// <LoadsBoard> behind a Suspense boundary. That split is what keeps switching tabs or
// paging the calendar from throwing the WHOLE page away: without it, the route-level
// app/loading.tsx fires and a dispatcher watches the header, the week summary and the
// attention list disappear and come back to see a different tab of the same data.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string; day?: string; q?: string }>
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
  searchParams: Promise<{ view?: string; week?: string; day?: string; q?: string }>
}) {
  const sp = await searchParams
  const view = sp.view === 'board' ? 'board' : sp.view === 'calendar' ? 'calendar' : 'driver'
  // Snapped to Monday even if the URL was hand-edited to a mid-week date — a
  // calendar link can never land on a broken, non-Monday week.
  const parsedWeek = sp.week ? Date.parse(`${sp.week}T00:00:00`) : NaN
  const weekMonday = Number.isNaN(parsedWeek) ? weekStart() : weekAnchorOf(parsedWeek)
  const selectedDay = sp.day ?? null
  const companyId = await companyScope()
  const locale = await getLocale()
  const [loads, trucks, rateCons, photoIds, podIds] = await Promise.all([
    listLoads(companyId),
    listTrucks(companyId),
    rateConByLoad(companyId),
    truckPhotoFlags(companyId),
    podLoadIds(companyId),
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

  // ── Следующая неделя ────────────────────────────────────────────────────────
  // Итог недели говорит, как прошло. Этот вопрос — другой и задаётся в четверг:
  // «на следующую неделю у нас вообще что-нибудь есть». Считается строго по дате
  // пикапа (не по дате заведения): планирование живёт по календарю груза. Заявки
  // (quoted) не считаются — их ещё не подтвердили, и подставлять их в план значит
  // считать деньги, которых может не быть.
  const nextTo = wkTo + 7 * 24 * 60 * 60 * 1000
  const nextRows = priced.filter(({ load }) => {
    if (load.status === 'cancelled' || load.status === 'quoted' || !load.pickupDate) return false
    const ms = Date.parse(`${load.pickupDate}T00:00:00`)
    return ms >= wkTo && ms < nextTo
  })
  // Траки без груза на следующей неделе — то, ради чего это и смотрят. Стоящие в
  // ремонте и отпуске не в счёт: искать им груз всё равно некому.
  const busyNext = new Set(nextRows.map((x) => x.truck?.id).filter((id) => id != null))
  const next = {
    gross: nextRows.reduce((s, x) => s + x.load.rate, 0),
    count: nextRows.length,
    idle: trucks.filter((tr) => !tr.unavailable && !busyNext.has(tr.id)).length,
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

      {loads.length > 0 && <WeekSummary week={week} next={next} locale={locale} />}
      {flagged.length > 0 && <NeedsAttention items={flagged} locale={locale} />}

      {/* Вкладки и всё, что они рисуют, — на клиенте: все три вида и любая неделя
          строятся из этой же выборки, новых данных не нужно. Map и Set не переживают
          границу сервер-клиент, поэтому уходят парами и массивом. */}
      {/* Направления — свод по деньгам под итогом недели: «куда возить выгодно».
          Считается по тем же расчётам, что уже сделаны выше для каждого груза. */}
      <LaneStats
        rows={priced.map(({ load, r }) => ({ load, net: r?.net ?? 0, miles: r?.totalMiles ?? 0 }))}
        locale={locale}
      />

      <LoadsViews
        loads={loads}
        trucks={trucks}
        // Чистая, ставка-миля и наличие POD по каждому грузу: по ним работают
        // фильтры, сортировка и выгрузка. Считается здесь, потому что расчёт требует
        // экономики трака, а она уже на руках — второй раз её тянуть незачем.
        metrics={Object.fromEntries(
          priced.map(({ load, r }) => [
            load.id,
            {
              net: r?.net ?? 0,
              rpm: r && r.totalMiles > 0 ? load.rate / r.totalMiles : 0,
              hasPod: podIds.includes(load.id),
            },
          ]),
        )}
        rateConPairs={[...rateCons.entries()]}
        photoTruckIds={[...photoIds]}
        initialView={view}
        initialWeek={weekMonday}
        initialDay={selectedDay}
        initialQuery={sp.q ?? ''}
      />
    </>
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
  next,
  locale,
}: {
  week: { gross: number; net: number; rpm: number; deadheadPct: number; perTruck: number; count: number }
  next: { gross: number; count: number; idle: number }
  locale: Locale
}) {
  if (week.count === 0 && next.count === 0) {
    return <p className="panel mb-4 px-4 py-3 text-[13px] text-white/45">{t(locale, 'loads.week.empty')}</p>
  }
  return (
    <section className="panel mb-3 p-2.5">
      <h2 className="mb-2 px-1.5 text-2xs font-semibold uppercase tracking-wider text-white/62">
        {t(locale, 'loads.week.title')}
      </h2>
      {/* Неделя ещё могла не начаться — тогда плиток нет, а план на следующую есть. */}
      {week.count > 0 && (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile value={usd.format(week.gross)} label={t(locale, 'loads.week.gross')} />
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
      )}

      {/* Что уже стоит на следующей неделе. Отдельной строкой, а не шестой плиткой:
          это не итог, а план, и мерить его теми же цифрами нельзя. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/6 px-1.5 pt-2 text-[12px] text-white/55">
        <span className="text-white/40">{t(locale, 'loads.week.nextTitle')}</span>
        {next.count === 0 ? (
          <span className="text-warn-400">{t(locale, 'loads.week.nextEmpty')}</span>
        ) : (
          <>
            <span className="nums font-semibold text-white/85">{usd.format(next.gross)}</span>
            <span className="nums">
              {t(locale, 'loads.week.nextCount').replace('{n}', String(next.count))}
            </span>
          </>
        )}
        {/* Свободные траки — то, ради чего в план и смотрят: неделя начнётся, а им
            нечего везти. */}
        {next.idle > 0 && (
          <span className="nums rounded-full bg-warn-500/15 px-2 py-0.5 font-medium text-warn-400">
            {t(locale, 'loads.week.nextIdle').replace('{n}', String(next.idle))}
          </span>
        )}
      </p>
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
