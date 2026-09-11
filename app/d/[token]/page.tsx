import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { truckByDriverToken } from '@/lib/driver-link'
import { listDocs, listLoads } from '@/lib/loads'
import { listLoadEvents } from '@/lib/load-events'
import { activeLoadsByTruck, nextLoadsByTruck } from '@/lib/map'
import { mergeStops } from '@/lib/stops'
import { getCompany } from '@/lib/invoice'
import { setSetting } from '@/lib/settings'
import { resolveLocale, t } from '@/lib/i18n'
import { usDate } from '@/lib/fmt'
import { DriverClient, LangSwitch, type DriverLoad } from './driver-client'

// Страница водителя — без логина и без приложения. Открывается по ссылке из карточки
// трака (lib/driver-link.ts). Видно только своё: текущий груз (и партиалы, если два
// груза едут в одном трейлере), остановки по порядку, телефон брокера; можно
// отметить шаги рейса, написать диспетчеру и подшить фото. Ставки и другие траки не
// видны. Публичный адрес — см. middleware.ts, /d/ в списке без сессии.
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
  // Текущий груз и партиалы — одной лентой остановок (lib/stops.ts mergeStops).
  const active = activeLoadsByTruck(loads).get(truck.id) ?? []
  const load = active[0] ?? null
  const next = nextLoadsByTruck(loads).get(truck.id) ?? null
  const [docs, eventsPer] = await Promise.all([
    load ? listDocs(truck.companyId, { loadId: load.id }) : Promise.resolve([]),
    Promise.all(active.map((l) => listLoadEvents(truck.companyId, l.id))),
  ])
  const events = eventsPer.flatMap((evs, i) =>
    evs.map((e) => ({ id: e.id, kind: e.kind, note: e.note, at: e.at, stopSeq: e.stopSeq, loadId: active[i]!.id })),
  )
  const has = (k: string) => docs.some((d) => d.kind === k)
  const summary = (l: (typeof active)[number]): DriverLoad => ({
    id: l.id,
    status: l.status,
    origin: l.origin,
    destination: l.destination,
    brokerName: l.brokerName,
    brokerPhone: l.brokerPhone,
    referenceId: l.referenceId,
    hasBol: l.id === load?.id && has('bol'),
    hasPod: l.id === load?.id && has('pod'),
    photos: l.id === load?.id ? docs.filter((d) => d.kind === 'photo').length : 0,
  })
  // «Водитель открывал страницу N мин назад» — диспетчеру видно, что ссылка живая.
  // Ошибка записи страницу не роняет.
  setSetting(`driver_seen:${truck.id}`, new Date().toISOString()).catch(() => {})

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <p className="text-xs text-white/60 font-medium">{company.name || 'TMS'}</p>
      <h1 className="mt-1 text-[22px] font-bold">
        {truck.driverName || t(locale, 'driver.noName')} · {truck.number ?? truck.id}
      </h1>

      {load ? (
        <DriverClient
          token={token}
          locale={locale}
          load={summary(load)}
          loads={active.map(summary)}
          stops={mergeStops(active)}
          events={events}
          dispatcherPhone={company.phone}
        />
      ) : (
        <>
          <section className="panel mt-4 p-5">
            <p className="text-[15px] font-medium">{t(locale, 'driver.noLoad')}</p>
            <p className="mt-1 text-[13px] text-white/60">{t(locale, 'driver.noLoadHint')}</p>
            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                className="mt-3 inline-block rounded-xl border border-white/15 px-4 py-2 text-[14px] font-semibold"
              >
                📞 {t(locale, 'driver.callDispatch')}
              </a>
            )}
          </section>
          <DriverClient
            token={token}
            locale={locale}
            load={null}
            loads={[]}
            stops={[]}
            events={[]}
            dispatcherPhone={company.phone}
          />
        </>
      )}
      {next && (
        <section className="panel mt-4 p-4">
          <p className="text-[13px] font-semibold text-white/75">
            {t(locale, 'driver.nextLoad')}
          </p>
          <p className="mt-1 text-[15px] font-semibold">
            {next.origin ?? '—'} → {next.destination ?? '—'}
          </p>
          <p className="nums mt-0.5 text-[13px] text-white/70">
            {next.pickupTime || usDate(next.pickupDate)}
            {next.pickupAddress ? ` · ${next.pickupAddress}` : ''}
          </p>
        </section>
      )}
      <LangSwitch locale={locale} />
    </main>
  )
}
