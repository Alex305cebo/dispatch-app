import { notFound } from 'next/navigation'
import { truckByDriverToken } from '@/lib/driver-link'
import { listDocs, listLoads } from '@/lib/loads'
import { currentLoadsByTruck } from '@/lib/map'
import { getCompany } from '@/lib/invoice'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { DriverClient, LangSwitch } from './driver-client'

// Страница водителя — без логина и без приложения. Открывается по ссылке из карточки
// трака (lib/driver-link.ts). Видно только своё: текущий груз, адреса, телефон
// брокера; можно сменить статус и подшить фото. Ставки и другие траки не видны.
// Публичный адрес — см. middleware.ts, /d/ в списке без сессии.
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const truck = await truckByDriverToken(token)
  if (!truck) notFound()
  const locale = await getLocale()
  const [loads, company] = await Promise.all([listLoads(truck.companyId, { truckId: truck.id }), getCompany()])
  const load = currentLoadsByTruck(loads).get(truck.id) ?? null
  const docs = load ? await listDocs(truck.companyId, { loadId: load.id }) : []
  const has = (k: string) => docs.some((d) => d.kind === k)

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <p className="text-[12px] uppercase tracking-wider text-white/50">{company.name || 'TMS'}</p>
      <h1 className="mt-1 text-[22px] font-bold">
        {truck.driverName || t(locale, 'driver.noName')} · {truck.number ?? truck.id}
      </h1>

      {load ? (
        <DriverClient
          token={token}
          locale={locale}
          load={{
            id: load.id,
            status: load.status,
            origin: load.origin,
            destination: load.destination,
            pickupAddress: load.pickupAddress,
            deliveryAddress: load.deliveryAddress,
            pickupDate: load.pickupDate,
            deliveryDate: load.deliveryDate,
            pickupTime: load.pickupTime,
            deliveryTime: load.deliveryTime,
            brokerName: load.brokerName,
            brokerPhone: load.brokerPhone,
            referenceId: load.referenceId,
            hasBol: has('bol'),
            hasPod: has('pod'),
            photos: docs.filter((d) => d.kind === 'photo').length,
          }}
          dispatcherPhone={company.phone}
        />
      ) : (
        <section className="panel mt-4 p-5">
          <p className="text-[15px] font-medium">{t(locale, 'driver.noLoad')}</p>
          <p className="mt-1 text-[13px] text-white/60">{t(locale, 'driver.noLoadHint')}</p>
          {company.phone && (
            <a href={`tel:${company.phone}`} className="mt-3 inline-block rounded-xl border border-white/15 px-4 py-2 text-[14px] font-semibold">
              📞 {t(locale, 'driver.callDispatch')}
            </a>
          )}
        </section>
      )}
      <LangSwitch locale={locale} />
    </main>
  )
}
