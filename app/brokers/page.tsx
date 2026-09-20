import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t, type MsgKey } from '@/lib/i18n'
import { listOurBrokers } from '@/lib/brokers'
import { brokerKeyOf, brokerNoteKey, prettyCompany } from '@/lib/broker-key'
import { listLoads } from '@/lib/loads'
import { allStopEvents } from '@/lib/load-events'
import { detentionTerms, getSettings } from '@/lib/settings'
import { avgDwell, facilityIndex, facilityNoteKey } from '@/lib/facilities'
import { stateOfCity } from '@/lib/toll-spend'
import { pctText } from '@/lib/dat-market-core'
import { usd2, usDate } from '@/lib/fmt'
import { financesHref, todayEt } from '@/lib/payments'
import { TOP_BROKERS } from '@/lib/brokers-top'
import { BrokerCheckForm } from '@/components/broker-check-form'
import { TopBrokers } from '@/components/top-brokers'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { tileGrid } from '@/lib/tiles'
import { BROKERS_TILES } from '@/lib/tiles-core'
import { Suspense } from 'react'
import { RoutePlanSection } from '@/components/route-plan-section'
import { Directory, type DirBroker, type DirFacility, type DirView } from './directory'

export const dynamic = 'force-dynamic'

const VIEWS: DirView[] = ['all', 'brokers', 'facilities', 'attention']

