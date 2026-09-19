import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { truckByDriverToken } from '@/lib/driver-link'
import { listDocs, listLoads } from '@/lib/loads'
import { listLoadEvents } from '@/lib/load-events'
import { activeLoadsByTruck, nextLoadsByTruck } from '@/lib/map'
import { mergeStops, parseTaskOrder, taskOrderKey } from '@/lib/stops'
import { getCompany } from '@/lib/invoice'
import { getSetting, getSettings, setSetting } from '@/lib/settings'
import { allStopEvents } from '@/lib/load-events'
import { facilityIndex, facilityKey, facilityNoteKey } from '@/lib/facilities'
import { resolveLocale, t } from '@/lib/i18n'
import { loadWeekAnchorMs, usd, usDate, weekBounds } from '@/lib/fmt'
import { getTruckMeta } from '@/lib/maintenance'
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
  const [loads, company, meta] = await Promise.all([listLoads(truck.companyId, { truckId: truck.id }), getCompany(), getTruckMeta(truck.id)])
  // «Как заехать» с прошлого раза и заметка о складе — водителю, если у этого груза
  // своих указаний нет (lib/facilities.ts). Считается по всем грузам компании.
  const inheritDirections = async <T extends { address: string | null; name: string | null; city: string | null; directions?: string | null }>(stops: T[]): Promise<T[]> => {
    if (!stops.some((s) => !s.directions)) return stops
    const [all, events] = await Promise.all([listLoads(truck.companyId), allStopEvents(truck.companyId)])
    const index = facilityIndex(all, events)
    const keys = stops.map((s) => facilityKey(s)).filter((k): k is string => !!k)
    const notes = await getSettings(keys.map(facilityNoteKey))
    return stops.map((s) => {
      if (s.directions) return s
      const key = facilityKey(s)
      const f = key ? index.get(key) : undefined
      const text = [f?.directions, key ? notes.get(facilityNoteKey(key)) : null].filter(Boolean).join(' · ')
      return text ? { ...s, directions: text } : s
    })
  }
  // Цель недели водителя (профиль в паспорте трака): мили или деньги по грузам этой недели.
  const { start: weekBegin, end: weekEnd } = weekBounds()
  const weekLoads = loads.filter((l) => {
    if (l.status === 'quoted' || l.status === 'cancelled') return false
    const ms = loadWeekAnchorMs(l.pickupDate, l.createdAt)
    return ms >= weekBegin && ms < weekEnd
  })
  const weekMiles = weekLoads.reduce((s, l) => s + l.loadedMiles + l.deadheadMiles, 0)
  const weekGross = weekLoads.reduce((s, l) => s + l.rate, 0)
  const target =
    meta?.weekTargetMiles
      ? { done: Math.round(weekMiles), goal: meta.weekTargetMiles, text: `${Math.round(weekMiles).toLocaleString('en-US')} / ${meta.weekTargetMiles.toLocaleString('en-US')} mi` }
      : meta?.weekTargetGross
        ? { done: weekGross, goal: meta.weekTargetGross, text: `${usd.format(weekGross)} / ${usd.format(meta.weekTargetGross)}` }
        : null
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
    hasSeal: l.id === load?.id && has('seal'),
    hasPod: l.id === load?.id && has('pod'),
    photos: l.id === load?.id ? docs.filter((d) => d.kind === 'photo').length : 0,
  })
  // «Водитель открывал страницу N мин назад» — диспетчеру видно, что ссылка живая.
  // Ошибка записи страницу не роняет.
  setSetting(`driver_seen:${truck.id}`, new Date().toISOString()).catch(() => {})

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <p className="text-xs text-t2 font-medium">{company.name || 'TMS'}</p>
      <h1 className="mt-1 text-[22px] font-bold">
        {truck.driverName || t(locale, 'driver.noName')} · {truck.number ?? truck.id}
      </h1>
      {target && (
        <section className="panel mt-3 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className="text-t2">{t(locale, 'driver.weekTarget')}</span>
            <span className={`nums font-semibold ${target.done >= target.goal ? 'text-good-400' : 'text-t1'}`}>{target.text}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className={`h-full rounded-full ${target.done >= target.goal ? 'bg-good-500' : 'bg-haul-500'}`}
              style={{ width: `${Math.min(100, Math.round((target.done / target.goal) * 100))}%` }}
            />
          </div>
        </section>
      )}

      {load ? (
        <DriverClient
          token={token}
          locale={locale}
          load={summary(load)}
          loads={active.map(summary)}
          stops={await inheritDirections(mergeStops(active, parseTaskOrder(await getSetting(taskOrderKey(truck.id)))))}
          events={events}
          dispatcherPhone={company.phone}
        />
      ) : (
        <>
          <section className="panel mt-4 p-5">
            <p className="text-lg font-medium">{t(locale, 'driver.noLoad')}</p>
            <p className="mt-1 text-base text-t2">{t(locale, 'driver.noLoadHint')}</p>
            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                className="mt-3 inline-block rounded-xl border border-white/15 px-4 py-2 text-md font-semibold"
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
          <p className="text-base font-semibold text-t2">
            {t(locale, 'driver.nextLoad')}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {next.origin ?? '—'} → {next.destination ?? '—'}
          </p>
          <p className="nums mt-0.5 text-base text-t2">
            {next.pickupTime || usDate(next.pickupDate)}
            {next.pickupAddress ? ` · ${next.pickupAddress}` : ''}
          </p>
        </section>
      )}
      <LangSwitch locale={locale} />
    </main>
  )
}
