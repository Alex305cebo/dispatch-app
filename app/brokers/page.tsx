import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { listOurBrokers } from '@/lib/brokers'
import { brokerKeyOf, prettyCompany } from '@/lib/broker-key'
import { listLoads } from '@/lib/loads'
import { allStopEvents } from '@/lib/load-events'
import { detentionTerms } from '@/lib/settings'
import { avgDwell, facilityIndex } from '@/lib/facilities'
import { usDate } from '@/lib/fmt'
import { todayEt } from '@/lib/payments'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { gridLabels } from '@/lib/grid-labels'
import { readLayout } from '@/lib/tiles'
import { applyLayout, BROKERS_TILES } from '@/lib/tiles-core'
import { Suspense } from 'react'
import { RoutePlanSection } from '@/components/route-plan-section'
import { Directory, type DirBroker, type DirFacility, type DirView } from './directory'

export const dynamic = 'force-dynamic'

const VIEWS: DirView[] = ['all', 'brokers', 'facilities', 'attention']

/**
 * «Рынок» (до 18.09.2026 — «Брокеры и склады»): сверху «Куда отправить
 * трак», под ним справочник, переделанный по макету от 16.09.2026 — общий поиск,
 * короткие списки, по нажатию карточка брокера (/brokers/<ключ>) или склада
 * (/facilities/<ключ>). В строке одно главное: как платит брокер или сколько стоим
 * на складе. Всё остальное — в карточке.
 */
export default async function BrokersPage({ searchParams }: { searchParams: Promise<{ q?: string; view?: string }> }) {
  const { q = '', view } = await searchParams
  const companyId = await companyScope()
  const locale = await getLocale()
  const [brokers, loads, events, terms] = await Promise.all([
    listOurBrokers(companyId),
    listLoads(companyId),
    allStopEvents(companyId),
    detentionTerms(),
  ])

  // Брокер и склад — не два справочника, а одна сеть: их связывают грузы. У склада
  // есть loadIds, у груза — брокер, поэтому одним проходом получаются обе половины
  // связи: с кем чаще всего имеем дело на этом складе и куда чаще всего возим этого
  // брокера. Эта строка и стоит в списке, и ищется — «Walmart» находит и склад, и
  // брокера, который туда шлёт.
  const facilityList = [...facilityIndex(loads, events, terms.free).values()]
  const brokerByLoad = new Map<number, string>()
  for (const l of loads) {
    const k = brokerKeyOf({ mc: l.brokerMc, email: l.brokerEmail, name: l.brokerName })
    if (k) brokerByLoad.set(l.id, k)
  }
  const brokerNameByKey = new Map(brokers.map((b) => [b.key, prettyCompany(b.registryName) ?? b.name ?? '—']))
  const placesOfBroker = new Map<string, Map<string, number>>()
  const brokersOfFacility = new Map<string, Map<string, number>>()
  const bump = (m: Map<string, Map<string, number>>, outer: string, inner: string) => {
    const inn = m.get(outer) ?? new Map<string, number>()
    inn.set(inner, (inn.get(inner) ?? 0) + 1)
    m.set(outer, inn)
  }
  for (const f of facilityList) {
    const place = f.name ?? f.city ?? f.address
    for (const id of f.loadIds) {
      const bk = brokerByLoad.get(id)
      if (!bk) continue
      bump(brokersOfFacility, f.key, bk)
      if (place) bump(placesOfBroker, bk, place)
    }
  }
  /** Самое частое значение; при равенстве — первое встреченное. */
  const top = (m: Map<string, number> | undefined): string | null =>
    m ? ([...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) : null
  const daysSince = (date: string | null) =>
    date ? Math.max(0, Math.round((Date.parse(todayEt()) - Date.parse(date)) / 86400000)) : null

  const dirBrokers: DirBroker[] = brokers.map((b) => {
    const oldest = Math.max(0, ...b.unpaid.map((u) => u.days))
    const inactive = !!b.authorityStatus && b.authorityStatus !== 'active'
    return {
      key: b.key,
      name: prettyCompany(b.registryName) ?? b.name ?? '—',
      mc: b.mc,
      loads: b.loadCount,
      payDays: b.payDays,
      owed: b.owed,
      oldest,
      sinceDays: daysSince(b.lastLoad),
      inactive,
      checked: b.checkedAt ? usDate(b.checkedAt) : null,
      linked: top(placesOfBroker.get(b.key)),
      // Поля через «|»: цифры телефона и MC ищутся каждое отдельно, а не слитно.
      search: [b.name, b.registryName, b.mc, b.phone, b.email, top(placesOfBroker.get(b.key)), ...b.reps.flatMap((r) => [r.name, r.email, r.phone])]
        .filter(Boolean)
        .join(' | '),
      attention: inactive || (b.owed > 0 && oldest > 30) || b.payGrade === 'slow',
    }
  })

  const dirFacilities: DirFacility[] = facilityList
    .sort((a, b) => b.visits - a.visits || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
    .map((f) => {
      const dwell = avgDwell(f)
      const linked = brokerNameByKey.get(top(brokersOfFacility.get(f.key)) ?? '') ?? null
      return {
        key: f.key,
        name: f.name ?? f.address ?? f.city ?? '—',
        place: f.name ? (f.city ?? f.address) : null,
        visits: f.visits,
        dwell,
        sinceDays: daysSince(f.lastDate),
        linked,
        search: [f.name, f.address, f.city, linked].filter(Boolean).join(' | '),
        // Стоим дольше бесплатного времени — там трак теряет день, это надо видеть заранее.
        attention: f.detentions >= 2 || (dwell != null && dwell >= terms.free * 60 && f.visits >= 2),
      }
    })

  const widgets: Widget[] = [
    {
      id: 'plan',
      // «Куда отправить трак» переехало сюда с «Траков» (18.09.2026) — отсюда и новое
      // имя раздела. Своя Suspense-граница: раздел ждёт снимок DAT и ставки по
      // маршрутам, а списки брокеров и складов готовы сразу.
      node: (
        <div>
          <Suspense fallback={<PlanSkeleton />}>
            <RoutePlanSection />
          </Suspense>
        </div>
      ),
    },
    {
      id: 'directory',
      node: (
        <div>
          <Directory
            brokers={dirBrokers}
            facilities={dirFacilities}
            initialQuery={q}
            initialView={VIEWS.includes(view as DirView) ? (view as DirView) : 'all'}
          />
        </div>
      ),
    },
  ]
  const layout = applyLayout(await readLayout('brokers'), BROKERS_TILES)

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-xl font-bold tracking-tight">{t(locale, 'nav.brokers')}</h1>
      <p className="mb-4 text-base text-t2">{t(locale, 'brokers.dir.subtitle')}</p>

      <WidgetGrid
        page="brokers"
        layout={layout}
        defaults={BROKERS_TILES}
        widgets={widgets}
        labels={gridLabels(locale)}
      />
    </main>
  )
}

/** Место «Куда отправить трак», пока считаются ставки: той же высоты, чтобы списки
 * под ним не прыгали, когда раздел приедет. */
function PlanSkeleton() {
  return <div className="panel mb-4 h-64 animate-pulse" aria-hidden />
}