/**
 * «Рынок» (до 18.09.2026 — «Брокеры и склады»): сверху «Куда отправить трак», под
 * ним один список брокеров и складов с общим поиском. В строке одно главное: как
 * платит брокер или сколько стоим на складе; нажатие раскрывает строку на месте со
 * всем, что было на старых страницах «Брокеры» и «Склады» (реестр, правка, люди,
 * направления, грузы, заметка; у склада — простой, детеншн, «как заехать»). Карточки
 * по адресу (/brokers/<ключ>, /facilities/<ключ>) остались для ссылок. Ниже —
 * проверка по MC/DOT и «Крупнейшие брокеры», вернувшиеся со старой страницы.
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
  const notes = await getSettings([...brokers.map((b) => brokerNoteKey(b.key)), ...facilityList.map((f) => facilityNoteKey(f.key))])
  const when = (l: { pickupDate: string | null; createdAt: string }) => l.pickupDate ?? l.createdAt
  const byDate = <L extends { pickupDate: string | null; createdAt: string }>(a: L, b: L) => when(b).localeCompare(when(a))
  const loadById = new Map(loads.map((l) => [l.id, l]))
  /** Сколько показывать грузов в раскрытой строке; остальное — в карточке. */
  const LOADS_IN_ROW = 8
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

  // Грузы по брокеру — одним проходом, а не фильтром на каждого: брокеров десятки,
  // грузов сотни.
  const loadsOfBroker = new Map<string, typeof loads>()
  for (const l of loads) {
    if (l.status === 'cancelled') continue
    const k = brokerByLoad.get(l.id)
    if (!k) continue
    loadsOfBroker.set(k, [...(loadsOfBroker.get(k) ?? []), l])
  }
  const facilityByLoad = new Map<number, (typeof facilityList)[number][]>()
  for (const f of facilityList) for (const id of f.loadIds) facilityByLoad.set(id, [...(facilityByLoad.get(id) ?? []), f])

  const dirBrokers: DirBroker[] = brokers.map((b) => {
    const oldest = Math.max(0, ...b.unpaid.map((u) => u.days))
    const inactive = !!b.authorityStatus && b.authorityStatus !== 'active'
    const mine = (loadsOfBroker.get(b.key) ?? []).sort(byDate)
    const unpaid = new Map(b.unpaid.map((u) => [u.id, u]))
    const lanes = [
      ...mine
        .reduce((m, l) => {
          const lane = `${stateOfCity(l.origin) ?? '—'} → ${stateOfCity(l.destination) ?? '—'}`
          return m.set(lane, (m.get(lane) ?? 0) + 1)
        }, new Map<string, number>())
        .entries(),
    ]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
    const facVisits = new Map<string, { key: string; name: string; visits: number }>()
    for (const l of mine)
      for (const f of facilityByLoad.get(l.id) ?? []) {
        const cur = facVisits.get(f.key) ?? { key: f.key, name: `${f.name ?? f.address ?? f.city}${f.name && f.city ? ` · ${f.city}` : ''}`, visits: 0 }
        cur.visits++
        facVisits.set(f.key, cur)
      }
    const vs = b.vsMarket
    const vsText = vs
      ? vs.tone === 'warn'
        ? t(locale, 'brokers.vsMarketIn').replace('{pct}', pctText(vs.diff))
        : t(locale, vs.diff > 0 ? 'brokers.vsMarketAbove' : 'brokers.vsMarketBelow').replace('{pct}', String(Math.abs(Math.round(vs.diff))))
      : null
    // Неоплаченные первыми: с ними разговор нужен сегодня.
    const ordered = [...mine.filter((l) => unpaid.has(l.id)), ...mine.filter((l) => !unpaid.has(l.id))].slice(0, LOADS_IN_ROW)
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
      detail: {
        name: b.name,
        phone: b.phone,
        email: b.email,
        payVia: b.payVia,
        authorityStatus: b.authorityStatus,
        loadCount: b.loadCount,
        lastLoad: b.lastLoad ? usDate(b.lastLoad) : null,
        gross: b.gross,
        rpm: b.rpm,
        vsText,
        vsTone: vs?.tone ?? null,
        vsInfo: vs
          ? t(locale, 'brokers.vsMarketInfo')
              .replace('{rpm}', usd2.format(vs.rpm))
              .replace('{market}', usd2.format(vs.market))
              .replace('{n}', String(vs.loads))
              .replace('{date}', vs.date ?? '—')
          : null,
        payGrade: b.payGrade,
        unpaidCount: b.unpaid.length,
        reps: b.reps.map((r) => ({ name: r.name, email: r.email, phone: r.phone, loads: r.loads, lastAt: r.lastAt ? usDate(r.lastAt) : null })),
        lanes,
        facilities: [...facVisits.values()].sort((x, y) => y.visits - x.visits).slice(0, 6),
        loads: ordered.map((l) => {
          const u = unpaid.get(l.id)
          return {
            id: l.id,
            date: usDate(when(l)),
            route: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
            ref: l.referenceId,
            rate: Number(l.rate) || 0,
            statusText: t(locale, `status.${l.status}` as MsgKey),
            waiting: u?.days ?? null,
            moneyHref: u ? financesHref({ id: l.id, referenceId: l.referenceId }) : null,
          }
        }),
        note: notes.get(brokerNoteKey(b.key)) ?? null,
      },
    }
  })

  const dirFacilities: DirFacility[] = facilityList
    .sort((a, b) => b.visits - a.visits || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
    .map((f) => {
      const dwell = avgDwell(f)
      const linked = brokerNameByKey.get(top(brokersOfFacility.get(f.key)) ?? '') ?? null
      const here = f.loadIds.map((id) => loadById.get(id)).filter((l): l is NonNullable<typeof l> => !!l).sort(byDate)
      const who = [...(brokersOfFacility.get(f.key) ?? new Map<string, number>()).entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([k, n]) => ({ key: k, name: brokerNameByKey.get(k) ?? k, n }))
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
        detail: {
          where: f.address ?? f.city,
          mapQuery: [f.name, f.address ?? f.city].filter(Boolean).join(', '),
          lastDate: f.lastDate ? usDate(f.lastDate) : null,
          dwellCount: f.dwell.length,
          detentions: f.detentions,
          freeMinutes: terms.free * 60,
          directions: f.directions,
          note: notes.get(facilityNoteKey(f.key)) ?? null,
          brokers: who,
          loads: here.slice(0, LOADS_IN_ROW).map((l) => ({
            id: l.id,
            date: usDate(when(l)),
            route: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
            rate: Number(l.rate) || 0,
          })),
        },
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
    // Со старой страницы «Брокеры» (до 16.09.2026): проверка незнакомого брокера по
    // MC или DOT и справочник крупнейших брокеров — владелец попросил вернуть.
    { id: 'check', node: <BrokerCheckForm /> },
    { id: 'top', node: <TopBrokers brokers={TOP_BROKERS} /> },
  ]
  const grid = await tileGrid('brokers', BROKERS_TILES, locale)

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-xl font-bold tracking-tight">{t(locale, 'nav.brokers')}</h1>
      <p className="mb-4 text-base text-t2">{t(locale, 'brokers.dir.subtitle')}</p>

      <WidgetGrid


        {...grid}
        widgets={widgets}
      />
    </main>
  )
}

/** Место «Куда отправить трак», пока считаются ставки: той же высоты, чтобы списки
 * под ним не прыгали, когда раздел приедет. */
function PlanSkeleton() {
  return <div className="panel mb-4 h-64 animate-pulse" aria-hidden />
}
