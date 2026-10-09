// «Сегодня» — главная (до 10/09/26 «Обзор»). По плану «Порядок в TMS» здесь только то, с
// чем работают каждый день: сверху четыре цифры недели, ниже лента «Ждёт тебя» — всё,
// по чему нужно что-то сделать. «Загрузка парка», карточки водителей и последние грузы
// отсюда ушли: они живут на «Траках» и «Грузах», а здесь повторяли их же, и главная
// была длиной в три экрана.

import {
  AlarmClock,
  Calculator,
  CalendarClock,
  DollarSign,
  FileWarning,
  Flag,
  Gauge,
  MessageSquareWarning,
  Package,
  Plus,
  Receipt,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/page-header'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { TodayFeed, type FeedSection, type FeedTone } from '@/components/today-feed'
import { idleMarkets, needsLoadItems, needsLoadRows } from '@/components/needs-load'
import { Stat } from '@/components/stat'
import { TourCard } from '@/components/tour-card'
import { tileGrid } from '@/lib/tiles'
import type { TilePlacement, TileSize } from '@/lib/tiles-core'
import { listLoads, listTrucks, loadPapers, openStopMarks } from '@/lib/loads'
import { sql } from '@/lib/db'
import { seesFleetGps } from '@/lib/company'
import { fleetExpiryAlerts, truckProfiles, truckTrailerNumbers } from '@/lib/maintenance'
import { homeUntil } from '@/lib/maintenance-core'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { fixPlace } from '@/lib/place'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { can } from '@/lib/capabilities-server'
import { usd, usd2 } from '@/lib/fmt'
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

/** «3 окт» — как подпись недели на «Грузах». */
const dayLabel = (day: string, locale: Locale) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })

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
  const { freeCount, burnPerDay } = idleSummary(idle)

  // Неделя — та же, что на «Грузах»: подтверждённые грузы с пикапом на этой расчётной неделе.
  const weekFrom = weekStartIso(today)
  const week = weekStats(loads, trucks, weekFrom)
  const weekMiles = week.rows.reduce((s, l) => s + l.loadedMiles + l.deadheadMiles, 0)
  const active = live.filter((l) => l.status === 'booked' || l.status === 'in_transit').length

  // Ждём оплаты — то же, что «Деньги → Не оплачено», одной цифрой: выставленные и не
  // оплаченные счета плюс доставленные грузы без счёта.
  const unpaid = money ? loads.filter((l) => (l.invoicedAt && !l.paidAt) || (l.status === 'delivered' && !l.invoicedAt)) : []
  const unpaidTotal = unpaid.reduce((s, l) => s + l.rate, 0)
  const overdueTotal = unpaid.filter((l) => overdueDays(l, now) != null).reduce((s, l) => s + l.rate, 0)

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
    <Stat
      surface="panel"
      hero
      href="/loads"
      icon={<DollarSign {...ICON} />}
      accent="haul"
      label={t(locale, 'today.weekGross')}
      value={usd.format(week.gross)}
      sub={`${dayLabel(weekFrom, locale)} – ${dayLabel(shiftDay(weekFrom, 6), locale)}`}
      info={t(locale, 'today.weekGrossInfo')}
    />,
  )
  add(
    'rpm',
    's',
    <Stat
      surface="panel"
      href="/loads"
      icon={<TrendingUp {...ICON} />}
      accent="good"
      label={t(locale, 'overview.rpm')}
      value={week.rpm == null ? '—' : `${usd2.format(week.rpm)}/mi`}
      sub={`${Math.round(weekMiles).toLocaleString('en-US')} mi`}
      info={t(locale, 'today.rpmInfo')}
    />,
  )
  add(
    'active',
    's',
    <Stat
      surface="panel"
      href="/loads"
      icon={<Package {...ICON} />}
      accent="warn"
      label={t(locale, 'overview.inWork')}
      value={String(active)}
      sub={trucks.length > 0 ? t(locale, 'overview.inWorkSub').replace('{n}', String(freeCount)) : undefined}
      subTone={freeCount > 0 ? 'good' : undefined}
      info={t(locale, 'overview.inWorkInfo')}
    />,
  )
  if (money)
    add(
      'unpaid',
      's',
      <Stat
        surface="panel"
        href="/money?tab=unpaid"
        icon={<Wallet {...ICON} />}
        accent={overdueTotal > 0 ? 'bad' : 'haul'}
        label={t(locale, 'overview.awaitingPayment')}
        value={usd.format(unpaidTotal)}
        sub={overdueTotal > 0 ? `${t(locale, 'overview.ofWhichOverdue')} ${usd.format(overdueTotal)}` : undefined}
        subTone="bad"
        info={t(locale, 'overview.awaitingPaymentInfo')}
      />,
    )
  // Без права «Финансы» четвёртой цифрой — занятость парка: денег не видно, а ряд целый.
  else
    add(
      'utilization',
      's',
      <Stat
        surface="panel"
        href="/loads"
        icon={<Gauge {...ICON} />}
        accent="haul"
        label={t(locale, 'loads.dash.utilization')}
        value={week.utilization == null ? '—' : `${Math.round(week.utilization)}%`}
        sub={`${week.occupied} / ${week.capacity} ${t(locale, 'loads.dash.truckDays')}`}
        info={t(locale, 'today.utilizationInfo')}
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
  const truckById = new Map(trucks.map((tr) => [tr.id, tr]))
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
  add(
    'todo',
    'l',
    <TodayFeed title={t(locale, 'today.feed.title')} empty={t(locale, 'today.feed.empty')} more={t(locale, 'today.feed.more')} sections={sections} />,
  )

  const grid = await tileGrid('overview', defaults, locale)
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
