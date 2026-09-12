import { Suspense } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { Info } from '@/components/info'
import { LaneStats } from '@/components/lane-stats'
import { sql } from '@/lib/db'
import { listLoads, listTrucks } from '@/lib/loads'
import { calcLoad } from '@/lib/profit'
import { truckPhotoFlags } from '@/lib/maintenance'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { usd, weekAnchorOf, weekStart } from '@/lib/fmt'
import { isoDay, upcomingStop } from '@/lib/loads-dashboard'
import type { StopEv } from '@/lib/stops'
import type { LoadMetrics } from '@/components/loads-toolbar'
import type { AttentionEntry } from './loads-insights'
import { LoadsMapServer } from './loads-map-server'
import { LoadsViews } from './loads-views'

export const dynamic = 'force-dynamic'

type Params = Promise<{ view?: string; week?: string; day?: string; q?: string }>

// Каркас рисуется сразу; всё, что ходит в базу, — в <LoadsBoard> за Suspense, чтобы
// смена вкладки или недели не выбрасывала страницу целиком в app/loading.tsx.
export default function Page({ searchParams }: { searchParams: Params }) {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
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
  const [loads, trucks, photoIds, docs, events] = await Promise.all([
    listLoads(companyId),
    listTrucks(companyId),
    truckPhotoFlags(companyId),
    // Рейт-кон и КОНЕЧНЫЙ POD (stop_seq IS NULL) по каждому грузу — те же условия, по
    // которым lib/invoice.ts выставляет счёт автоматически.
    sql`SELECT id, load_id, kind, stop_seq FROM documents
        WHERE company_id = ${companyId} AND load_id IS NOT NULL AND deleted_at IS NULL
        ORDER BY uploaded_at DESC`,
    // Отметки водителя только по открытым грузам — по ним ищется ближайшая остановка.
    sql`SELECT e.load_id, e.kind, e.at, e.stop_seq FROM load_events e
        JOIN loads l ON l.id = e.load_id AND l.company_id = e.company_id
        WHERE e.company_id = ${companyId} AND l.status IN ('booked', 'in_transit')
        ORDER BY e.at ASC`,
  ])
  const rateCons = new Map<number, number>()
  const podIds = new Set<number>()
  for (const doc of docs) {
    if (doc.kind === 'ratecon' && !rateCons.has(doc.load_id)) rateCons.set(doc.load_id, doc.id)
    if (doc.kind === 'pod' && doc.stop_seq == null) podIds.add(doc.load_id)
  }
  const marks = new Map<number, StopEv[]>()
  for (const e of events) {
    const list = marks.get(e.load_id) ?? []
    list.push({ kind: e.kind, at: String(e.at), stopSeq: e.stop_seq })
    marks.set(e.load_id, list)
  }

  const byId = new Map(trucks.map((tr) => [tr.id, tr]))
  // Экономика считается против СВОЕГО трака; неназначенному грузу чужой не подставляется.
  const priced = loads.map((load) => {
    const truck = load.truckId == null ? undefined : byId.get(load.truckId)
    return { load, r: truck ? calcLoad(load, truck) : null }
  })
  const metrics: Record<number, LoadMetrics> = {}
  for (const { load, r } of priced) {
    const miles = load.loadedMiles + load.deadheadMiles
    metrics[load.id] = {
      net: r?.net ?? 0,
      rpm: miles > 0 ? load.rate / miles : 0,
      hasPod: podIds.has(load.id),
      hasRc: rateCons.has(load.id),
      nextStop: upcomingStop(load, marks.get(load.id)),
    }
  }

  // Очередь внимания. Черновики, отменённые и оплаченные сюда не попадают: с них ничего
  // не причитается и никакие бумаги не просрочены.
  const now = Date.now()
  const attention: AttentionEntry[] = []
  for (const { load, r } of priced) {
    if (load.status === 'quoted' || load.status === 'cancelled' || load.status === 'paid') continue
    const route = [load.referenceId, `${load.origin ?? '—'} → ${load.destination ?? '—'}`].filter(Boolean).join(' · ')
    const push = (category: AttentionEntry['category'], detail: string) => attention.push({ id: load.id, route, category, detail })
    const missing = [rateCons.has(load.id) ? null : 'RC', load.status === 'delivered' && !podIds.has(load.id) ? 'POD' : null].filter(Boolean)
    if (missing.length) push('documents', `${t(locale, 'loads.dash.missingDocs')}: ${missing.join(' / ')}`)
    if (load.status === 'delivered' && !load.invoicedAt && podIds.has(load.id) && rateCons.has(load.id)) push('ready', usd.format(load.rate))
    if (load.invoicedAt && !load.paidAt && now > Date.parse(load.invoicedAt) + load.paymentTermsDays * 86400000) push('overdue', usd.format(load.rate))
    if (load.status === 'booked' || load.status === 'in_transit') {
      if (load.milesEstimated) push('checks', t(locale, 'loads.attention.milesEstimated'))
      else if (r && r.net < 0) push('checks', `${t(locale, 'loads.attention.losing')} · ${usd.format(r.net)}`)
    }
  }

  const parsed = sp.week ? Date.parse(`${sp.week}T00:00:00`) : NaN
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

      <LoadsViews
        loads={loads}
        trucks={trucks}
        metrics={metrics}
        rateConPairs={[...rateCons]}
        photoTruckIds={[...photoIds]}
        attention={attention}
        weekFrom={isoDay(new Date(weekStart()))}
        initialView={sp.view === 'board' ? 'board' : sp.view === 'calendar' ? 'calendar' : 'driver'}
        initialWeek={Number.isNaN(parsed) ? weekStart() : weekAnchorOf(parsed)}
        initialDay={sp.day ?? null}
        initialQuery={sp.q ?? ''}
        mapPanel={
          <Suspense key="map" fallback={<div className="panel mb-4 h-64 animate-pulse" />}>
            <LoadsMapServer loads={loads} trucks={trucks} metrics={metrics} locale={locale} />
          </Suspense>
        }
      />

      {/* Направления — в самом низу: «куда возить выгодно» смотрят раз в неделю. */}
      <LaneStats rows={priced.map(({ load, r }) => ({ load, net: r?.net ?? 0, miles: load.loadedMiles + load.deadheadMiles }))} locale={locale} />
    </>
  )
}
