import type { Widget } from '@/components/widget-grid'
import { tileGrid } from '@/lib/tiles'
import { LOADS_TILES } from '@/lib/tiles-core'
import { Suspense } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/page-header'
import { LaneStats } from '@/components/lane-stats'
import { listLoads, listTrucks, loadPapers, openStopMarks } from '@/lib/loads'
import { calcLoad } from '@/lib/profit'
import { truckPhotoFlags, truckTrailerNumbers } from '@/lib/maintenance'
import { datCached, datEquipment, loadMarketRpm, type DatEquipment } from '@/lib/dat-market'
import { companyScope } from '@/lib/session'
import { laneTargets } from '@/lib/rate-check'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'
import { lateStop, upcomingStop, weekStartIso } from '@/lib/loads-dashboard'
import { todayEt } from '@/lib/payments'
import type { LoadMetrics } from '@/components/loads-toolbar'
import { LoadsMapServer } from './loads-map-server'
import { LoadsViews } from './loads-views'

export const dynamic = 'force-dynamic'

type Params = Promise<{ view?: string; week?: string; day?: string; q?: string }>

// Каркас рисуется сразу; всё, что ходит в базу, — в <LoadsBoard> за Suspense, чтобы
// смена вкладки или недели не выбрасывала страницу целиком в app/loading.tsx.
export default async function Page({ searchParams }: { searchParams: Params }) {
  // Язык — из cookie, без базы: шапка раздела видна сразу, пока грузы ещё считаются.
  const locale = await getLocale()
  return (
    <main className="page">
      <PageHeader
        title={t(locale, 'loads.page.title')}
        info={t(locale, 'loads.page.tooltip')}
        subtitle={t(locale, 'loads.page.subtitle')}
        actions={
          <Button href="/loads/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
            {t(locale, 'loads.page.new')}
          </Button>
        }
      />
      <Suspense fallback={<div className="panel h-40 animate-pulse" />}>
        <LoadsBoard searchParams={searchParams} />
      </Suspense>
    </main>
  )
}

async function LoadsBoard({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams
  const companyId = await companyScope()
  const locale = await getLocale()
  const [loads, trucks, photoIds, { rateCons, pods: podIds }, marks, trailers] = await Promise.all([
    listLoads(companyId),
    listTrucks(companyId),
    truckPhotoFlags(companyId),
    // Рейт-кон и КОНЕЧНЫЙ POD по каждому грузу — те же условия, по которым
    // lib/invoice.ts выставляет счёт автоматически.
    loadPapers(companyId),
    // Отметки водителя только по открытым грузам — по ним ищется ближайшая остановка.
    openStopMarks(companyId),
    truckTrailerNumbers(companyId),
  ])
  // Рынок у каждого груза — по правилу карточки груза: вписанная ставка, иначе DAT по
  // региону погрузки; серия — по трейлеру трака, иначе Van. Суточный снимок только из кэша.
  const seriesOf = (truckId: number | null): DatEquipment => datEquipment(truckId == null ? null : trailers.get(truckId)) ?? 'VAN'
  // Цель торга — только у открытых грузов: она по котировкам последних 30 дней, и
  // сравнивать с ней рейс трёхмесячной давности значит мерить старую ставку новой ценой.
  const [snaps, targets] = await Promise.all([
    Promise.all([...new Set(loads.map((l) => seriesOf(l.truckId)))].map(async (eq) => [eq, await datCached(eq)] as const)).then(
      (e) => new Map(e),
    ),
    laneTargets(
      loads
        .filter((l) => l.status === 'quoted' || l.status === 'booked' || l.status === 'in_transit')
        .map((l) => ({ ...l, equipment: seriesOf(l.truckId) })),
      'default',
    ).catch(() => new Map<number, never>()),
  ])
  const byId = new Map(trucks.map((tr) => [tr.id, tr]))
  // Экономика считается против СВОЕГО трака; неназначенному грузу чужой не подставляется.
  const priced = loads.map((load) => {
    const truck = load.truckId == null ? undefined : byId.get(load.truckId)
    return { load, r: truck ? calcLoad(load, truck) : null }
  })
  const metrics: Record<number, LoadMetrics> = {}
  const now = Date.now()
  for (const { load, r } of priced) {
    const miles = load.loadedMiles + load.deadheadMiles
    const snap = snaps.get(seriesOf(load.truckId)) ?? null
    const market = loadMarketRpm(snap, load)
    metrics[load.id] = {
      net: r?.net ?? 0,
      rpm: miles > 0 ? load.rate / miles : 0,
      hasPod: podIds.has(load.id),
      hasRc: rateCons.has(load.id),
      nextStop: upcomingStop(load, marks.get(load.id)),
      // Окно остановки прошло, а приезда никто не отметил и GPS не видел — опаздывает.
      lateMin: lateStop(load, marks.get(load.id) ?? [], now)?.minutes ?? null,
      market,
      marketAt: market && snap && !(load.spotRpm && load.spotRpm > 0) ? usDate(todayEt(new Date(snap.at))) : null,
      rc: targets.get(load.id) ?? null,
    }
  }

  // Неделя уходит в клиент днём yyyy-mm-dd по восточному времени, а не моментом в ms:
  // из одной и той же ms сервер в UTC и браузер в New York получали разные дни (#418).
  const weekFrom = weekStartIso(todayEt())
  const initialWeek = sp.week && !Number.isNaN(Date.parse(`${sp.week}T12:00:00`)) ? weekStartIso(sp.week) : weekFrom
  const grid = await tileGrid('loads', LOADS_TILES, locale)
  // Свод направлений собирает страница-сервер, остальные плитки — сам LoadsViews:
  // они завязаны на его состояние. Сюда он приходит готовой плиткой.
  const lanes: Widget[] = [
    {
      id: 'lanes',
      node: (
        <div>
          <LaneStats
            rows={priced.map(({ load, r }) => ({ load, net: r?.net ?? 0, miles: load.loadedMiles + load.deadheadMiles }))}
            locale={locale}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      {/* Число грузов ушло из шапки в свою плитку: в шапке его нельзя было ни
          подвинуть, ни нажать, а плитка ещё и сужает список до своих грузов. */}
      <LoadsViews
        loads={loads}
        trucks={trucks}
        metrics={metrics}
        rateConPairs={[...rateCons]}
        photoTruckIds={[...photoIds]}
        weekFrom={weekFrom}
        initialView={sp.view === 'board' ? 'board' : sp.view === 'calendar' ? 'calendar' : 'driver'}
        initialWeek={initialWeek}
        initialDay={sp.day ?? null}
        initialQuery={sp.q ?? ''}
        grid={grid}
        extra={lanes}
        mapPanel={
          <Suspense key="map" fallback={<div className="panel h-64 animate-pulse" />}>
            <LoadsMapServer loads={loads} trucks={trucks} metrics={metrics} locale={locale} />
          </Suspense>
        }
      />
    </>
  )
}
