import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getLoad, laneAvgRpmFor, listDocs, truckForLoad } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { getCompany } from '@/lib/invoice'
import { fleetStatusByUnit, getTruckMeta } from '@/lib/maintenance'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { driveTime } from '@/lib/fmt'
import { loadMapData } from '@/lib/load-map'
import { FleetMap } from '@/components/fleet-map'
import { LocalTime } from '@/components/local-time'
import { zoneFor } from '@/lib/tz'
import { SmallRefreshButton } from '@/components/small-refresh-button'
import { Analysis } from '@/components/analysis'
import { LoadEditNumbers } from '@/components/load-edit-numbers'
import { BrokerNotes } from '@/components/broker-notes'
import { TruckForm } from '@/components/truck-form'
import { DocList, DocUpload } from '@/components/docs'
import { InvoiceBox } from '@/components/invoice-actions'
import { RateConButton } from '@/components/ratecon-button'
import { DocButton } from '@/components/doc-button'
import { MissingDocsBanner } from '@/components/missing-docs-banner'
import { BackButton } from '@/components/back-button'
import { DriverInfoCard } from '@/components/driver-info-card'
import { Info } from '@/components/info'
import { StatusPicker } from './status-picker'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const companyId = await companyScope()
  const locale = await getLocale()
  const load = await getLoad(companyId, Number(id))
  if (!load) notFound()
  // The load's OWN truck — money is computed with the economics of the truck that
  // hauls it, not some global default.
  // Four independent reads, in parallel. They used to be four separate awaits in a row,
  // and only the first actually depends on `load` — the other three were simply queued
  // behind each other, in front of loadMapData()'s external routing call at the end.
  const [truck, docs, company, fleet] = await Promise.all([
    truckForLoad(companyId, load),
    listDocs(companyId, { loadId: load.id }),
    getCompany(),
    fleetStatusByUnit(),
  ])
  // Прицеп для кнопки трака + наш средний $/милю по этому направлению. Оба нужны
  // только для показа, поэтому идут вторым параллельным заходом, уже зная truck.id.
  const [truckMeta, laneAvgRpm] = await Promise.all([
    getTruckMeta(truck.id),
    laneAvgRpmFor(companyId, load.origin, load.destination, load.id),
  ])

  // Never throws: the DB CHECKs mirror calcLoad's throw conditions, so every stored
  // row is a valid input by construction.
  const r = calcLoad(load, truck)
  const invoiceDoc = docs.find((d) => d.kind === 'invoice')
  const rateConDoc = docs.find((d) => d.kind === 'ratecon')
  const bolDoc = docs.find((d) => d.kind === 'bol')
  const podDoc = docs.find((d) => d.kind === 'pod')
  const fs = truck.number ? fleet.get(truck.number) : undefined

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />

      {/* ===== HERO: route, truck, status and the rate — one card, not four loose pieces ===== */}
      <section className="relative mt-3 overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-ink-800/80 to-ink-950 p-5 sm:p-8">
        <h1 className="text-[22px] font-semibold sm:text-[26px]">
          {load.origin ?? '—'} → {load.destination ?? '—'}
        </h1>
        <p className="mt-1.5 text-[13px] text-white/65">
          {/* Откуда взялся груз. Раньше здесь стояло «Пришёл с DAT по QR» у ЛЮБОГО
              груза, заведённого не руками, — в том числе у приехавших рейт-коном в
              Telegram, которые доски DAT в глаза не видели. Смотрим не на пометку в
              базе, а на то, что есть на самом деле: если к рейсу приложен рейт-кон,
              из него он и заведён. */}
          {rateConDoc
            ? t(locale, 'loadDetail.sourceRc')
            : load.source === 'qr'
              ? t(locale, 'loadDetail.sourceQr')
              : t(locale, 'loadDetail.sourceManual')}
          {/* Это номер груза, который дал брокер, а не «reference» из бумаги: под ним
              груз ищут, называют по телефону и пишут в счёте. */}
          {load.referenceId && ` · ${t(locale, 'import.label.referenceId')} ${load.referenceId}`}
        </p>
        {/* Обратный переход на трак был номером в 13px внутри служебной строки — его
            не находили. Теперь такая же кнопка, как маршрут на странице трака. */}
        <Link
          href={`/trucks/${truck.id}`}
          /* max-w-full + flex-wrap: inline-flex по умолчанию не переносится, и на
             узком телефоне «Edwin M. TRK-2237 TRL-1847» вылезал бы за край экрана
             вместе с кнопкой. */
          className="group mt-2.5 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl border border-haul-500/35 bg-haul-500/[0.10] px-3 py-1.5 transition-colors hover:border-haul-400/60 hover:bg-haul-500/20"
        >
          <span aria-hidden className="text-[14px] leading-none">🚛</span>
          {/* Водитель, трак и прицеп собраны в truckLabel — ровно та же подпись, что
              на обзоре и в списке траков. Раньше здесь лежали три отдельных куска в
              своём порядке, и один и тот же трак читался не так, как на других
              страницах. */}
          <span className="min-w-0 break-words text-[14px] font-semibold leading-snug sm:text-[15px]">
            {truckLabel(truck, truckMeta?.trailerNumber)}
          </span>
          <span className="text-[14px] text-haul-300 transition-transform group-hover:translate-x-0.5">↗</span>
        </Link>

        {/* The rail needs the full width to lay five labelled steps out; sharing a flex
            row with the rate-con control squeezed it to ~160px and clipped every label
            to "Оплач…". Rate con moves onto its own line underneath. */}
        <div className="mt-5">
          <StatusPicker
            id={load.id}
            current={load.status}
            bolId={bolDoc?.id ?? null}
            podId={podDoc?.id ?? null}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {rateConDoc ? (
            <RateConButton docId={rateConDoc.id} />
          ) : (
            <span className="text-xs text-white/45">{t(locale, 'loadDetail.noRateCon')}</span>
          )}
          {/* Тот же брокер, то же направление, новые даты. Регулярный рейс заводился
              заново каждую неделю — вместе с перепечатыванием почты брокера и миль. */}
          <Link
            href={`/loads/new?repeat=${load.id}`}
            className="ml-auto rounded-xl border border-white/12 px-3 py-1.5 text-[12.5px] font-medium text-white/70 transition-colors hover:border-haul-500/50 hover:text-haul-300"
          >
            ⟳ {t(locale, 'loads.repeat')}
          </Link>
        </div>

        {/* BOL and POD are one pair — the two halves of a load's paperwork. Sharing the
            row above, the rate-con sentence ate the full width on a phone and pushed
            each button onto a line of its own, so they read as unrelated and wasted two
            rows. Their own 2-up grid keeps them together and equal-width on a phone,
            and they fall back to sitting inline once there is room. */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <DocButton label="BOL" kind="bol" docId={bolDoc?.id ?? null} loadId={load.id} />
          <DocButton label="POD" kind="pod" docId={podDoc?.id ?? null} loadId={load.id} />
        </div>

        <div className="mt-5 border-t border-white/8 pt-5">
          <h2 className="mb-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'loadDetail.rateHeading')}
            <Info text={t(locale, 'loadDetail.rateInfo')} />
          </h2>
          <Analysis r={r} mpg={truck.mpg} spotRpm={load.spotRpm} />
        </div>
      </section>

      {/* Карта грузится отдельно от страницы. Её сборка ждёт чужой маршрутизатор и
          геокодер: раньше эти секунды держали ВЕСЬ документ, и груз не показывался,
          пока не ответит бесплатный OSRM. Теперь цифры, документы и расчёт приходят
          сразу, а карта втекает следом в свою границу. */}
      <Suspense fallback={<MapSkeleton />}>
        <LoadMapSection load={load} truck={truck} fs={fs} locale={locale} />
      </Suspense>

      <MissingDocsBanner
        loadId={load.id}
        status={load.status}
        bolId={bolDoc?.id ?? null}
        podId={podDoc?.id ?? null}
        locale={locale}
      />

      {/* Broker's must-read instructions — below the map, above the load's own
          details, expanded by default while unread so it can't be missed. */}
      <div className="mt-4">
        <BrokerNotes
          loadId={load.id}
          notes={load.brokerNotes}
          readAt={load.notesReadAt}
          hasRc={!!rateConDoc}
        />
      </div>

      <section className="panel mt-4 p-5">
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'loadDetail.detailsHeading')}
        </h2>
        <LoadEditNumbers
          load={{
            id: load.id,
            rate: load.rate,
            loadedMiles: load.loadedMiles,
            deadheadMiles: load.deadheadMiles,
            transitDays: load.transitDays,
            spotRpm: load.spotRpm,
            brokerName: load.brokerName,
            brokerMc: load.brokerMc,
            brokerPhone: load.brokerPhone,
            brokerEmail: load.brokerEmail,
            truckLocation: load.truckLocation,
            pickupDate: load.pickupDate,
            deliveryDate: load.deliveryDate,
            pickupTime: load.pickupTime,
            deliveryTime: load.deliveryTime,
            laneAvgRpm,
          }}
        />
      </section>

      {/* Copyable "send to driver" text, saved when the rate con was read — hidden
          by default, since it's only needed occasionally (resend, new driver). */}
      {load.driverInfo && <DriverInfoCard text={load.driverInfo} />}

      {/* The truck economics that drive every cost line above — editable inline. */}
      <details className="group mt-4">
        <summary className="panel flex cursor-pointer list-none items-center gap-1.5 p-4 text-[13px] font-semibold text-white/72 transition-colors hover:text-white">
          <span className="text-white/40 transition-transform group-open:rotate-90">▸</span>
          {t(locale, 'loadDetail.truckCostsHeading')}
          <Info text={t(locale, 'loadDetail.truckCostsInfo')} />
        </summary>
        <div className="mt-2">
          <TruckForm
            id={truck.id}
            initial={{
              number: truck.number ?? '',
              driverName: truck.driverName ?? '',
              mpg: truck.mpg,
              fuelPricePerGallon: truck.fuelPricePerGallon,
              driverPay: truck.driverPay,
              truckPaymentPerDay: truck.truckPaymentPerDay,
              insurancePerDay: truck.insurancePerDay,
              eldPermitsPerDay: truck.eldPermitsPerDay,
              maintenanceCostPerMile: truck.maintenanceCostPerMile,
              factoringPercent: truck.factoringPercent,
              dispatchPercent: truck.dispatchPercent,
            }}
          />
        </div>
      </details>

      <section className="panel mt-4 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'loadDetail.invoiceHeading')}
            <Info text={t(locale, 'loadDetail.invoiceInfo')} />
          </h2>
          {load.paidAt && (
            <span className="rounded-full bg-good-500/15 px-2 py-0.5 text-[11px] font-medium text-good-400">
              {t(locale, 'loadDetail.paidOn').replace('{date}', load.paidAt.slice(0, 10))}
            </span>
          )}
        </div>
        <InvoiceBox
          loadId={load.id}
          invoiceNumber={load.invoiceNumber}
          invoiceDocId={invoiceDoc?.id ?? null}
          paid={!!load.paidAt}
          companyReady={!!(company.name && company.mcdot)}
        />
        <p className="mt-2 text-[12px] text-white/50">{t(locale, 'loadDetail.invoicePackageNote')}</p>
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'loadDetail.docsHeading')}
          <Info text={t(locale, 'loadDetail.docsInfo')} />
        </h2>
        <DocUpload loadId={load.id} />
        <DocList docs={docs} />
      </section>
    </main>
  )
}

