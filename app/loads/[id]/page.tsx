import Link from 'next/link'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { tileGrid } from '@/lib/tiles'
import { LOAD_DETAIL_TILES, migrateLoadPapers } from '@/lib/tiles-core'
import { Fragment, Suspense, type ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { currentLoadForTruck, getLoad, laneAvgRpmFor, listDocs, listLoads, truckForLoad } from '@/lib/loads'
import { QueuedLoadHint } from '@/components/queued-load-hint'
import { activeLoadsByTruck, prevLoadFor, truckLabel, truckShortLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { getCompany } from '@/lib/invoice'
import { assignWarnings, fleetStatusByUnit, getTruckMeta } from '@/lib/maintenance'
import { companyScope, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { financesHref, payBadge, todayEt } from '@/lib/payments'
import { paymentFor } from '@/lib/payments-server'
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
import { BackButton } from '@/components/back-button'
import { PairBar } from '@/components/pair-bar'
import { DetentionTile } from '@/components/detention-tile'
import { detentionTerms, getSetting } from '@/lib/settings'
import { headers } from 'next/headers'
import { DriverLinkButton } from '@/components/driver-link-button'
import { Building2, Mail, Phone, RotateCw, Send } from 'lucide-react'
import { tgConnected } from '@/lib/telegram'
import { stopWindows } from '@/lib/detention'
import { BackhaulList } from '@/components/backhaul-list'
import { backhaulBrokers } from '@/lib/backhaul'
import { brokerGradeFor } from '@/lib/brokers'
import { fuelPlan } from '@/lib/fuel-plan'
import { listLoadEvents } from '@/lib/load-events'
import { DriverTimeline } from '@/components/driver-timeline'
import { DriverInfoCard } from '@/components/driver-info-card'
import { withAddresses, stopNames } from '@/lib/driver-info-zip'
import { arrivedAt, isDone, parseTaskOrder, stopsFrom, taskOrderKey, viaLabel, type StopEv } from '@/lib/stops'
import { TaskStops } from '@/components/task-stops'
import { LoadStops } from '@/components/load-stops'
import { Info } from '@/components/info'
import { StatusPicker } from './status-picker'
import { MissingPodBanner } from '@/components/missing-pod-banner'
import { PrevLoad } from '@/components/prev-load'
import { DeadheadFlag } from '@/components/deadhead-flag'
import { DEADHEAD_FLAG_MI } from '@/lib/load-status'
import { loadsMissingPod } from '@/lib/loads'
import { CopyPlace } from '@/components/copy-place'
import { placeCity } from '@/lib/place'
import { datCached, datEquipment, originRate } from '@/lib/dat-market'
import { laneTarget } from '@/lib/dat-lanes'
import { stateOfCity } from '@/lib/toll-spend'
import { lateStop } from '@/lib/loads-dashboard'
import { listCharges } from '@/lib/charges'
import { LoadCharges } from '@/components/load-charges'
import { PriorityPicker } from '@/components/priority-picker'
import { FacilityHints } from '@/components/facility-hints'

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
  // Следующий груз ищут, пока трак едет на выгрузку и когда он только что разгрузился:
  // «прошлые грузы в штате — кому звонить». У доставленного — только если он у трака
  // последний (решается ниже, когда известны грузы трака).
  const wantBackhaul = load.status === 'booked' || load.status === 'in_transit' || load.status === 'delivered'
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
  const [truckMeta, laneAvgRpm, backhaul, brokerGrade, driverEvents, truckCurrent, truckLoads, charges] = await Promise.all([
    getTruckMeta(truck.id),
    laneAvgRpmFor(companyId, load.origin, load.destination, load.id),
    wantBackhaul ? backhaulBrokers(companyId, load.destination, load.id) : Promise.resolve(null),
    brokerGradeFor(companyId, load.brokerMc, load.brokerEmail, load.brokerName),
    listLoadEvents(companyId, load.id),
    // Этот груз забукирован, а трак ещё везёт другой — подсказка, что делать.
    load.status === 'booked' ? currentLoadForTruck(companyId, truck.id) : Promise.resolve(null),
    // Что ещё едет в этом же трейлере — чтобы показать одно задание на все грузы.
    listLoads(companyId, { truckId: truck.id }),
    listCharges(companyId, load.id),
  ])
  // Окно ближайшей остановки закрылось, а приезда нет — «опаздывает» в шапку.
  const late = lateStop(load, driverEvents, Date.now())
  // Соседи по трейлеру — только если этот груз сам в нём едет (текущий или открытый
  // партиал). Иначе к доставленному или следующему грузу подмешивались остановки
  // текущего: у Trinity показывалось общее задание, а у самого Tallgrass — нет.
  const active = activeLoadsByTruck(truckLoads).get(truck.id) ?? []
  const mates = active.some((l) => l.id === load.id) ? active.filter((l) => l.id !== load.id) : []
  const showBackhaul =
    backhaul &&
    (load.status !== 'delivered' ||
      !truckLoads.some(
        (l) => l.id !== load.id && l.status !== 'quoted' && l.status !== 'cancelled' && Date.parse(l.createdAt) > Date.parse(load.createdAt),
      ))
  // Прошлые грузы этого трака без POD — в шапку: пока везут этот, про тот забывают.
  // Рядом — рынок DAT, если своей рыночной ставки у груза нет (почти всегда): серия по
  // трейлеру трака, иначе Van. Только из кэша — страница DAT не ждёт.
  // Цель торга по этому направлению: цена грузоотправителя минус доля брокера (lib/broker-cut.ts).
  const [missingPod, datSnap, cutTarget] = await Promise.all([
    loadsMissingPod(companyId, truckLoads.filter((l) => l.id !== load.id)),
    load.spotRpm ? null : datCached(datEquipment(truckMeta?.trailerNumber) ?? 'VAN'),
    laneTarget(
      companyId,
      datEquipment(truckMeta?.trailerNumber) ?? 'VAN',
      stateOfCity(load.origin),
      stateOfCity(load.destination),
      load.brokerName,
    ).catch(() => null),
  ])
  const datRate = datSnap ? originRate(datSnap, load.origin) : null
  // Кнопка «Чат Telegram» — только у того, чей Telegram подключён (демо — никогда).
  const me = await getCurrentUser()
  const tgUserId = me && !me.isDemo && (await tgConnected(me.id).catch(() => false)) ? me.id : null
  const taskLoads = mates.length ? [load, ...mates] : []
  const taskEvents: Record<number, StopEv[]> = { [load.id]: driverEvents }
  for (const m of mates) taskEvents[m.id] = await listLoadEvents(companyId, m.id)
  const queuedBehind = truckCurrent && truckCurrent.id !== load.id && !load.partial ? truckCurrent : null
  // Что этот трак вёз ДО этого груза — строкой в шапке, для проверки Deadhead
  // (components/prev-load.tsx). Только у назначенного груза: у груза без трака
  // truckForLoad подставляет первый трак парка, и «прошлым» стал бы чужой рейс.
  const prevLoad = load.truckId === null ? null : prevLoadFor(truckLoads, truck.id, load)

  // Never throws: the DB CHECKs mirror calcLoad's throw conditions, so every stored
  // row is a valid input by construction.
  const r = calcLoad(load, truck)
  // Остановки: JSON у новых грузов, две точки у старых; названия складов у старых —
  // из текста водителю.
  const stopNamesLegacy = stopNames(load.driverInfo)
  const stops = stopsFrom(load, { pickup: stopNamesLegacy.pickup, delivery: stopNamesLegacy.delivery })
  const via = viaLabel(stops, locale)
  // Документы трака и стоп-лист водителя против этого рейса — пока груз ещё не доставлен.
  const assign =
    load.status === 'quoted' || load.status === 'booked' || load.status === 'in_transit'
      ? assignWarnings(truckMeta, { places: stops.map((s) => s.city ?? s.address), deliveryDate: load.deliveryDate }, todayEt(), locale)
      : []
  // Стоянка у склада по отметкам водителя — над картой, потому что это деньги:
  // от «Приехал» до «Загрузился», дальше счёт замирает. Меньше получаса не показываем.
  // По окну на каждую остановку, где водитель простоял от получаса.
  const windows = load.status === 'cancelled' ? [] : stopWindows(driverEvents, stops).filter((w) => w.min >= 30)
  const stop = windows[windows.length - 1] ?? null
  const terms = windows.length ? await detentionTerms() : null
  const invoiceDoc = docs.find((d) => d.kind === 'invoice')
  // Где деньги за груз — метка на полосе статусов и у счёта; ставит её бухгалтер в «Финансах».
  const badge = payBadge(load.status, await paymentFor(companyId, load.id))
  const pay = badge && {
    href: (await can(await getCurrentUser(), 'finances')) ? financesHref(load) : null,
    label: t(locale, badge.key),
    tone: badge.tone,
  }
  const rateConDoc = docs.find((d) => d.kind === 'ratecon')
  const bolDoc = docs.find((d) => d.kind === 'bol')
  // Конечный POD — без номера остановки; POD промежуточных точек живут на рейке.
  const podDoc = docs.find((d) => d.kind === 'pod' && d.stopSeq == null) ?? docs.find((d) => d.kind === 'pod')
  const fs = truck.number ? fleet.get(truck.number) : undefined

  // Брокер одной строкой: имя ведёт в справочник, телефон звонит, почта открывает
  // письмо. Разделители ставятся между тем, что есть, — у груза без почты или без MC
  // строка не должна начинаться с точки.
  const brokerFacts = [
    ...(load.brokerName
      ? [
          <Link
            href={`/brokers?q=${encodeURIComponent(load.brokerMc ?? load.brokerName)}`}
            className="inline-flex items-center gap-1.5 font-semibold text-t1 hover:underline"
          >
            <Building2 size={14} className="shrink-0 text-t3" aria-hidden />
            {load.brokerName}
          </Link>,
        ]
      : []),
    ...(load.brokerMc ? [<span className="nums">MC {load.brokerMc}</span>] : []),
    ...(load.brokerPhone
      ? [
          <a href={`tel:${load.brokerPhone}`} className="nums inline-flex items-center gap-1 text-haul-400 hover:underline">
            <Phone size={13} className="shrink-0" aria-hidden />
            {load.brokerPhone}
          </a>,
        ]
      : []),
    ...(load.brokerEmail
      ? [
          <a href={`mailto:${load.brokerEmail}`} className="inline-flex min-w-0 items-center gap-1 break-all text-haul-400 hover:underline">
            <Mail size={13} className="shrink-0" aria-hidden />
            {load.brokerEmail}
          </a>,
        ]
      : []),
    ...(load.payVia ? [<span>{load.payVia}</span>] : []),
  ]

  // Блоки карточки — плитки: порядок и размер задаёт диспетчер, общий для всей
  // компании. Условные блоки просто не попадают в список — своё место в
  // сохранённой раскладке они при этом не теряют (см. lib/tiles-core.ts).
  const widgets: Widget[] = []
  const add = (id: string, node: ReactNode) => widgets.push({ id, node })

  // Маршрут, трак, статус и ставка — одной карточкой, а не четырьмя кусками.
  // Шапка груза разобрана на плитки. Одной секцией это был самый крупный блок
  // карточки: заголовок, предупреждения, адреса, полоса статуса, бумаги и разбор
  // ставки — всё вместе, и двигать внутри было нечего.
  add('hero', (
    <section className="panel h-full p-4">
      {/* Заголовок и флаг «следить» — в одной строке: на широком экране ряд из
          четырёх кнопок приоритета стоял отдельной полосой и отодвигал вниз всё,
          ради чего страницу открывают. На телефоне он переносится под заголовок. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[21px] font-semibold sm:text-[23px]">
            {load.origin ?? '—'} → {load.destination ?? '—'}
            {via && <span className="ml-2 text-lg font-medium text-t3 sm:text-xl">· {via}</span>}
          </h1>
          <p className="mt-1 text-base text-t2">
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
            {load.referenceId && (
              <>
                {` · ${t(locale, 'import.label.referenceId')} `}
                <span className="whitespace-nowrap">{load.referenceId}</span>
              </>
            )}
          </p>
        </div>
        {load.status !== 'paid' && load.status !== 'cancelled' && (
          <div className="sm:ml-auto">
            <PriorityPicker loadId={load.id} value={load.priority} />
          </div>
        )}
      </div>

      {/* Брокер груза — тоже в шапке. Кому звонить и на какую почту слать бумаги,
          лежало только в форме «Подробности» внизу страницы, а звонят по нему с
          первой секунды. Одной строкой, а не плашками: пять плашек на телефоне
          занимали три ряда и уводили ставку и кнопки за край экрана. Имя ведёт в
          справочник — там его история и оценка. */}
      {brokerFacts.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 border-t border-white/[0.07] pt-3 text-sm text-t2">
          {brokerFacts.map((part, k) => (
            <Fragment key={k}>
              {k > 0 && <span className="text-t3">·</span>}
              {part}
            </Fragment>
          ))}
        </p>
      )}
      {/* «Важное от брокера» — в той же плитке, что и сам брокер (владелец 25.09.2026:
          «должна быть одна плитка»). Непрочитанное по-прежнему в жёлтой рамке. */}
      <BrokerNotes
        embedded
        loadId={load.id}
        notes={load.brokerNotes}
        readAt={load.notesReadAt}
        hasRc={!!rateConDoc}
      />
    </section>
  ))

  // Всё, что горит по этому грузу, — одной плиткой и только когда горит.
  const deadheadBanner =
    load.deadheadMiles > DEADHEAD_FLAG_MI &&
    !(load.deadheadOkMiles != null && load.deadheadOkMiles === Math.round(load.deadheadMiles))
  if (late || assign.length > 0 || missingPod.length > 0 || deadheadBanner)
    add('warnings', (
      <section className="panel flex h-full flex-col gap-3 p-4">
        {late && (
          <div className="rounded-xl border border-bad-500/30 bg-bad-500/[0.08] px-4 py-3 text-base">
            <span className="font-semibold text-bad-400">{t(locale, 'loads.dash.late')}</span>{' '}
            <span className="text-t2">
              {t(locale, late.stop.role === 'pickup' ? 'stops.pickup' : 'stops.delivery')} · {late.stop.city ?? late.stop.address ?? '—'} ·{' '}
              {t(locale, 'loads.dash.lateBy').replace('{t}', driveTime(late.minutes, locale))}. {t(locale, 'loadDetail.lateHint')}
            </span>
          </div>
        )}
        {assign.length > 0 && (
          <div className="rounded-xl border border-warn-400/35 bg-warn-500/[0.08] px-4 py-3 text-base text-warn-400">
            {assign.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
          </div>
        )}
        <MissingPodBanner loads={missingPod} locale={locale} />
        <DeadheadFlag miles={load.deadheadMiles} okMiles={load.deadheadOkMiles} loadId={load.id} locale={locale} banner />
      </section>
    ))

  // Где, когда и под какими номерами. Рейт-кон приносит склад, улицу, окно и номера
  // PU/PO, но в шапке стояли только два города: адрес лежал внизу в «Подробностях»,
  // номер пикапа — в тексте водителю. Диспетчер, которому звонит склад, искал их по
  // всей странице.
  add('stops', (
    <section className="panel h-full p-4">
      <LoadStops stops={stops} locale={locale} />
      {/* Откуда трак пришёл на этот пикап. */}
      <PrevLoad load={prevLoad} locale={locale} className="mt-3" />
    </section>
  ))

  add('status', (
    <section className="panel h-full p-4">
      <StatusPicker
        id={load.id}
        truckId={truck.id}
        title={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
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
      {/* Груз едет не один: задание водителя — точки обоих грузов подряд. */}
      {taskLoads.length > 1 && (
        <TaskStops
          loads={taskLoads}
          events={taskEvents}
          locale={locale}
          truckId={truck.id}
          order={parseTaskOrder(await getSetting(taskOrderKey(truck.id)))}
          focusLoadId={load.id}
          className="mt-4"
        />
      )}
      {/* Действия с грузом — в той же плитке, что и статус (владелец 25.09.2026: «должна
          быть одна плитка»). BOL и POD здесь не повторяются: их открывают и загружают
          плашки прямо на полосе статуса. */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
        {rateConDoc ? (
          <RateConButton docId={rateConDoc.id} />
        ) : (
          <span className="text-xs text-t3">{t(locale, 'loadDetail.noRateCon')}</span>
        )}
        {/* Чат водителя в Telegram одним нажатием: BOL/POD и фото водитель шлёт туда, а
            «В груз» у сообщения кладёт файл сюда. Только если Telegram подключён. */}
        {tgUserId != null && (
          <Link
            href={`/telegram?truck=${truck.id}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
          >
            <Send size={14} aria-hidden />
            {t(locale, 'loadDetail.tgChat')}
          </Link>
        )}
        {/* Тот же брокер, то же направление, новые даты. Регулярный рейс заводился
            заново каждую неделю — вместе с перепечатыванием почты брокера и миль. */}
        <Link
          href={`/loads/new?repeat=${load.id}`}
          className="ml-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/12 px-3 py-2 text-sm font-medium text-t2 transition-colors hover:border-haul-500/50 hover:text-haul-300"
        >
          <RotateCw size={14} aria-hidden />
          {t(locale, 'loads.repeat')}
        </Link>
      </div>
    </section>
  ))

  add('rate', (
    <section className="panel h-full p-4">
      <h2 className="mb-4 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
        {t(locale, 'loadDetail.rateHeading')}
        <Info text={t(locale, 'loadDetail.rateInfo')} />
      </h2>
      <Analysis
        r={r}
        mpg={truck.mpg}
        spotRpm={load.spotRpm}
        dat={datRate && datSnap && { ...datRate, date: usDate(todayEt(new Date(datSnap.at))) }}
        targetRpm={truckMeta?.targetRpm}
        cut={cutTarget}
        // Warp котирует только Van; в демо — нет.
        quote={
          !cutTarget && !me?.isDemo && (datEquipment(truckMeta?.trailerNumber) ?? 'VAN') === 'VAN' && load.loadedMiles > 0
            ? { label: `${load.origin} → ${load.destination}`, miles: load.loadedMiles, loadId: load.id }
            : null
        }
      />
    </section>
  ))


  // Карта грузится отдельно от страницы: её сборка ждёт чужой маршрутизатор и
  // геокодер, и раньше эти секунды держали весь документ.
  add('map', (
    <Suspense fallback={<MapSkeleton />}>
      <LoadMapSection load={load} truck={truck} fs={fs} locale={locale} driverMarked={!!stop} events={driverEvents} />
    </Suspense>
  ))

  // «Водитель»: отметки рейса и стоянка у склада с суммой детеншена — ответ на
  // «где он и что делает» без звонка.
  if (load.status !== 'cancelled')
    add('driver', (
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
    ))

  if (queuedBehind)
    add('queued', <QueuedLoadHint locale={locale} current={queuedBehind} next={load} nextId={load.id} />)

  // Мили оценены приблизительно: в рейт-коне город с опечаткой, точный адрес не
  // нашёлся. Пробег надо вписать руками — иначе $/милю и зарплата врут.
  if (load.milesEstimated)
    add('miles-estimated', (
      <div className="rounded-xl border border-warn-400/35 bg-warn-500/[0.08] px-4 py-3 text-base">
        <span className="font-semibold text-warn-400">{t(locale, 'loadDetail.milesEstimated')}</span>{' '}
        <span className="text-t2">{t(locale, 'loadDetail.milesEstimatedHint')}</span>
      </div>
    ))

  // Медленный плательщик — сказать до того, как груз взят и повезён.
  if (brokerGrade?.payGrade === 'slow' && load.status !== 'paid' && load.status !== 'cancelled')
    add('slow-payer', (
      <div className="rounded-xl border border-bad-500/30 bg-bad-500/[0.08] px-4 py-3 text-base">
        <span className="font-semibold text-bad-400">{t(locale, 'brokers.grade.slowWarn')}</span>{' '}
        <span className="text-t2">
          {t(locale, 'brokers.grade.info')
            .replace('{n}', String(brokerGrade.paidCount))
            .replace('{late}', String(brokerGrade.lateCount))}
          {brokerGrade.payDays != null &&
            ` · ${t(locale, 'brokers.paysIn').replace('{n}', String(brokerGrade.payDays))}`}
        </span>
      </div>
    ))

  // Текст водителю: адреса складов подставляются полные, если груз их знает.
  if (load.driverInfo)
    add('driver-info', (
      <DriverInfoCard
        text={withAddresses(load.driverInfo, {
          pickup: load.pickupAddress,
          delivery: load.deliveryAddress,
          origin: load.origin,
          destination: load.destination,
        })}
        locale={locale}
      />
    ))

  // «Мы здесь уже были» — история по адресам груза: считается по всем грузам
  // компании, поэтому в своей границе.
  if (load.status !== 'cancelled')
    add('facility-hints', (
      <Suspense fallback={null}>
        <FacilityHints companyId={companyId} load={load} locale={locale} />
      </Suspense>
    ))

  add('details', (
    <section className="panel p-5">
      <h2 className="mb-4 text-base leading-6 font-semibold text-t1">
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
  ))

  if (showBackhaul)
    add('backhaul', <BackhaulList state={backhaul.state} brokers={backhaul.brokers} locale={locale} />)

  add('docs', (
    <section className="panel p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
        {t(locale, 'loadDetail.docsHeading')}
        <Info text={t(locale, 'loadDetail.docsInfo')} />
      </h2>
      <DocUpload loadId={load.id} />
      <DocList docs={docs} />
    </section>
  ))

  add('invoice', (
    <section className="panel p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'loadDetail.invoiceHeading')}
          <Info text={t(locale, 'loadDetail.invoiceInfo')} />
        </h2>
        {load.paidAt && (
          <span className="rounded-full bg-good-500/15 px-2 py-0.5 text-xs font-medium text-good-400">
            {t(locale, 'loadDetail.paidOn').replace('{date}', usDate(todayEt(new Date(load.paidAt))))}
          </span>
        )}
      </div>
      {/* Начисления сверх ставки — над счётом: они в него и попадают строками. */}
      {load.status !== 'cancelled' && <LoadCharges loadId={load.id} rate={load.rate} charges={charges} stopsCount={stops.length} />}
      <InvoiceBox
        loadId={load.id}
        invoiceNumber={load.invoiceNumber}
        invoiceDocId={invoiceDoc?.id ?? null}
        paid={!!load.paidAt}
        pay={pay}
        companyReady={!!(company.name && company.mcdot)}
      />
      <p className="mt-2 text-sm text-t3">{t(locale, 'loadDetail.invoicePackageNote')}</p>
    </section>
  ))

  // Экономика трака, из которой считается каждая строка расходов выше.
  add('truck-costs', (
    <details className="group">
      <summary className="panel flex cursor-pointer list-none items-center gap-1.5 p-4 text-base font-semibold text-t2 transition-colors hover:text-white">
        <span className="text-t3 transition-transform group-open:rotate-90">▸</span>
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
  ))

  const grid = await tileGrid('load-detail', LOAD_DETAIL_TILES, locale, migrateLoadPapers)

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

      <WidgetGrid
        {...grid}
        widgets={widgets}
        className="mt-3"
      />
    </main>
  )
}

/** Заглушка на время сборки карты: та же высота, что у настоящей секции, чтобы
 * страница не прыгала, когда карта приедет. */
function MapSkeleton() {
  return <div className="panel h-[clamp(360px,48vh,600px)] animate-pulse" />
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
    // Заголовок → карта → плитки (order) на любой ширине: сначала где трак на карте,
    // потом цифры. Плитки над картой отодвигали её за экран.
    <section className="panel flex flex-col p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1 order-[-2]">
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
              <div className="text-xs text-t2 font-medium">
                {t(locale, 'loadDetail.driverPlace')}
              </div>
              <CopyPlace
                text={placeCity(fs.location) ?? fs.location}
                copy={placeCity(fs.location) ?? fs.location}
                coords={{ lat: fs.lat, lng: fs.lng }}
                size="sm"
                className="min-h-[1.375rem] text-lg font-semibold text-t1"
              />
            </div>
          )}
          {driverZone && (
            <div className="flex-1 basis-[7.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="text-xs text-t2 font-medium">
                {t(locale, 'loadDetail.driverTime')}
              </div>
              {/* Высота зафиксирована: первый кадр LocalTime пустой (гидратация),
                      и без неё плитка подпрыгивала бы при загрузке страницы. */}
              <div className="flex min-h-[1.375rem] items-baseline">
                <LocalTime zone={driverZone} className="nums text-lg font-semibold text-t1" />
              </div>
            </div>
          )}
          {routeMiles != null && (
            <div className="flex-1 basis-[7.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="text-xs text-t2 font-medium">
                {t(locale, 'loadDetail.distanceLeft')}
              </div>
              <div className="nums min-h-[1.375rem] text-lg font-semibold text-t1">
                {routeMiles} <span className="text-xs font-medium text-t3">mi</span>
              </div>
            </div>
          )}
          {etaMin != null && (
            <div className="flex-1 basis-[7.5rem] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <div className="text-xs text-t2 font-medium">
                {t(locale, 'loadDetail.etaLeft')}
              </div>
              <div className="nums min-h-[1.375rem] text-lg font-semibold text-t1">
                ~{driveTime(etaMin, locale)}
              </div>
              {/* Чистый драйв — крупно, а реальный путь с ночёвками 11/10 —
                      подписью: раньше диспетчер пересчитывал это в голове. */}
              {live.realEtaMin != null && live.realEtaMin > etaMin && (
                <div className="nums mt-0.5 text-xs text-t3">
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
              <div className="text-xs text-t2 font-medium">
                {t(locale, 'loadDetail.deadline')}
              </div>
              <div
                className={`nums min-h-[1.375rem] text-md font-semibold ${
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
              <div className="text-xs text-t2 font-medium">
                {t(locale, 'loadDetail.idleWarn')}
              </div>
              <div className="nums min-h-[1.375rem] text-md font-semibold text-warn-400">
                {driveTime(live.idleMin, locale)}
              </div>
            </div>
          )}
          {live.offRouteMi != null && (
            <div className="flex-1 basis-[8rem] rounded-xl border border-warn-500/30 bg-warn-500/[0.07] px-3 py-2">
              <div className="text-xs text-t2 font-medium">
                {t(locale, 'loadDetail.offRoute')}
              </div>
              <div className="nums min-h-[1.375rem] text-md font-semibold text-warn-400">~{live.offRouteMi} mi</div>
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
                  <div className="text-xs text-t2 font-medium">
                    {t(locale, 'loadDetail.fuelFor')}
                  </div>
                  <div
                    className={`nums min-h-[1.375rem] text-lg font-semibold ${short ? 'text-warn-400' : 'text-t1'}`}
                  >
                    ~{rangeMi.toLocaleString('en-US')} <span className="text-xs font-medium text-t3">mi</span>
                  </div>
                  {short && (
                    <div className="mt-0.5 text-xs text-warn-400/85">{t(locale, 'loadDetail.fuelShort')}</div>
                  )}
                </div>
              )
            })()}
        </div>
      )}
      {/* Дизель по пути: цена в каждом штате маршрута и где заливать полный бак. */}
      {fuel && fuel.stops.length >= 2 && (
        <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-t2 font-medium">
            {t(locale, 'fuel.heading')}
            <span className="normal-case tracking-normal">· EIA {fuel.asOf}</span>
          </div>
          <div className="nums mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base">
            {fuel.stops.map((st, i) => (
              <span key={`${st.state}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-t3">→</span>}
                <span
                  className={`rounded-md px-1.5 py-0.5 font-semibold ${
                    st.state === fuel.cheapest.state
                      ? 'bg-good-500/15 text-good-400'
                      : st.state === fuel.priciest.state
                        ? 'bg-bad-500/15 text-bad-400'
                        : 'bg-white/6 text-t1'
                  }`}
                  title={st.region ?? st.state}
                >
                  {st.state} ${st.price.toFixed(2)}
                </span>
              </span>
            ))}
          </div>
          {fuel.tankSavings >= 20 && (
            <div className="mt-1 text-sm text-t2">
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
              <div className="nums mt-1 text-xs text-t3">
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
      <div className="order-[-1] mb-3">
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
