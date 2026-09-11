import Link from 'next/link'
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { currentLoadForTruck, getLoad, laneAvgRpmFor, listDocs, truckForLoad } from '@/lib/loads'
import { QueuedLoadHint } from '@/components/queued-load-hint'
import { truckLabel, truckShortLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { getCompany } from '@/lib/invoice'
import { fleetStatusByUnit, getTruckMeta } from '@/lib/maintenance'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { driveTime, usd, usDate } from '@/lib/fmt'
import { loadMapData } from '@/lib/load-map'
import { FleetMap } from '@/components/fleet-map'
import { LocalTime } from '@/components/local-time'
import { zoneFor } from '@/lib/tz'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { Analysis } from '@/components/analysis'
import { LoadEditNumbers } from '@/components/load-edit-numbers'
import { BrokerNotes } from '@/components/broker-notes'
import { TruckForm } from '@/components/truck-form'
import { DocList, DocUpload } from '@/components/docs'
import { InvoiceBox } from '@/components/invoice-actions'
import { RateConButton } from '@/components/ratecon-button'
import { DocButton } from '@/components/doc-button'
import { BackButton } from '@/components/back-button'
import { PairBar } from '@/components/pair-bar'
import { DetentionTile } from '@/components/detention-tile'
import { detentionTerms, getSetting } from '@/lib/settings'
import { headers } from 'next/headers'
import { DriverLinkButton } from '@/components/driver-link-button'
import { stopWindows } from '@/lib/detention'
import { BackhaulList } from '@/components/backhaul-list'
import { backhaulBrokers } from '@/lib/backhaul'
import { brokerGradeFor } from '@/lib/brokers'
import { fuelPlan } from '@/lib/fuel-plan'
import { listLoadEvents } from '@/lib/load-events'
import { DriverTimeline } from '@/components/driver-timeline'
import { DriverInfoCard } from '@/components/driver-info-card'
import { withAddresses, stopNames } from '@/lib/driver-info-zip'
import { arrivedAt, isDone, stopsFrom, viaLabel } from '@/lib/stops'
import { Info } from '@/components/info'
import { StatusPicker } from './status-picker'
import { CopyPlace } from '@/components/copy-place'
import { placeCity } from '@/lib/place'

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
  // Обратный груз ищут, пока трак едет: список «кому звонить» нужен только
  // забукированному и едущему грузу, доставленному он ни к чему.
  const wantBackhaul = load.status === 'booked' || load.status === 'in_transit'
  // Страница водителя: адрес и когда он её открывал — как на карточке трака.
  // В демо ссылку не выдаём.
  const driverSeen = await getSetting(`driver_seen:${truck.id}`)
  const driverLink =
    companyId === 'demo'
      ? null
      : await (async () => {
          const { driverTokenFor } = await import('@/lib/driver-link')
          const h = await headers()
          const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
          const proto = h.get('x-forwarded-proto') ?? 'https'
          return host ? `${proto}://${host}/d/${await driverTokenFor(truck.id)}` : null
        })()
  const [truckMeta, laneAvgRpm, backhaul, brokerGrade, driverEvents, truckCurrent] = await Promise.all([
    getTruckMeta(truck.id),
    laneAvgRpmFor(companyId, load.origin, load.destination, load.id),
    wantBackhaul ? backhaulBrokers(companyId, load.destination) : Promise.resolve(null),
    brokerGradeFor(companyId, load.brokerMc, load.brokerEmail, load.brokerName),
    listLoadEvents(companyId, load.id),
    // Этот груз забукирован, а трак ещё везёт другой — подсказка, что делать.
    load.status === 'booked' ? currentLoadForTruck(companyId, truck.id) : Promise.resolve(null),
  ])
  const queuedBehind = truckCurrent && truckCurrent.id !== load.id && !load.partial ? truckCurrent : null

  // Never throws: the DB CHECKs mirror calcLoad's throw conditions, so every stored
  // row is a valid input by construction.
  const r = calcLoad(load, truck)
  // Остановки: JSON у новых грузов, две точки у старых; названия складов у старых —
  // из текста водителю.
  const stopNamesLegacy = stopNames(load.driverInfo)
  const stops = stopsFrom(load, { pickup: stopNamesLegacy.pickup, delivery: stopNamesLegacy.delivery })
  const via = viaLabel(stops, locale)
  // Стоянка у склада по отметкам водителя — над картой, потому что это деньги:
  // от «Приехал» до «Загрузился», дальше счёт замирает. Меньше получаса не показываем.
  // По окну на каждую остановку, где водитель простоял от получаса.
  const windows = load.status === 'cancelled' ? [] : stopWindows(driverEvents, stops).filter((w) => w.min >= 30)
  const stop = windows[windows.length - 1] ?? null
  const terms = windows.length ? await detentionTerms() : null
  const invoiceDoc = docs.find((d) => d.kind === 'invoice')
  const rateConDoc = docs.find((d) => d.kind === 'ratecon')
  const bolDoc = docs.find((d) => d.kind === 'bol')
  // Конечный POD — без номера остановки; POD промежуточных точек живут на рейке.
  const podDoc = docs.find((d) => d.kind === 'pod' && d.stopSeq == null) ?? docs.find((d) => d.kind === 'pod')
  const fs = truck.number ? fleet.get(truck.number) : undefined

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/loads" label={t(locale, 'loads.page.title')} />
      <PairBar
        current="load"
        truck={{
          id: truck.id,
          label: truckLabel(truck, truckMeta?.trailerNumber),
          short: truckShortLabel(truck),
        }}
        load={{
          id: load.id,
          label: `${load.origin ?? '—'} → ${load.destination ?? '—'}`,
        }}
        locale={locale}
      />

      {/* ===== HERO: route, truck, status and the rate — one card, not four loose pieces ===== */}
      <section className="panel mt-3 p-4 sm:p-5">
        <h1 className="text-[22px] font-semibold sm:text-[26px]">
          {load.origin ?? '—'} → {load.destination ?? '—'}
          {via && <span className="ml-2 text-[15px] font-medium text-white/50 sm:text-[17px]">· {via}</span>}
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
        {/* Кнопка на трак живёт в полосе «Трак ⇄ Груз» наверху — второй раз здесь ни к чему. */}

        {/* The rail needs the full width to lay five labelled steps out; sharing a flex
            row with the rate-con control squeezed it to ~160px and clipped every label
            to "Оплач…". Rate con moves onto its own line underneath. */}
        <div className="mt-5">
          <StatusPicker
            id={load.id}
            current={load.status}
            bolId={bolDoc?.id ?? null}
            podId={podDoc?.id ?? null}
            stops={stops.slice(1, -1).map((s) => ({
              key: String(s.seq),
              seq: s.seq,
              role: s.role,
              podId: s.role === 'delivery' ? (docs.find((d) => d.kind === 'pod' && d.stopSeq === s.seq)?.id ?? null) : null,
              label: t(locale, s.role === 'pickup' ? 'stops.pickupStep' : 'stops.deliveryStep'),
              sub: s.city ? s.city.replace(/,.*$/, '') : null,
              done: load.status === 'delivered' || load.status === 'paid' || isDone(s, driverEvents, stops),
              // Трак стоит на точке: «приехал» есть, «уехал» ещё нет.
              arrived: load.status === 'in_transit' && !!arrivedAt(s, driverEvents, stops),
            }))}
          />
        </div>
        {/* Бумаги груза одной сеткой: rate con, BOL, POD — три кнопки одного размера,
            на телефоне 2×2 (четвёртая клетка — «Повторить груз»), на широком экране
            в один ряд. Раньше rate con и «Повторить» стояли своим рядом с разными
            размерами, BOL/POD — другим, и на телефоне это читалось как россыпь. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          {rateConDoc ? (
            <RateConButton docId={rateConDoc.id} />
          ) : (
            <span className="col-span-2 text-xs text-white/45 sm:col-auto">{t(locale, 'loadDetail.noRateCon')}</span>
          )}
          <DocButton label="BOL" kind="bol" docId={bolDoc?.id ?? null} loadId={load.id} />
          <DocButton label="POD" kind="pod" docId={podDoc?.id ?? null} loadId={load.id} />
          {/* Тот же брокер, то же направление, новые даты. Регулярный рейс заводился
              заново каждую неделю — вместе с перепечатыванием почты брокера и миль. */}
          <Link
            href={`/loads/new?repeat=${load.id}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/12 px-3 py-2 text-[12.5px] font-medium text-white/70 transition-colors hover:border-haul-500/50 hover:text-haul-300 sm:ml-auto"
          >
            ⟳ {t(locale, 'loads.repeat')}
          </Link>
        </div>

        <div className="mt-5 border-t border-white/8 pt-5">
          <h2 className="mb-4 flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
            {t(locale, 'loadDetail.rateHeading')}
            <Info text={t(locale, 'loadDetail.rateInfo')} />
          </h2>
          <Analysis r={r} mpg={truck.mpg} spotRpm={load.spotRpm} />
        </div>
      </section>

      {/* Важное от брокера — СРАЗУ под шапкой, над картой: обязательное к прочтению
          не должно уезжать под большой блок, который грузится отдельно. */}
      <div className="mt-4">
        <BrokerNotes loadId={load.id} notes={load.brokerNotes} readAt={load.notesReadAt} hasRc={!!rateConDoc} />
      </div>

      {/* Карта грузится отдельно от страницы. Её сборка ждёт чужой маршрутизатор и
          геокодер: раньше эти секунды держали ВЕСЬ документ, и груз не показывался,
          пока не ответит бесплатный OSRM. Теперь цифры, документы и расчёт приходят
          сразу, а карта втекает следом в свою границу. */}
      {/* Блок «Водитель» — над картой: отметки рейса и стоянка у склада с суммой
          детеншена по ним, одним блоком. Это ответ на «где он и что делает» без
          звонка. Пусто — подсказка, откуда взять ссылку. */}
      {load.status !== 'cancelled' && (
        <DriverTimeline
          events={driverEvents}
          locale={locale}
          truckId={truck.id}
          loadId={load.id}
          stops={stops}
          // Те же кнопки Telegram / SMS / Копировать, что на карточке трака: блок
          // «Водитель» одинаковый на обеих карточках и никуда не уводит.
          link={
            driverLink ? (
              <DriverLinkButton embedded url={driverLink} driverPhone={truckMeta?.driverPhone ?? null} seenAt={driverSeen} />
            ) : undefined
          }
          detention={windows.map((w) => ({
            at: w.at,
            sinceIso: w.sinceIso,
            endIso: w.endIso,
            min: w.min,
            rateHr: terms?.rate ?? 35,
            freeHr: terms?.free ?? 2,
            refId: load.referenceId,
            route: `${load.origin ?? '—'} → ${load.destination ?? '—'}`,
            truck: truckLabel(truck),
          }))}
        />
      )}

      <Suspense fallback={<MapSkeleton />}>
        <LoadMapSection load={load} truck={truck} fs={fs} locale={locale} driverMarked={!!stop} events={driverEvents} />
      </Suspense>

      {queuedBehind && <QueuedLoadHint locale={locale} current={queuedBehind} next={load} />}

      {/* Мили оценены приблизительно: в рейт-коне город с опечаткой, точный адрес не
          нашёлся. Груз создан, но пробег надо вписать руками — иначе $/милю и зарплата
          по нему врут. */}
      {load.milesEstimated && (
        <div className="mt-4 rounded-xl border border-warn-400/35 bg-warn-500/[0.08] px-4 py-3 text-[13px]">
          <span className="font-semibold text-warn-400">{t(locale, 'loadDetail.milesEstimated')}</span>{' '}
          <span className="text-white/75">{t(locale, 'loadDetail.milesEstimatedHint')}</span>
        </div>
      )}

      {/* Медленный плательщик — сказать до того, как груз взят и повезён: по своей
          истории он платит дольше 45 дней или уже просрочивал. */}
      {brokerGrade?.payGrade === 'slow' && load.status !== 'paid' && load.status !== 'cancelled' && (
        <div className="mt-4 rounded-xl border border-bad-500/30 bg-bad-500/[0.08] px-4 py-3 text-[13px]">
          <span className="font-semibold text-bad-400">{t(locale, 'brokers.grade.slowWarn')}</span>{' '}
          <span className="text-white/75">
            {t(locale, 'brokers.grade.info')
              .replace('{n}', String(brokerGrade.paidCount))
              .replace('{late}', String(brokerGrade.lateCount))}
            {brokerGrade.payDays != null &&
              ` · ${t(locale, 'brokers.paysIn').replace('{n}', String(brokerGrade.payDays))}`}
          </span>
        </div>
      )}

      {/* Текст водителю — сразу под хронологией: его шлют в начале рейса, а не
          «иногда». Адреса складов подставляются полные, если груз их знает: рейт-кон
          мог дать один город, лист водителя или ручная правка — улицу и индекс. */}
      {load.driverInfo && (
        <DriverInfoCard
          text={withAddresses(load.driverInfo, {
            pickup: load.pickupAddress,
            delivery: load.deliveryAddress,
            origin: load.origin,
            destination: load.destination,
          })}
          locale={locale}
        />
      )}

      {backhaul && <BackhaulList state={backhaul.state} brokers={backhaul.brokers} locale={locale} />}

      <section className="panel mt-4 p-5">
        <h2 className="mb-4 text-base leading-6 font-semibold text-white/90">
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
            pickupAddress: load.pickupAddress,
            deliveryAddress: load.deliveryAddress,
            origin: load.origin,
            destination: load.destination,
            ...(() => {
              const n = stopNames(load.driverInfo)
              return { pickupName: n.pickup, deliveryName: n.delivery }
            })(),
            pickupDate: load.pickupDate,
            deliveryDate: load.deliveryDate,
            pickupTime: load.pickupTime,
            deliveryTime: load.deliveryTime,
            laneAvgRpm,
            stops: stops,
            partial: load.partial,
          }}
        />
      </section>

      <section className="panel mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
          {t(locale, 'loadDetail.docsHeading')}
          <Info text={t(locale, 'loadDetail.docsInfo')} />
        </h2>
        <DocUpload loadId={load.id} />
        <DocList docs={docs} />
      </section>

      <section className="panel mt-4 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
            {t(locale, 'loadDetail.invoiceHeading')}
            <Info text={t(locale, 'loadDetail.invoiceInfo')} />
          </h2>
          {load.paidAt && (
            <span className="rounded-full bg-good-500/15 px-2 py-0.5 text-[11px] font-medium text-good-400">
              {t(locale, 'loadDetail.paidOn').replace('{date}', usDate(load.paidAt))}
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
  driverMarked,
  events,
}: {
  load: Awaited<ReturnType<typeof getLoad>>
  truck: Parameters<typeof loadMapData>[1]
  fs: Parameters<typeof loadMapData>[2]
  locale: Awaited<ReturnType<typeof getLocale>>
  /** Водитель отмечает шаги сам — стоянка уже показана над картой, GPS-плитка не нужна. */
  driverMarked: boolean
  events: Awaited<ReturnType<typeof listLoadEvents>>
}) {
  if (!load) return null
  const { rate: detentionRate, free: detentionFree } = await detentionTerms()
  const {
    markers: mapMarkers,
    routes: mapRoutes,
    miles: routeMiles,
    etaMin,
    live,
  } = await loadMapData(load, truck, fs, locale, events)
  if (mapMarkers.length === 0) return null
  // План заправок по плановой линии маршрута (не по следу): цены EIA по регионам.
  // Только пока груз везётся или забукирован — доставленному он ни к чему.
  const planned = mapRoutes.find((r) => r.tone !== 'trail' && r.coords && r.coords.length > 1)?.coords
  const fuel =
    planned && (load.status === 'booked' || load.status === 'in_transit')
      ? await fuelPlan(planned).catch(() => null)
      : null
  // Часовой пояс ТАМ, ГДЕ ТРАК СЕЙЧАС, — офлайн по координатам GPS (lib/tz.ts).
  // Диспетчер и водитель почти никогда не в одном поясе, а окна погрузки и звонки
  // живут по времени водителя.
  const driverZone = zoneFor(fs?.lat, fs?.lng)
  // Детеншен по GPS — только если водитель ничего не отмечал (иначе он над картой).
  const detention = driverMarked ? null : live.detention

  return (
    // Телефон: заголовок → карта → плитки (order), иначе карта уезжала под экран
    // плиток. На широком экране порядок прежний: плитки над картой.
    <section className="panel mt-4 flex flex-col p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90 max-md:order-[-2]">
        {t(locale, 'loadDetail.mapHeading')}
        <Info text={t(locale, 'loadDetail.mapInfo')} />
      </h2>
      {/* Три отдельные плитки, а не одна строка «82 mi · ~1ч 34м»: время у
              водителя, расстояние и срок — разные вопросы, и слитые в строку они
              читаются как одно число. Плитки переносятся, а не сжимаются: на узком
              экране лучше два ряда, чем обрезанное время. */}
      {(driverZone || routeMiles != null || etaMin != null || fs?.location) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {/* Где сейчас трак — первым: это первое, что спрашивает брокер, и
                  ответ отсюда тут же уходит ему в чат, поэтому плитка нажимается
                  и кладёт «город, штат» в буфер. */}
          {/* На телефоне — во всю ширину: город и две кнопки в одну строку, а не
                  столбиком из трёх строк в узкой плитке. */}
          {fs?.location && (
            <div className="basis-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 sm:flex-1 sm:basis-[11rem]">
              <div className="text-xs text-white/60 font-medium">
                {t(locale, 'loadDetail.driverPlace')}
              </div>
              <CopyPlace
                text={placeCity(fs.location) ?? fs.location}
                copy={placeCity(fs.location) ?? fs.location}
                coords={{ lat: fs.lat, lng: fs.lng }}
                size="sm"
                className="min-h-[1.375rem] text-[15px] font-semibold text-white/85"
              />
            </div>
          )}
          {driverZone && (
            <div className="flex-1 basis-[7.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="text-xs text-white/60 font-medium">
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
              <div className="text-xs text-white/60 font-medium">
                {t(locale, 'loadDetail.distanceLeft')}
              </div>
              <div className="nums min-h-[1.375rem] text-[15px] font-semibold text-white/85">
                {routeMiles} <span className="text-[11px] font-medium text-white/45">mi</span>
              </div>
            </div>
          )}
          {etaMin != null && (
            <div className="flex-1 basis-[7.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="text-xs text-white/60 font-medium">
                {t(locale, 'loadDetail.etaLeft')}
              </div>
              <div className="nums min-h-[1.375rem] text-[15px] font-semibold text-white/85">
                ~{driveTime(etaMin, locale)}
              </div>
              {/* Чистый драйв — крупно, а реальный путь с ночёвками 11/10 —
                      подписью: раньше диспетчер пересчитывал это в голове. */}
              {live.realEtaMin != null && live.realEtaMin > etaMin && (
                <div className="nums mt-0.5 text-[11px] text-white/45">
                  {t(locale, 'loadDetail.withRest').replace('{t}', driveTime(live.realEtaMin, locale))}
                </div>
              )}
            </div>
          )}
          {/* Успевает ли к сроку — главный вопрос, на который карта раньше не
                  отвечала: честный путь с ночёвками против даты и времени выгрузки. */}
          {live.slackMin != null && (
            <div
              className={`flex-1 basis-[9rem] rounded-xl border px-3 py-2 ${
                live.slackMin >= 0 ? 'border-good-500/25 bg-good-500/[0.06]' : 'border-bad-500/30 bg-bad-500/[0.07]'
              }`}
            >
              <div className="text-xs text-white/60 font-medium">
                {t(locale, 'loadDetail.deadline')}
              </div>
              <div
                className={`nums min-h-[1.375rem] text-[14px] font-semibold ${
                  live.slackMin >= 0 ? 'text-good-400' : 'text-bad-400'
                }`}
              >
                {t(locale, live.slackMin >= 0 ? 'loadDetail.slackOk' : 'loadDetail.slackLate').replace(
                  '{t}',
                  driveTime(Math.abs(live.slackMin), locale),
                )}
              </div>
            </div>
          )}
          {/* Стоит у склада 30+ минут — детеншен: время, сумма по условиям и
                  письмо брокеру в буфер. Отправка только руками. */}
          {detention && detention.min >= 30 && (
            <DetentionTile
              at={detention.at}
              sinceIso={detention.sinceIso}
              min={detention.min}
              rateHr={detentionRate}
              freeHr={detentionFree}
              refId={load.referenceId}
              route={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
              truck={truckLabel(truck)}
            />
          )}
          {/* Стоит 2+ часа не у пикапа и не у выгрузки: поломка, сон или
                  детеншн не там — повод позвонить, пока не позвонил брокер. */}
          {live.idleMin != null && live.idleMin >= 120 && (
            <div className="flex-1 basis-[8rem] rounded-xl border border-warn-500/30 bg-warn-500/[0.07] px-3 py-2">
              <div className="text-xs text-white/60 font-medium">
                {t(locale, 'loadDetail.idleWarn')}
              </div>
              <div className="nums min-h-[1.375rem] text-[14px] font-semibold text-warn-400">
                {driveTime(live.idleMin, locale)}
              </div>
            </div>
          )}
          {live.offRouteMi != null && (
            <div className="flex-1 basis-[8rem] rounded-xl border border-warn-500/30 bg-warn-500/[0.07] px-3 py-2">
              <div className="text-xs text-white/60 font-medium">
                {t(locale, 'loadDetail.offRoute')}
              </div>
              <div className="nums min-h-[1.375rem] text-[14px] font-semibold text-warn-400">~{live.offRouteMi} mi</div>
            </div>
          )}
          {/* Хватит ли топлива до выгрузки. Объём бака не телеметрия — 250
                  галлонов стандартной пары баков, поэтому «примерно». */}
          {fs?.fuel != null &&
            truck.mpg > 0 &&
            routeMiles != null &&
            (() => {
              const rangeMi = Math.round(((fs.fuel / 100) * 250 * truck.mpg) / 10) * 10
              const short = rangeMi < routeMiles
              return (
                <div
                  className={`flex-1 basis-[8rem] rounded-xl border px-3 py-2 ${
                    short ? 'border-warn-500/30 bg-warn-500/[0.07]' : 'border-white/10 bg-white/[0.04]'
                  }`}
                >
                  <div className="text-xs text-white/60 font-medium">
                    {t(locale, 'loadDetail.fuelFor')}
                  </div>
                  <div
                    className={`nums min-h-[1.375rem] text-[15px] font-semibold ${short ? 'text-warn-400' : 'text-white/85'}`}
                  >
                    ~{rangeMi.toLocaleString('en-US')} <span className="text-[11px] font-medium text-white/45">mi</span>
                  </div>
                  {short && (
                    <div className="mt-0.5 text-[11px] text-warn-400/85">{t(locale, 'loadDetail.fuelShort')}</div>
                  )}
                </div>
              )
            })()}
        </div>
      )}
      {/* Дизель по пути: цена в каждом штате маршрута и где заливать полный бак. */}
      {fuel && fuel.stops.length >= 2 && (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-white/60 font-medium">
            {t(locale, 'fuel.heading')}
            <span className="normal-case tracking-normal">· EIA {fuel.asOf}</span>
          </div>
          <div className="nums mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
            {fuel.stops.map((st, i) => (
              <span key={`${st.state}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-white/30">→</span>}
                <span
                  className={`rounded-md px-1.5 py-0.5 font-semibold ${
                    st.state === fuel.cheapest.state
                      ? 'bg-good-500/15 text-good-400'
                      : st.state === fuel.priciest.state
                        ? 'bg-bad-500/15 text-bad-400'
                        : 'bg-white/6 text-white/80'
                  }`}
                  title={st.region ?? st.state}
                >
                  {st.state} ${st.price.toFixed(2)}
                </span>
              </span>
            ))}
          </div>
          {fuel.tankSavings >= 20 && (
            <div className="mt-1 text-[12px] text-white/65">
              {t(locale, 'fuel.advice')
                .replace('{state}', fuel.cheapest.state)
                .replace('{save}', usd.format(Math.round(fuel.tankSavings)))}
            </div>
          )}
        </div>
      )}
      {/* Прогресс рейса: сколько загруженных миль уже позади. Только когда груз
              в пути — до пикапа делить ещё нечего; и не при крюке в четверть пути,
              когда «осталось» больше всей дистанции и полоска бы врала. */}
      {load.status === 'in_transit' &&
        routeMiles != null &&
        load.loadedMiles > 0 &&
        routeMiles <= load.loadedMiles * 1.25 &&
        (() => {
          const pct = Math.min(100, Math.max(0, Math.round((1 - routeMiles / load.loadedMiles) * 100)))
          return (
            <div className="mb-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-haul-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="nums mt-1 text-[11px] text-white/50">
                {t(locale, 'loadDetail.progressLine')
                  .replace('{p}', String(pct))
                  .replace('{left}', String(Math.round(routeMiles)))
                  .replace('{total}', String(Math.round(load.loadedMiles)))}
              </div>
            </div>
          )
        })()}
      {/* «LIVE · Обновить» — вплотную к карте, а не в заголовке секции: между ними
              стоят плитки, и с телефона кнопка оказывалась на экран выше того, что
              обновляет. Тот же живой режим, что на /tracking: сам подтягивает GPS при
              открытии устаревшей страницы и перечитывает её каждые полминуты. */}
      <div className="max-md:order-[-1] max-md:mb-3">
      <div className="mb-2 flex justify-end">
        <RefreshFleetButton
          staleMinutes={fs?.updatedAt ? Math.round((Date.now() - new Date(fs.updatedAt).getTime()) / 60000) : null}
        />
      </div>
      <FleetMap
        markers={mapMarkers}
        routes={mapRoutes}
        height="clamp(300px, 42vh, 540px)"
        distanceMi={routeMiles}
        subNote={
          load.status === 'in_transit' &&
          routeMiles != null &&
          load.loadedMiles > 0 &&
          routeMiles <= load.loadedMiles * 1.25
            ? t(locale, 'loadDetail.mapDriven')
                .replace(
                  '{p}',
                  String(Math.min(100, Math.max(0, Math.round((1 - routeMiles / load.loadedMiles) * 100)))),
                )
                .replace('{n}', String(Math.round(routeMiles)))
            : load.status === 'booked' && live.toPickupMi != null && live.toPickupMi > 0
              ? t(locale, 'loadDetail.mapToPickup').replace('{n}', String(Math.round(live.toPickupMi)))
              : null
        }
      />
      </div>
    </section>
  )
}
