import { listTrucks } from '@/lib/loads'
import { NewLoadClient } from '@/components/new-load-client'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>
}) {
  const trucks = await listTrucks()
  const truckParam = Number((await searchParams).truck)
  const defaultTruckId = trucks.some((t) => t.id === truckParam) ? truckParam : undefined
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="mb-1 text-[17px] font-semibold">Новый груз</h1>
      <p className="mb-6 text-[13px] text-white/65">
        Отсканируй rate con — поля заполнятся сами. Или выбери трак и введи вручную.
      </p>
      <NewLoadClient trucks={trucks} defaultTruckId={defaultTruckId} />
    </main>
  )
}
