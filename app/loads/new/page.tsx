import { getLoad, listTrucks } from '@/lib/loads'
import { fleetStatusByUnit } from '@/lib/maintenance'
import { cityOf } from '@/lib/maintenance-core'
import { NewLoadClient } from '@/components/new-load-client'
import { BackButton } from '@/components/back-button'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { EMPTY, type QrLoad } from '@/lib/qr-load'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string; repeat?: string }>
}) {
  const [trucks, fleet] = await Promise.all([listTrucks(await companyScope()), fleetStatusByUnit()])
  // Где каждый трак стоит сейчас — в подпись варианта в списке выбора.
  const placeByTruck: Record<number, string> = {}
  for (const tr of trucks) {
    const city = tr.number ? cityOf(fleet.get(tr.number)?.location) : null
    if (city) placeByTruck[tr.id] = city
  }
  const params = await searchParams

  // «Повторить груз»: тот же брокер и то же направление, новые даты. Регулярный рейс
  // у диспетчера — норма, а заводился он каждый раз с нуля, включая перепечатывание
  // почты брокера и миль. Копируем всё, кроме дат, номера груза и заметок: даты и
  // номер у нового рейса свои, а заметки были про тот, прошлый.
  const src = Number(params.repeat) ? await getLoad(await companyScope(), Number(params.repeat)) : null
  const repeat: QrLoad | undefined = src
    ? {
        ...EMPTY,
        rate: src.rate,
        loadedMiles: src.loadedMiles,
        deadheadMiles: src.deadheadMiles,
        transitDays: src.transitDays,
        origin: src.origin,
        destination: src.destination,
        spotRpm: src.spotRpm,
        brokerName: src.brokerName,
        brokerMc: src.brokerMc,
        brokerEmail: src.brokerEmail,
        payVia: src.payVia,
        brokerPhone: src.brokerPhone,
        pickupAddress: src.pickupAddress,
        deliveryAddress: src.deliveryAddress,
      }
    : undefined

  const truckParam = Number(params.truck)
  const defaultTruckId =
    trucks.some((t) => t.id === truckParam) ? truckParam : (src?.truckId ?? undefined)
  const locale = await getLocale()
  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <h1 className="mb-1 mt-3 text-xl font-bold tracking-tight">
        {t(locale, repeat ? 'loads.new.repeatTitle' : 'loads.new.title')}
      </h1>
      <p className="mb-6 text-[13px] text-white/65">
        {repeat
          ? t(locale, 'loads.new.repeatSubtitle').replace('{broker}', src?.brokerName ?? '—')
          : t(locale, 'loads.new.subtitle')}
      </p>
      <NewLoadClient
        trucks={trucks}
        placeByTruck={placeByTruck}
        defaultTruckId={defaultTruckId}
        repeat={repeat}
      />
    </main>
  )
}
