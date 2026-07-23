import { listTrucks } from '@/lib/loads'
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
  const trucks = await listTrucks(await companyScope())
  const truckParam = Number((await searchParams).truck)
  const defaultTruckId = trucks.some((t) => t.id === truckParam) ? truckParam : undefined
  const locale = await getLocale()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <h1 className="mb-1 mt-3 text-xl font-bold tracking-tight">{t(locale, 'loads.new.title')}</h1>
      <p className="mb-6 text-[13px] text-white/65">{t(locale, 'loads.new.subtitle')}</p>
      <NewLoadClient trucks={trucks} defaultTruckId={defaultTruckId} />
    </main>
  )
}
