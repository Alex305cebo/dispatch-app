import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { truckByDriverToken } from '@/lib/driver-link'
import { listDocs, listLoads } from '@/lib/loads'
import { listLoadEvents } from '@/lib/load-events'
import { currentLoadsByTruck } from '@/lib/map'
import { getCompany } from '@/lib/invoice'
import { setSetting } from '@/lib/settings'
import { resolveLocale, t } from '@/lib/i18n'
import { DriverClient, LangSwitch } from './driver-client'

// Страница водителя — без логина и без приложения. Открывается по ссылке из карточки
// трака (lib/driver-link.ts). Видно только своё: текущий груз, адреса, телефон
// брокера; можно отметить шаги рейса, написать диспетчеру и подшить фото. Ставки и
// другие траки не видны. Публичный адрес — см. middleware.ts, /d/ в списке без сессии.
// Язык — по умолчанию английский (ссылку шлют водителям с любым родным языком, а
// английский понимают все), переключатель внизу запоминается своей cookie.
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const truck = await truckByDriverToken(token)
  if (!truck) notFound()
  const jar = await cookies()
  const locale = resolveLocale(jar.get('driver_locale')?.value ?? 'en')
  const [loads, company] = await Promise.all([listLoads(truck.companyId, { truckId: truck.id }), getCompany()])
  const load = currentLoadsByTruck(loads).get(truck.id) ?? null
  const [docs, events] = await Promise.all([
    load ? listDocs(truck.companyId, { loadId: load.id }) : Promise.resolve([]),
    load ? listLoadEvents(truck.companyId, load.id) : Promise.resolve([]),
  ])
  const has = (k: string) => docs.some((d) => d.kind === k)
  // «Водитель открывал страницу N мин назад» — диспетчеру видно, что ссылка живая.
  // Ошибка записи страницу не роняет.
  setSetting(`driver_seen:${truck.id}`, new Date().toISOString()).catch(() => {})

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
          events={events.map((e) => ({ id: e.id, kind: e.kind, note: e.note, at: e.at }))}
          dispatcherPhone={company.phone}
        />
      ) : (
        <>
          <section className="panel mt-4 p-5">
            <p className="text-[15px] font-medium">{t(locale, 'driver.noLoad')}</p>
            <p className="mt-1 text-[13px] text-white/60">{t(locale, 'driver.noLoadHint')}</p>
            {company.phone && (
              <a href={`tel:${company.phone}`} className="mt-3 inline-block rounded-xl border border-white/15 px-4 py-2 text-[14px] font-semibold">
                📞 {t(locale, 'driver.callDispatch')}
              </a>
            )}
          </section>
          <DriverClient token={token} locale={locale} load={null} events={[]} dispatcherPhone={company.phone} />
        </>
      )}
      <LangSwitch locale={locale} />
    </main>
  )
}
