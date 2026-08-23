import { listTrucks } from '@/lib/loads'
import { fleetStatusByUnit } from '@/lib/maintenance'
import { cityOf } from '@/lib/maintenance-core'
import { NewLoadClient } from '@/components/new-load-client'
import { BackButton } from '@/components/back-button'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>
}) {
  const [trucks, fleet] = await Promise.all([listTrucks(await companyScope()), fleetStatusByUnit()])
  // Где каждый трак стоит сейчас — в подпись варианта в списке выбора.
  const placeByTruck: Record<number, string> = {}
  for (const tr of trucks) {
    const city = tr.number ? cityOf(fleet.get(tr.number)?.location) : null
    if (city) placeByTruck[tr.id] = city
  }
  const truckParam = Number((await searchParams).truck)
  const defaultTruckId = trucks.some((t) => t.id === truckParam) ? truckParam : undefined
  const locale = await getLocale()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <h1 className="mb-1 mt-3 text-xl font-bold tracking-tight">{t(locale, 'loads.new.title')}</h1>
      <p className="mb-6 text-[13px] text-white/65">{t(locale, 'loads.new.subtitle')}</p>
      <NewLoadClient trucks={trucks} placeByTruck={placeByTruck} defaultTruckId={defaultTruckId} />
    </main>
  )
}
