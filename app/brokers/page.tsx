import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { listOurBrokers } from '@/lib/brokers'
import { prettyCompany } from '@/lib/broker-key'
import { listLoads } from '@/lib/loads'
import { allStopEvents } from '@/lib/load-events'
import { detentionTerms } from '@/lib/settings'
import { avgDwell, facilityIndex } from '@/lib/facilities'
import { usDate } from '@/lib/fmt'
import { todayEt } from '@/lib/payments'
import { Directory, type DirBroker, type DirFacility, type DirView } from './directory'

export const dynamic = 'force-dynamic'

const VIEWS: DirView[] = ['all', 'brokers', 'facilities', 'attention']

/**
 * «Брокеры и склады» — один раздел (переделан по макету, согласованному 16.09.2026):
 * общий поиск, короткие списки, по нажатию — карточка брокера (/brokers/<ключ>) или
 * склада (/facilities/<ключ>). В строке одно главное: как платит брокер или сколько
 * стоим на складе. Всё остальное — в карточке.
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
      sinceDays: b.lastLoad ? Math.max(0, Math.round((Date.parse(todayEt()) - Date.parse(b.lastLoad)) / 86400000)) : null,
      inactive,
      checked: b.checkedAt ? usDate(b.checkedAt) : null,
      // Поля через «|»: цифры телефона и MC ищутся каждое отдельно, а не слитно.
      search: [b.name, b.registryName, b.mc, b.phone, b.email, ...b.reps.flatMap((r) => [r.name, r.email, r.phone])]
        .filter(Boolean)
        .join(' | '),
      attention: inactive || (b.owed > 0 && oldest > 30) || b.payGrade === 'slow',
    }
  })

  const dirFacilities: DirFacility[] = [...facilityIndex(loads, events, terms.free).values()]
    .sort((a, b) => b.visits - a.visits || (b.lastDate ?? '').localeCompare(a.lastDate ?? ''))
    .map((f) => {
      const dwell = avgDwell(f)
      return {
        key: f.key,
        name: f.name ?? f.address ?? f.city ?? '—',
        place: f.name ? (f.city ?? f.address) : null,
        visits: f.visits,
        dwell,
        search: [f.name, f.address, f.city].filter(Boolean).join(' | '),
        // Стоим дольше бесплатного времени — там трак теряет день, это надо видеть заранее.
        attention: f.detentions >= 2 || (dwell != null && dwell >= terms.free * 60 && f.visits >= 2),
      }
    })

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-xl font-bold tracking-tight">{t(locale, 'nav.brokers')}</h1>
      <p className="mb-4 text-[13px] text-white/65">{t(locale, 'brokers.dir.subtitle')}</p>
      <Directory
        brokers={dirBrokers}
        facilities={dirFacilities}
        initialQuery={q}
        initialView={VIEWS.includes(view as DirView) ? (view as DirView) : 'all'}
      />
    </main>
  )
}