/** Заглушка на время сборки карты: та же высота, что у настоящей секции, чтобы
 * страница не прыгала, когда карта приедет. */
function MapSkeleton() {
  return <div className="panel mt-4 h-[clamp(360px,48vh,600px)] animate-pulse" />
}

/**
 * Карта груза: живой GPS трака, погрузка, выгрузка и дорога между ними.
 *
 * Отдельным серверным куском под Suspense — потому что здесь и только здесь
 * страница ждёт чужие службы: геокодер на адреса и маршрутизатор на дорогу.
 */
async function LoadMapSection({
  load,
  truck,
  fs,
  locale,
}: {
  load: Awaited<ReturnType<typeof getLoad>>
  truck: Parameters<typeof loadMapData>[1]
  fs: Parameters<typeof loadMapData>[2]
  locale: Awaited<ReturnType<typeof getLocale>>
}) {
  if (!load) return null
  const { markers: mapMarkers, routes: mapRoutes, miles: routeMiles, etaMin } = await loadMapData(
    load,
    truck,
    fs,
    locale,
  )
  if (mapMarkers.length === 0) return null
  // Часовой пояс ТАМ, ГДЕ ТРАК СЕЙЧАС, — офлайн по координатам GPS (lib/tz.ts).
  // Диспетчер и водитель почти никогда не в одном поясе, а окна погрузки и звонки
  // живут по времени водителя.
  const driverZone = zoneFor(fs?.lat, fs?.lng)

  return (
        <section className="panel mt-4 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {t(locale, 'loadDetail.mapHeading')}
            <Info text={t(locale, 'loadDetail.mapInfo')} />
            <span className="ml-auto">
              <SmallRefreshButton />
            </span>
          </h2>
          {/* Три отдельные плитки, а не одна строка «82 mi · ~1ч 34м»: время у
              водителя, расстояние и срок — разные вопросы, и слитые в строку они
              читаются как одно число. Плитки переносятся, а не сжимаются: на узком
              экране лучше два ряда, чем обрезанное время. */}
          {(driverZone || routeMiles != null || etaMin != null) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {driverZone && (
                <div className="flex-1 basis-[7.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/45">
                    {t(locale, 'loadDetail.driverTime')}
                  </div>
                  {/* Высота зафиксирована: первый кадр LocalTime пустой (гидратация),
                      и без неё плитка подпрыгивала бы при загрузке страницы. */}
                  <div className="flex min-h-[1.375rem] items-baseline">
                    <LocalTime zone={driverZone} className="nums text-[15px] font-semibold text-white/85" />
                  </div>
                </div>
              )}
              {routeMiles != null && (
                <div className="flex-1 basis-[7.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/45">
                    {t(locale, 'loadDetail.distanceLeft')}
                  </div>
                  <div className="nums min-h-[1.375rem] text-[15px] font-semibold text-white/85">
                    {routeMiles} <span className="text-[11px] font-medium text-white/45">mi</span>
                  </div>
                </div>
              )}
              {etaMin != null && (
                <div className="flex-1 basis-[7.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/45">
                    {t(locale, 'loadDetail.etaLeft')}
                  </div>
                  <div className="nums min-h-[1.375rem] text-[15px] font-semibold text-white/85">
                    ~{driveTime(etaMin, locale)}
                  </div>
                </div>
              )}
            </div>
          )}
          <FleetMap markers={mapMarkers} routes={mapRoutes} height="clamp(300px, 42vh, 540px)" distanceMi={routeMiles} />
        </section>
  )
}
