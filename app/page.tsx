// «Сегодня» — главная (до 10/09/26 «Обзор»). По плану «Порядок в TMS» здесь только то, с
// чем работают каждый день, а с 10/10/26 — разложено по образцу SmartHop, который прислал
// владелец («наш TMS должен выглядеть примерно так же»):
//   1. Четыре карточки: гросс и RPM недели кольцами (сколько из цели), грузы в работе с
//      ближайшими датами, «Ждёт тебя» — сколько и самое срочное.
//   2. Деньги (тёмная карточка) и топливо (цветная) стопкой слева, справа «Статус траков».
//   3. Календарь недели: водители по строкам, рейсы полосами.
//   4. Полный список «Ждёт тебя» — рабочий, со всеми кнопками.
// Карточки — components/today-cards.tsx, календарь — FleetHeatmap в варианте week.

import {
  AlarmClock,
  Calculator,
  CalendarClock,
  FileWarning,
  Flag,
  MessageSquareWarning,
  Plus,
  Receipt,
  Truck,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/page-header'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { TodayFeed, type FeedSection, type FeedTone } from '@/components/today-feed'
import { idleMarkets, needsLoadItems, needsLoadRows } from '@/components/needs-load'
import { TourCard } from '@/components/tour-card'
import { FleetHeatmap } from '@/components/fleet-heatmap'
import {
  FuelCard,
  GoalCard,
  ListCard,
  TruckStatusCard,
  WalletCard,
  type ListRow,
  type TruckStatusRow,
} from '@/components/today-cards'
import { tileGrid } from '@/lib/tiles'
import { migrateOverviewTiles, type TilePlacement, type TileSize } from '@/lib/tiles-core'
import { listLoads, listTrucks, loadPapers, openStopMarks } from '@/lib/loads'
import { currentLoadsByTruck, type LoadRecord } from '@/lib/map'
import { buildWorkingDays } from '@/lib/heatmap'
import { sql } from '@/lib/db'
import { seesFleetGps } from '@/lib/company'
import { fleetExpiryAlerts, truckProfiles, truckTrailerNumbers } from '@/lib/maintenance'
import { homeUntil } from '@/lib/maintenance-core'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { fixPlace, placeCity } from '@/lib/place'
import { t, type MsgKey } from '@/lib/i18n'
import { can } from '@/lib/capabilities-server'
import { shortName, usd, usd2, usDate } from '@/lib/fmt'
import { idleFleet, idleSummary } from '@/lib/idle-fleet'
import { shiftDay, weekStartIso, weekStats } from '@/lib/loads-dashboard'
import { todayEt } from '@/lib/payments'
import { attentionQueue, overdueDays, type AttentionCategory, type AttentionEntry } from '@/lib/attention'
import { tourSteps } from '@/lib/tour'

export const dynamic = 'force-dynamic'

type FS = { unit: string; location: string | null; lat: number | null; lng: number | null }

const ICON = { size: 15, strokeWidth: 2.5 }

/** Разделы ленты про грузы: заголовок, цвет и значок. */
const SECTION: Record<AttentionCategory, { title: MsgKey; tone: FeedTone; icon: ReactNode; info?: MsgKey }> = {
  late: { title: 'today.sec.late', tone: 'bad', icon: <AlarmClock {...ICON} /> },
  priority: { title: 'loads.priority.label', tone: 'warn', icon: <Flag {...ICON} /> },
  broker: { title: 'today.sec.broker', tone: 'haul', icon: <MessageSquareWarning {...ICON} />, info: 'overview.brokerUnreadInfo' },
  documents: { title: 'loads.dash.missingDocs', tone: 'warn', icon: <FileWarning {...ICON} /> },
  ready: { title: 'loads.filter.ready', tone: 'good', icon: <Receipt {...ICON} /> },
  overdue: { title: 'loads.dash.overdue', tone: 'bad', icon: <Wallet {...ICON} /> },
  checks: { title: 'loads.dash.checks', tone: 'warn', icon: <Calculator {...ICON} /> },
}

/** «10/14» — дата строки без года: в карточках речь о ближайших днях. */
const md = (day: string | null | undefined) => (day ? usDate(day).slice(0, 5) : '—')

/** «Houston, TX» → «Houston»: в узкой карточке маршрут — двумя городами. */
const city = (p: string | null | undefined) => (p ? p.split(',')[0]!.trim() : '—')

/** Ставки по тракам: из них цель недели, где у водителя своей цели нет. */
function grossByTruck(rows: LoadRecord[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const l of rows) if (l.truckId != null) out.set(l.truckId, (out.get(l.truckId) ?? 0) + l.rate)
  return out
}

const loadedMiles = (rows: LoadRecord[]) => rows.reduce((s, l) => s + l.loadedMiles, 0)

/** Важность строки «Ждёт тебя» в короткой карточке: стрелка и порядок. */
const LOAD_LEVEL: Record<AttentionCategory, ListRow['level']> = {
  late: 'high',
  overdue: 'high',
  priority: 'mid',
  broker: 'mid',
  documents: 'mid',
  checks: 'mid',
  ready: 'low',
}
const LEVEL_ORDER = { high: 0, mid: 1, low: 2 } as const

export default async function Page() {
  const companyId = await companyScope()
  const locale = await getLocale()
  const user = await getCurrentUser()
  // Деньги (кто сколько должен) — только с правом «Финансы»: без него их даже не считаем.
  const money = await can(user, 'finances')
  const [loads, trucks, fleetRaw, alerts, { rateCons, pods }, marks, trailers, profiles] = await Promise.all([
    listLoads(companyId),
    listTrucks(companyId),
    seesFleetGps(companyId) ? sql`SELECT unit, location, lat, lng FROM fleet_status` : Promise.resolve([]),
    fleetExpiryAlerts(companyId, locale),
    loadPapers(companyId),
    openStopMarks(companyId),
    truckTrailerNumbers(companyId),
    truckProfiles(companyId),
  ])
  const now = Date.now()
  const today = todayEt()

  // Где стоит каждый трак. Строка места приходит из ELD с чужим штатом (lib/place.ts) —
  // правим сразу на входе.
  const byUnit = new Map((fleetRaw as FS[]).map((r) => [r.unit, fixPlace(r.location, r.lat, r.lng)]))
  const placeByTruck = new Map<number, string | null>(trucks.map((tr) => [tr.id, (tr.number ? byUnit.get(tr.number) : null) ?? null]))
  // Кто дома до какого числа (профиль водителя) — «Кому искать груз» их не считает.
  const homeByTruck = new Map([...profiles].map(([id, p]) => [id, homeUntil(p, today)]))
  const live = loads.filter((l) => l.status !== 'cancelled')
  const idle = idleFleet(trucks, live, placeByTruck, now, homeByTruck)
  const { burnPerDay } = idleSummary(idle)

  // Неделя — та же, что на «Грузах»: подтверждённые грузы с пикапом на этой расчётной неделе.
  const weekFrom = weekStartIso(today)
  const week = weekStats(loads, trucks, weekFrom)
  const lastWeek = weekStats(loads, trucks, shiftDay(weekFrom, -7))

  // Цель гросса — сумма целей недели из профилей; у кого цели нет — его прошлая неделя.
  // Ни у кого нет — вся прошлая неделя.
  const grossGoals = trucks.filter((tr) => (profiles.get(tr.id)?.weekTargetGross ?? 0) > 0)
  const lastByTruck = grossByTruck(lastWeek.rows)
  const grossGoal = grossGoals.length
    ? trucks.reduce((s, tr) => {
        const own = profiles.get(tr.id)?.weekTargetGross ?? 0
        return s + (own > 0 ? own : (lastByTruck.get(tr.id) ?? 0))
      }, 0)
    : lastWeek.gross
  const grossPct = grossGoal > 0 ? (week.gross / grossGoal) * 100 : null

  // RPM — за гружёную милю, как цель $/mi в профиле (lib/profit.ts targetVerdict). Цель
  // парка — цели водителей, взвешенные их милями этой недели; миль ещё нет — среднее.
  const rpmNow = loadedMiles(week.rows) > 0 ? week.gross / loadedMiles(week.rows) : null
  const rpmTargets = trucks
    .map((tr) => ({ id: tr.id, target: profiles.get(tr.id)?.targetRpm ?? 0 }))
    .filter((x) => x.target > 0)
  const milesByTruck = new Map<number, number>()
  for (const l of week.rows) if (l.truckId != null) milesByTruck.set(l.truckId, (milesByTruck.get(l.truckId) ?? 0) + l.loadedMiles)
  const targetMiles = rpmTargets.reduce((s, x) => s + (milesByTruck.get(x.id) ?? 0), 0)
  const rpmGoal = rpmTargets.length
    ? targetMiles > 0
      ? rpmTargets.reduce((s, x) => s + x.target * (milesByTruck.get(x.id) ?? 0), 0) / targetMiles
      : rpmTargets.reduce((s, x) => s + x.target, 0) / rpmTargets.length
    : loadedMiles(lastWeek.rows) > 0
      ? lastWeek.gross / loadedMiles(lastWeek.rows)
      : null
  const rpmPct = rpmNow != null && rpmGoal ? (rpmNow / rpmGoal) * 100 : null

  // Грузы в работе и ближайшие: у забронированного — день погрузки, у едущего — выгрузки.
  const activeLoads = live.filter((l) => l.status === 'booked' || l.status === 'in_transit')
  const nextDay = (l: LoadRecord) => (l.status === 'in_transit' ? l.deliveryDate : l.pickupDate) ?? null
  const upcoming = [...activeLoads].sort((a, b) => (nextDay(a) ?? '9999').localeCompare(nextDay(b) ?? '9999')).slice(0, 3)

  // Ждём оплаты — то же, что «Деньги → Не оплачено», одной цифрой: выставленные и не
  // оплаченные счета плюс доставленные грузы без счёта.
  const unpaid = money ? loads.filter((l) => (l.invoicedAt && !l.paidAt) || (l.status === 'delivered' && !l.invoicedAt)) : []
  const unpaidTotal = unpaid.reduce((s, l) => s + l.rate, 0)
  const overdueTotal = unpaid.filter((l) => overdueDays(l, now) != null).reduce((s, l) => s + l.rate, 0)

  // Топливо недели: мили груза (с deadhead) ÷ MPG его трака × цена галлона из карточки
  // трака — так же, как расход считает карточка груза (lib/profit.ts).
  const truckById = new Map(trucks.map((tr) => [tr.id, tr]))
  const fuelWeek = week.rows.reduce((s, l) => {
    const tr = l.truckId == null ? undefined : truckById.get(l.truckId)
    return tr && tr.mpg > 0 ? s + ((l.loadedMiles + l.deadheadMiles) / tr.mpg) * tr.fuelPricePerGallon : s
  }, 0)
  const priced = trucks.filter((tr) => tr.fuelPricePerGallon > 0)
  const gallon = priced.length ? priced.reduce((s, tr) => s + tr.fuelPricePerGallon, 0) / priced.length : null

  // Плитки. Порядок и размеры общие для компании (lib/tiles.ts); здесь — исходная
  // раскладка, пока никто ничего не переставил. Ключ раздела прежний — 'overview'.
  const widgets: Widget[] = []
  const defaults: TilePlacement[] = []
  const add = (id: string, size: TileSize, node: ReactNode) => {
    widgets.push({ id, node })
    defaults.push({ id, size })
  }

  add(
    'gross',
    's',
    <GoalCard
      href="/loads"
      title={t(locale, 'today.weekGross')}
      info={t(locale, 'today.grossGoalInfo')}
      pct={grossPct}
      goal={{ label: t(locale, grossGoals.length ? 'today.goal' : 'today.lastWeek'), value: grossGoal > 0 ? usd.format(grossGoal) : '—' }}
      now={{ label: t(locale, 'today.now'), value: usd.format(week.gross) }}
    />,
  )
  add(
    'rpm',
    's',
    <GoalCard
      href="/loads"
      title={t(locale, 'overview.rpm')}
      info={t(locale, 'today.rpmGoalInfo')}
      pct={rpmPct}
      goal={{ label: t(locale, rpmTargets.length ? 'today.goal' : 'today.lastWeek'), value: rpmGoal ? usd2.format(rpmGoal) : '—' }}
      now={{ label: t(locale, 'today.now'), value: rpmNow == null ? '—' : usd2.format(rpmNow) }}
    />,
  )
  add(
    'active',
    's',
    <ListCard
      href="/loads"
      title={t(locale, 'nav.loads')}
      info={t(locale, 'today.loadsInfo')}
      count={activeLoads.length}
      head={[t(locale, 'today.upcoming'), t(locale, 'today.date')]}
      empty={t(locale, 'today.noActive')}
      rows={upcoming.map((l) => ({
        key: `load-${l.id}`,
        href: `/loads/${l.id}`,
        title: `${city(l.origin)} → ${city(l.destination)}`,
        hint: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
        side: md(nextDay(l)),
        rcId: rateCons.get(l.id),
      }))}
      more={activeLoads.length > upcoming.length ? { href: '/loads', label: t(locale, 'today.allLoads') } : undefined}
    />,
  )
  // Новая компания без единого груза: вместо пустых нулей — с чего начать.
  if (loads.length === 0)
    add(
      'start',
      'l',
      <div className="panel h-full p-6 text-center">
        <p className="text-md font-medium">{t(locale, 'overview.noLoadsYet')}</p>
        <p className="mx-auto mt-1.5 max-w-sm text-base leading-relaxed text-t2">{t(locale, 'overview.noLoadsBody')}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button href="/loads/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
            {t(locale, 'overview.addLoad')}
          </Button>
          <Button href="/loads/new" variant="secondary">
            {t(locale, 'overview.rateCon')}
          </Button>
        </div>
      </div>,
    )

  // Лента «Ждёт тебя».
  const queue = attentionQueue({ loads, trucks, rateCons, pods, marks, now, locale, money })
  const loadSection = (c: AttentionCategory): FeedSection => ({
    key: c,
    title: t(locale, SECTION[c].title),
    tone: SECTION[c].tone,
    icon: SECTION[c].icon,
    info: SECTION[c].info && t(locale, SECTION[c].info),
    items: queue
      .filter((e: AttentionEntry) => e.category === c)
      .map((e) => ({
        key: `${c}-${e.id}`,
        href: `/loads/${e.id}`,
        title: e.route,
        detail: e.detail,
        tone: e.bad ? 'bad' : c === 'ready' ? 'good' : undefined,
        money: c === 'ready' || c === 'overdue',
        rcId: rateCons.get(e.id),
      })),
  })
  const needing = needsLoadRows(idle)
  const sections: FeedSection[] = [
    loadSection('late'),
    loadSection('priority'),
    {
      key: 'idle',
      title: t(locale, 'needsLoad.title'),
      tone: 'haul',
      icon: <Truck {...ICON} />,
      info: t(locale, 'needsLoad.info'),
      // Во что обходится простой всех стоящих — в сутки.
      aside:
        burnPerDay > 0 ? (
          <span>
            <span className="nums font-semibold text-warn-400">{usd.format(burnPerDay)}</span>
            {t(locale, 'needsLoad.perDay')}
          </span>
        ) : undefined,
      items: needsLoadItems({
        rows: needing,
        trucks: truckById,
        trailers,
        markets: await idleMarkets(needing, trailers),
        locale,
      }),
    },
    loadSection('broker'),
    loadSection('documents'),
    {
      key: 'deadlines',
      title: t(locale, 'overview.docDeadlines'),
      tone: 'warn',
      icon: <CalendarClock {...ICON} />,
      info: t(locale, 'overview.docDeadlinesInfo'),
      items: alerts.map((a) => ({
        key: `due-${a.truckId}-${a.item.label}`,
        href: `/trucks/${a.truckId}#care`,
        title: `#${a.number} · ${a.item.label}`,
        detail: a.item.daysLeft < 0 ? t(locale, 'overview.overdue') : t(locale, 'overview.daysLeft').replace('{n}', String(a.item.daysLeft)),
        tone: a.item.tone === 'bad' ? 'bad' : 'warn',
      })),
    },
    loadSection('ready'),
    loadSection('overdue'),
    loadSection('checks'),
  ]

  // «Ждёт тебя» коротко: самое срочное из того же списка — горящее сверху, внутри
  // одной важности порядок ленты (она уже идёт по срочности).
  const tasks: (ListRow & { order: number })[] = []
  let order = 0
  const push = (row: ListRow) => tasks.push({ ...row, order: order++ })
  for (const e of queue.filter((x) => x.category === 'late' || x.category === 'priority'))
    push({ key: `q-${e.category}-${e.id}`, href: `/loads/${e.id}`, title: `${t(locale, SECTION[e.category].title)} · ${e.route}`, hint: `${e.route} · ${e.detail}`, level: e.bad ? 'high' : LOAD_LEVEL[e.category] })
  for (const r of needing) {
    const tr = truckById.get(r.truckId)
    const who = shortName(tr?.driverName) || tr?.number || tr?.name || ''
    if (r.free && r.days != null)
      push({ key: `idle-${r.truckId}`, href: `/trucks/${r.truckId}`, title: `${who} · ${t(locale, 'needsLoad.idleDays').replace('{n}', String(r.days))}`, level: r.days >= 5 ? 'high' : 'mid' })
    else if (!r.free && r.since)
      push({ key: `idle-${r.truckId}`, href: `/trucks/${r.truckId}`, title: `${who} · ${t(locale, 'needsLoad.freeOn').replace('{d}', md(r.since))}`, level: 'low' })
  }
  for (const e of queue.filter((x) => x.category !== 'late' && x.category !== 'priority'))
    push({ key: `q-${e.category}-${e.id}`, href: `/loads/${e.id}`, title: `${t(locale, SECTION[e.category].title)} · ${e.route}`, hint: `${e.route} · ${e.detail}`, level: e.bad ? 'high' : LOAD_LEVEL[e.category] })
  for (const a of alerts)
    push({
      key: `due-${a.truckId}-${a.item.label}`,
      href: `/trucks/${a.truckId}#care`,
      title: `#${a.number} · ${a.item.label}`,
      hint: a.item.daysLeft < 0 ? t(locale, 'overview.overdue') : t(locale, 'overview.daysLeft').replace('{n}', String(a.item.daysLeft)),
      level: a.item.tone === 'bad' ? 'high' : 'mid',
    })
  const taskCount = sections.reduce((s, sec) => s + sec.items.length, 0)
  const topTasks = [...tasks]
    .sort((a, b) => LEVEL_ORDER[a.level ?? 'low'] - LEVEL_ORDER[b.level ?? 'low'] || a.order - b.order)
    .slice(0, 3)
  add(
    'actions',
    's',
    <ListCard
      href="#todo"
      title={t(locale, 'today.feed.title')}
      info={t(locale, 'today.actionsInfo')}
      count={taskCount}
      head={[t(locale, 'today.task'), t(locale, 'today.priority')]}
      empty={t(locale, 'today.feed.empty')}
      rows={topTasks}
      more={taskCount > topTasks.length ? { href: '#todo', label: t(locale, 'today.allTasks') } : undefined}
    />,
  )

  // Деньги и траки: слева стопкой тёмная карточка денег и цветная топлива, справа —
  // «Статус траков». Одна плитка во всю строку: так они стоят как на образце, а сетка
  // плиток знает только четверть, половину и строку.
  const current = currentLoadsByTruck(live)
  const statusRows: TruckStatusRow[] = idle.map((r) => {
    const tr = truckById.get(r.truckId)
    const load = current.get(r.truckId)
    const base = {
      id: r.truckId,
      number: tr?.number?.trim() || tr?.name || '—',
      driver: shortName(tr?.driverName),
      place: load ? `→ ${load.destination ?? '—'}` : placeCity(r.place),
      rcId: load ? rateCons.get(load.id) : undefined,
    }
    if (r.unavailable)
      return { ...base, status: { label: t(locale, r.unavailable === 'repair' ? 'trucks.avail.repair' : 'trucks.avail.vacation'), kind: 'off' as const }, steps: null }
    if (r.homeUntil)
      return { ...base, status: { label: t(locale, 'today.st.home'), kind: 'off' as const }, steps: null, caption: { text: t(locale, 'today.cap.until').replace('{d}', md(r.homeUntil)) } }
    if (load?.status === 'in_transit')
      return {
        ...base,
        status: { label: t(locale, 'today.st.loaded'), kind: 'loaded' as const },
        steps: 2,
        caption: load.deliveryDate ? { text: t(locale, 'today.cap.until').replace('{d}', md(load.deliveryDate)) } : undefined,
      }
    if (load)
      return {
        ...base,
        status: { label: t(locale, 'today.st.pickup'), kind: 'pickup' as const },
        steps: 1,
        caption: load.pickupDate ? { text: t(locale, 'today.cap.pickup').replace('{d}', md(load.pickupDate)) } : undefined,
      }
    return {
      ...base,
      status: { label: t(locale, 'today.st.empty'), kind: 'empty' as const },
      steps: 0,
      caption:
        r.days != null
          ? { text: t(locale, 'needsLoad.idleDays').replace('{n}', String(r.days)), tone: r.days >= 5 ? ('bad' as const) : ('warn' as const) }
          : { text: t(locale, 'needsLoad.never') },
    }
  })
  const STATUS_ROWS = 8
  if (trucks.length > 0)
    add(
      'fleet',
      'l',
      <div className="grid h-full gap-4 md:grid-cols-4">
        <div className="grid gap-4 max-md:grid-cols-2 md:grid-rows-2">
          {money ? (
            <WalletCard
              href="/money?tab=unpaid"
              title={t(locale, 'overview.awaitingPayment')}
              info={t(locale, 'overview.awaitingPaymentInfo')}
              caption={t(locale, 'today.total')}
              value={usd.format(unpaidTotal)}
              bar={unpaidTotal > 0 ? { good: (unpaidTotal - overdueTotal) / unpaidTotal, bad: overdueTotal / unpaidTotal } : undefined}
              note={
                overdueTotal > 0 ? (
                  <span className="text-[#ff9aa2]">{t(locale, 'today.overdueSum').replace('{v}', usd.format(overdueTotal))}</span>
                ) : unpaidTotal > 0 ? (
                  t(locale, 'today.allOnTime')
                ) : undefined
              }
            />
          ) : (
            // Без права «Финансы» денег не видно — тёмная карточка показывает занятость парка.
            <WalletCard
              href="/loads"
              title={t(locale, 'loads.dash.utilization')}
              info={t(locale, 'today.utilizationInfo')}
              caption={`${week.occupied} / ${week.capacity} ${t(locale, 'loads.dash.truckDays')}`}
              value={week.utilization == null ? '—' : `${Math.round(week.utilization)}%`}
              bar={week.utilization == null ? undefined : { good: week.utilization / 100, bad: 0 }}
            />
          )}
          <FuelCard
            href="/trucks"
            title={t(locale, 'today.fuel')}
            info={t(locale, 'today.fuelInfo')}
            chip={gallon ? `${usd2.format(gallon)}/gal` : undefined}
            caption={t(locale, 'today.fuelWeek')}
            value={usd.format(fuelWeek)}
            share={week.gross > 0 ? fuelWeek / week.gross : null}
            shareLabel={week.gross > 0 ? t(locale, 'today.fuelShare').replace('{n}', String(Math.round((fuelWeek / week.gross) * 100))) : undefined}
          />
        </div>
        <div className="md:col-span-3">
          <TruckStatusCard
            title={t(locale, 'today.fleet')}
            info={t(locale, 'today.fleetInfo')}
            rows={statusRows.slice(0, STATUS_ROWS)}
            all={{ href: '/trucks', label: t(locale, 'today.allTrucks') }}
            cols={{
              truck: t(locale, 'today.col.truck'),
              driver: t(locale, 'today.col.driver'),
              place: t(locale, 'today.col.place'),
              status: t(locale, 'today.col.status'),
              trip: t(locale, 'today.col.trip'),
            }}
            steps={[t(locale, 'today.step.booked'), t(locale, 'today.step.picked'), t(locale, 'today.step.delivered')]}
            more={statusRows.length > STATUS_ROWS ? t(locale, 'today.feed.more').replace('{n}', String(statusRows.length - STATUS_ROWS)) : undefined}
          />
        </div>
      </div>,
    )

  // Календарь недели: те же полосы, что «Загрузка парка» на «Траках», но ровно семь дней
  // расчётной недели и водители по строкам.
  const heatRateCons: Record<number, number> = {}
  const calendarRows = trucks.map((tr) => {
    const working = buildWorkingDays(live.filter((l) => l.truckId === tr.id))
    for (const day of working.values())
      for (const l of day) {
        const rc = rateCons.get(l.id)
        if (rc != null) heatRateCons[l.id] = rc
      }
    const load = current.get(tr.id)
    return {
      id: tr.id,
      label: tr.number?.trim() || tr.name,
      sub: shortName(tr.driverName),
      working,
      when: tr.unavailable || homeByTruck.get(tr.id)
        ? { text: '', tone: 'off' as const }
        : load
          ? { text: '', tone: 'busy' as const }
          : { text: '', tone: 'free' as const },
    }
  })
  if (trucks.length > 0) add('calendar', 'l', <FleetHeatmap week={weekFrom} today={today} rows={calendarRows} rateCons={heatRateCons} />)

  add(
    'todo',
    'l',
    <div id="todo" className="h-full scroll-mt-24">
      <TodayFeed title={t(locale, 'today.feed.title')} empty={t(locale, 'today.feed.empty')} more={t(locale, 'today.feed.more')} sections={sections} />
    </div>,
  )

  const grid = await tileGrid('overview', defaults, locale, migrateOverviewTiles)
  // Те же шаги, что у экскурсии в layout (cache — один запрос). null — показывать
  // нечего: диспетчер или админ, который уже нажал «Готово».
  const tour = await tourSteps(user, locale).catch(() => null)

  return (
    <main className="page">
      <PageHeader
        title={t(locale, 'nav.overview')}
        info={t(locale, 'today.info')}
        subtitle={t(locale, 'today.subtitle')}
        actions={
          <Button href="/loads/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
            {t(locale, 'overview.addLoad')}
          </Button>
        }
      />

      {tour && <TourCard total={tour.length} done={tour.filter((s) => s.done).length} persist={user?.isDemo ? 'session' : 'local'} />}

      <WidgetGrid {...grid} widgets={widgets} />
    </main>
  )
}
