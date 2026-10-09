import { cityOf, expiries } from '@/lib/maintenance-core'
import Link from 'next/link'
import { type ReactNode } from 'react'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { tileGrid } from '@/lib/tiles'
import { migrateTruckCard, TRUCK_DETAIL_TILES } from '@/lib/tiles-core'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Droplet, Fuel, Phone } from 'lucide-react'
import { BackButton } from '@/components/back-button'
import { PairBar } from '@/components/pair-bar'
import { DriverLinkButton } from '@/components/driver-link-button'
import { sql } from '@/lib/db'
import { getTruck, listDocs, listLoads, loadPapers } from '@/lib/loads'
import { activeLoadsByTruck, currentLoadsByTruck, nextLoadsByTruck, prevLoadFor, truckLabel, truckShortLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { fleetStatusByUnit, getTruckMeta, listMaintenance, listTodos, oilStatus } from '@/lib/maintenance'
import { tripHistory } from '@/lib/eld'
import { seesFleetGps } from '@/lib/company'
import { loadMapData, statusTone } from '@/lib/load-map'
import { usd, usd2, weekBounds, weekStartIso, loadWeekAnchorMs, usDate } from '@/lib/fmt'
import { zoneFor } from '@/lib/tz'
import { LocalTime } from '@/components/local-time'
import { FleetMap } from '@/components/fleet-map'
import { StatusBadge, statusLabel } from '@/components/status'
import { TruckForm } from '@/components/truck-form'
import { FuelPriceButton } from '@/components/fuel-price-button'
import { TruckCare } from '@/components/truck-care'
import { DriverActions, DriverPhoto } from '@/components/driver-card'
import { TruckAddLoad } from '@/components/truck-add-load'
import { TruckTabs } from '@/components/truck-tabs'
import { TruckWeek } from '@/components/truck-week'
import { OrphanRateCons } from '@/components/orphan-ratecons'
import { DocList, DocUpload } from '@/components/docs'
import { RateConButton } from '@/components/ratecon-button'
import { TripHistoryPanel } from '@/components/trip-history-panel'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { TruckAvailability } from '@/components/truck-availability'
import { TruckDispatcher } from '@/components/truck-dispatcher'
import { Info } from '@/components/info'
import { TaskStops } from '@/components/task-stops'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getCompany } from '@/lib/invoice'
import { dispatcherPhoneKey, getSetting, detentionTerms } from '@/lib/settings'
import { stopWindows } from '@/lib/detention'
import { parseTaskOrder, stopsFrom, taskOrderKey, viaLabel, type StopEv } from '@/lib/stops'
import { allStopEvents, listLoadEvents } from '@/lib/load-events'
import { onTimeStats, stopDeadlineMs } from '@/lib/loads-dashboard'
import { queueFit } from '@/lib/queue-fit-core'
import { DriverTimeline } from '@/components/driver-timeline'
import { QueuedLoadHint } from '@/components/queued-load-hint'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale } from '@/lib/i18n'
import { CopyPlace } from '@/components/copy-place'
import { TruckPhoto } from '@/components/truck-photo'
import { DateMore } from '@/components/date-more'
import { MissingPodBanner } from '@/components/missing-pod-banner'
import { Rpm } from '@/components/rpm'
import { PrevLoad } from '@/components/prev-load'
import { StalePartialBanner } from '@/components/stale-partial-banner'
import { DeadheadFlag } from '@/components/deadhead-flag'
import { todayEt } from '@/lib/payments'
import { loadsMissingPod } from '@/lib/loads'

export const dynamic = 'force-dynamic'

// The log itself now keeps 100 days (lib/eld.ts, so a quarterly IFTA report has data
// to stand on), but the UI still offers at most 7: further back the trail is useful to
// a tax calculation, not to a dispatcher reading a trip.
const HISTORY_WINDOWS = [
  { hours: 24, key: 'trucks.history.24h' },
  { hours: 72, key: 'trucks.history.3d' },
  { hours: 168, key: 'trucks.history.7d' },
] as const

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ history?: string }>
}) {
  const { id } = await params
  const companyId = await companyScope()
  const locale = await getLocale()
  const truck = await getTruck(companyId, Number(id))
  if (!truck) notFound()

  // Закреплённый диспетчер — одной строкой из своей же таблицы: колонка на траке,
  // имя в users. Отдельного модуля это не стоит.
  const [dispatcherRow, staffRows] = await Promise.all([
    sql`SELECT t.dispatcher_id, u.name FROM trucks t LEFT JOIN users u ON u.id = t.dispatcher_id
        WHERE t.id = ${truck.id} AND t.company_id = ${companyId}`,
    // Кого вообще можно поставить: живые сотрудники, без демо-аккаунта и без
    // отключённых — предлагать закрепить машину за уволенным незачем.
    sql`SELECT id, name, role FROM users
        WHERE is_demo = FALSE AND company_id = ${companyId} AND disabled_at IS NULL AND pending_since IS NULL
        ORDER BY role, name`,
  ])
  const dispatcherId = (dispatcherRow as { dispatcher_id: number | null }[])[0]?.dispatcher_id ?? null
  const dispatcherName = (dispatcherRow as { name: string | null }[])[0]?.name ?? null
  const staff = staffRows as {
    id: number
    name: string
    role: 'admin' | 'dispatcher'
  }[]

  const requestedHours = Number((await searchParams).history)
  const historyWindow = HISTORY_WINDOWS.find((w) => w.hours === requestedHours) ?? HISTORY_WINDOWS[0]

  // Компания, диспетчер и его телефон — для готового блока «Driver Info», который
  // диспетчер копирует брокеру прямо из карточки водителя. Оба запроса кэшированы и
  // идут в общей пачке, отдельного захода в базу это не стоит.
  const user = await getCurrentUser()
  const [loads, meta, records, todos, fleet, docs, { rateCons }, history, company, dispatcherPhone, stopEvents] = await Promise.all([
    listLoads(companyId, { truckId: truck.id }),
    getTruckMeta(truck.id),
    listMaintenance(truck.id),
    listTodos(truck.id),
    fleetStatusByUnit(),
    listDocs(companyId, { truckId: truck.id }),
    // Rate Con каждого груза — тот же источник, что у «Грузов»: рейт-кон из корзины
    // кнопку не получает.
    loadPapers(companyId),
    truck.number && seesFleetGps(companyId) ? tripHistory(truck.number, historyWindow.hours) : Promise.resolve([]),
    getCompany(),
    // Номер того, кто закреплён за траком, а не того, кто открыл страницу:
    // траки распределены между диспетчерами, и брокеру нужен человек по машине.
    dispatcherId || user ? getSetting(dispatcherPhoneKey(dispatcherId ?? user!.id)) : Promise.resolve(null),
    // Отметки «приехал» — для плитки «Вовремя».
    // ponytail: отметки всей компании одним запросом (как справочник складов); фильтр по траку — если парк вырастет.
    allStopEvents(companyId),
  ])
  const fs = truck.number ? fleet.get(truck.number) : undefined
  // Когда водитель последний раз открывал свою страницу — видно, что ссылка живая.
  const driverSeen = await getSetting(`driver_seen:${truck.id}`)
  // Адрес страницы водителя готов сразу — тогда кнопки «отправить в Telegram или
  // SMS» видны без лишнего нажатия. В демо ссылку не выдаём — и без входа (открытый
  // доступ) тоже: ссылка даёт записывать в рейс.
  const driverLink =
    companyId === 'demo' || !user
      ? null
      : await (async () => {
          const { driverTokenFor } = await import('@/lib/driver-link')
          const h = await headers()
          const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
          const proto = h.get('x-forwarded-proto') ?? 'https'
          return host ? `${proto}://${host}/d/${await driverTokenFor(truck.id)}` : null
        })()

  const live = loads.filter((l) => l.status !== 'cancelled')
  // Доставленные грузы без POD — первой строкой «Текущего задания».
  const missingPod = await loadsMissingPod(companyId, live)
  const rows = live.map((l) => ({ load: l, r: calcLoad(l, truck) }))

  // «Неделя» трака — гросс, мили, $/mi и пустые мили из ОДНИХ И ТЕХ ЖЕ грузов недели:
  // цифра «за всё время» рядом с недельной читалась как ошибка в расчёте.
  const { start: weekBegin, end: weekEnd } = weekBounds()
  // Same anchoring as the trucks list: this week's rows are the loads RUN this week
  // (pickup date, Friday→Friday), so week gross/miles/RPM all describe the same 7 days.
  // Заявки (не подтверждены) в неделю не входят — как на «Сегодня», «Грузах» и в «Деньгах».
  const weekRows = rows.filter((x) => {
    const ms = loadWeekAnchorMs(x.load.pickupDate, x.load.createdAt)
    return x.load.status !== 'quoted' && ms >= weekBegin && ms < weekEnd
  })
  const weekGross = weekRows.reduce((s, x) => s + x.load.rate, 0)
  const weekMiles = weekRows.reduce((s, x) => s + x.r.totalMiles, 0)
  const weekDeadhead = weekRows.reduce((s, x) => s + x.r.deadheadMiles, 0)
  // Сколько дней стоит без груза: от плановой даты последней доставки. Дата
  // доставки, а не статус, потому что груз могут отметить «доставлен» и через
  // неделю — а трак всё это время уже искал работу.
  const lastDelivery = live
    .filter((l) => (l.status === 'delivered' || l.status === 'paid') && l.deliveryDate)
    .map((l) => l.deliveryDate!)
    .sort()
    .pop()
  const idleDays = lastDelivery ? Math.max(0, Math.floor((Date.now() - Date.parse(lastDelivery)) / 86_400_000)) : null
  // Вовремя за 90 дней; меньше трёх остановок с окном и приездом — «мало данных».
  const onTime = onTimeStats(live, stopEvents, Date.now())
  const onTimePct = onTime.total >= 3 ? Math.round((onTime.onTime / onTime.total) * 100) : null
  const openTodos = todos.filter((t) => !t.doneAt).length
  const hasUrgentTodo = todos.some((t) => !t.doneAt && t.priority === 'urgent')
  const oil = oilStatus(meta, fs?.odometer ?? null)

  // The truck's current assignment — feeds the hero's route/dates summary AND the map
  // below it. From the loads already in hand, not a fresh query. currentLoadForTruck() asked the
  // database for exactly what listLoads({ truckId }) fetched at the top of this function
  // — newest booked/in_transit load for this truck — and it sat SERIAL in front of
  // loadMapData()'s external routing call, so the round trip was on the page's critical
  // path twice over. currentLoadsByTruck() is the same rule, in memory, and is what
  // /trucks and /tracking already use.
  const activeLoad = currentLoadsByTruck(live).get(truck.id) ?? null
  // Следующий рейс, если рейт-кон на него уже брошен, пока этот везётся.
  const nextLoad = nextLoadsByTruck(live).get(truck.id) ?? null
  // Откуда трак пришёл — рейс перед текущим (у свободного — последний вообще).
  // Строкой под заданием: по ней видно, сходится ли Deadhead и не потерян ли груз
  // между двумя рейсами (components/prev-load.tsx).
  const prevLoad = prevLoadFor(live, truck.id, activeLoad)
  // Партиалы: едут вместе с текущим в одном трейлере.
  const partials = (activeLoadsByTruck(live).get(truck.id) ?? []).filter((l) => l.id !== activeLoad?.id)
  // Забытый партиал: выгрузка прошла, а он всё ещё «в пути» — его точки попадают в
  // задание нового груза (и у водителя). Предупреждение с кнопками — над заданием.
  const staleToday = todayEt()
  const stalePartials = partials
    .filter((p) => p.deliveryDate && p.deliveryDate.slice(0, 10) < staleToday)
    .map((p) => ({
      id: p.id,
      label: [p.brokerName, p.referenceId ? '#' + p.referenceId : null, (p.origin ?? '—') + ' → ' + (p.destination ?? '—')].filter(Boolean).join(' '),
      deliveryDate: p.deliveryDate!,
      lastSeq: [...stopsFrom(p)].reverse().find((s) => s.role === 'delivery')?.seq ?? 2,
    }))
  const activeStops = activeLoad ? stopsFrom(activeLoad) : []
  const activeVia = activeLoad ? viaLabel(activeStops, locale) : null

  // Map: the truck where it sits (ELD GPS) plus a delivery pin at its active load's
  // destination city, with rough miles + drive time to it.
  // Отметки водителя — и для стоянки у склада, и чтобы карта знала, какая
  // остановка следующая.
  const driverEvents = activeLoad ? await listLoadEvents(companyId, activeLoad.id) : []
  // Задание водителя — по всем грузам в трейлере сразу: текущий плюс партиалы.
  // У партиала свои отметки, поэтому события тянутся по каждому грузу отдельно.
  const taskLoads = activeLoad ? [activeLoad, ...partials] : partials
  const taskEvents: Record<number, StopEv[]> = activeLoad ? { [activeLoad.id]: driverEvents } : {}
  for (const p of partials) taskEvents[p.id] = await listLoadEvents(companyId, p.id)
  // Ручной порядок остановок (стрелки в задании) — и для списка, и для дороги на карте.
  const taskOrder = taskLoads.length > 1 ? parseTaskOrder(await getSetting(taskOrderKey(truck.id))) : null
  // Партиалы — одной дорогой через остановки всех грузов в порядке задания.
  const mapData = await loadMapData(activeLoad ?? taskLoads[0] ?? null, truck, fs, locale, driverEvents, {
    loads: taskLoads,
    events: taskEvents,
    order: taskOrder,
  })
  // Успевает ли трак на следующий пикап (lib/queue-fit-core.ts): путь до выгрузки + разгрузка
  // + Deadhead против закрытия окна пикапа. Одних дат мало: «выгрузка и пикап в один день»
  // выглядело нормой даже через полстраны.
  const nextPickupStop = nextLoad ? stopsFrom(nextLoad)[0] : null
  const queueFitNext = nextLoad
    ? queueFit({
        nowMs: Date.now(),
        etaMin: mapData.etaMin,
        deadheadMi: nextLoad.deadheadMiles || null,
        pickupEndMs: nextPickupStop ? stopDeadlineMs(nextPickupStop) : null,
      })
    : null
  const { markers: mapMarkers, routes: mapRoutes, miles: routeMiles } = mapData
  const mapShowsTask = taskLoads.length > 1 && mapMarkers.length > 0
  const windows = activeLoad ? stopWindows(driverEvents, activeStops).filter((w) => w.min >= 30) : []
  const terms = windows.length ? await detentionTerms() : null

  const toneClass = {
    move: 'text-good-400',
    on: 'text-haul-400',
    rest: 'text-t2',
  }

  // Блоки карточки — плитки: порядок и размер задаёт диспетчер, общий для всей
  // компании. Условные блоки просто не попадают в список — своё место в
  // сохранённой раскладке они при этом не теряют (см. lib/tiles-core.ts).
  const widgets: Widget[] = []
  const add = (id: string, node: ReactNode) => widgets.push({ id, node })

  // Шапка-баннер, как карточка товара: слева номер, водитель и паспорт трака;
  // справа сама машина и где стоит.
  //
  // Раскладка считается от ширины САМОЙ плитки (@container), а не экрана: плитку
  // можно сделать широкой (пол-экрана), и тогда колонка с фото отъедала у паспорта
  // почти всё — подписи кнопок статуса обрезались, трейлер налезал на телефон, VIN
  // рвался на куски. Уже 48rem — фото полосой сверху, место в паспорте.
  //
  // Водитель здесь же, целиком: отдельная плитка «Водитель · CDL, медкарта, фото»
  // повторяла имя, телефон, трак, трейлер и VIN, и её убрали — сроки CDL и медкарты,
  // фото и кнопки «Скопировать для брокера» / «Изменить» переехали сюда.
  add('hero', (
    <section className="panel relative overflow-hidden @container">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-full bg-[radial-gradient(60%_60%_at_80%_22%,rgba(109,90,232,0.22),transparent_70%)] @3xl:w-3/5"
      />
      <div className="relative grid @3xl:grid-cols-[minmax(0,1fr)_minmax(280px,40%)]">
        <div className="min-w-0 p-4 @lg:p-5">
        {/* Строка трака: номер, статус ELD значком, справа — доступность трака.
            Всё, что нажимается в шапке, одного вида: кнопка h-8 с рамкой и иконкой. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="nums text-[26px] font-semibold leading-8">{truck.number ?? truck.name}</h1>
            {fs?.driveStatus && (
              <span
                className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.04] px-2 text-sm font-semibold ${toneClass[statusTone(fs.driveStatus)]}`}
                title="ELD"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {fs.driveStatus}
              </span>
            )}
          </div>
          {/* Manual availability — dims the truck across the app and pulls it out of
              the "free" counters until it's flipped back. */}
          <TruckAvailability truckId={truck.id} current={truck.unavailable} locale={locale} />
        </div>

        {/* Водитель: фото (нажать — загрузить новое), имя и две кнопки. Кнопки
            уходят под имя, когда плитке не хватает ширины, а не сжимают его. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
            <DriverPhoto
              truckId={truck.id}
              name={truck.driverName}
              hasPhoto={meta?.hasPhoto ?? false}
              locale={locale}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-4 text-t3">{t(locale, 'trucks.driverCard.heading')}</p>
              <p className="mt-1 truncate text-lg font-semibold leading-6 text-t1">
                {truck.driverName || <span className="text-base font-medium text-t3">{t(locale, 'trucks.detail.noDriver')}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DriverActions
              truckId={truck.id}
              name={truck.driverName}
              phone={meta?.driverPhone ?? null}
              cdlExpiry={meta?.cdlExpiry ?? null}
              medcardExpiry={meta?.medcardExpiry ?? null}
              hasPhoto={meta?.hasPhoto ?? false}
              truckNumber={truck.number}
              trailerNumber={meta?.trailerNumber ?? null}
              vin={meta?.vin ?? null}
              broker={{
                // MC печатается без приставки: в блоке для брокера строка уже
                // начинается с «MC - », и «MC - MC 626911» читалось бы как ошибка.
                mc: company.mcdot.replace(/^MC[\s#-]*/i, ''),
                companyName: company.name,
                companyEmail: company.email,
                dispatcherName: dispatcherName ?? user?.name ?? '',
                dispatcherPhone: dispatcherPhone ?? '',
              }}
              locale={locale}
            />
            {/* «＋ Груз» — одна кнопка на всю карточку (план «Порядок в TMS»): Rate Con
                или вручную. Раньше то же самое было кнопкой здесь, плиткой «Новый груз
                из rate con» и кнопкой «Добавить груз» у списка грузов. */}
            <TruckAddLoad
              truckId={truck.id}
              currentLoad={
                activeLoad
                  ? { id: activeLoad.id, route: `${activeLoad.origin ?? '—'} → ${activeLoad.destination ?? '—'}` }
                  : null
              }
            />
          </div>
        </div>

        {/* Паспорт одной сеткой подписанных полей: подпись сверху, значение под ней.
            Телефон и VIN не переносятся — номер, разорванный на куски, диктовать
            брокеру нельзя; в две колонки им отдана вся строка. */}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 @lg:grid-cols-3">
          <HeadField label={t(locale, 'trucks.driverCard.phoneRowLabel')} className="col-span-2 @lg:col-span-1">
            {meta?.driverPhone ? (
              <a
                href={`tel:${meta.driverPhone}`}
                className="nums inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-base font-medium text-t1 transition-colors hover:border-white/30 hover:bg-white/[0.08] max-md:h-10"
              >
                <Phone size={14} strokeWidth={2.2} className="text-haul-300" />
                {meta.driverPhone}
              </a>
            ) : (
              <span className="text-t3">{t(locale, 'trucks.detail.noPhone')}</span>
            )}
          </HeadField>
          <HeadField label={t(locale, 'trucks.driverCard.trailerRowLabel')}>
            {meta?.trailerNumber ? <span className="nums">{meta.trailerNumber}</span> : <span className="text-t3">—</span>}
          </HeadField>
          {meta?.plate && (
            <HeadField label={t(locale, 'trucks.detail.plateLabel')}>
              <span className="nums">{meta.plate}</span>
            </HeadField>
          )}
          {meta?.vin && (
            <HeadField label="VIN" className="col-span-2 @lg:col-span-1">
              <span className="nums whitespace-nowrap text-base text-t2">{meta.vin}</span>
            </HeadField>
          )}
          <HeadField label={t(locale, 'trucks.driverCard.cdlLabel')}>
            {meta?.cdlExpiry ? <span className="nums">{usDate(meta.cdlExpiry)}</span> : <span className="text-t3">—</span>}
          </HeadField>
          <HeadField label={t(locale, 'trucks.driverCard.medcardLabel')}>
            {meta?.medcardExpiry ? <span className="nums">{usDate(meta.medcardExpiry)}</span> : <span className="text-t3">—</span>}
          </HeadField>
          {/* Кто ведёт эту машину. Закрепление живёт в админке, а нужно оно здесь: на
              странице трака и спрашивают «кто им занимается». */}
          {(user?.role === 'admin' || dispatcherName) && (
            <HeadField label={t(locale, 'trucks.detail.dispatcherPick')} className="col-span-2">
              {user?.role === 'admin' ? (
                <TruckDispatcher bare truckId={truck.id} current={dispatcherId} users={staff} />
              ) : (
                dispatcherName
              )}
            </HeadField>
          )}
          {fs?.location && (
            /* Где сейчас: место — отдельной строкой во всю ширину, кнопки под ним.
               Ответ на «где трак» почти всегда тут же уходит брокеру. */
            <HeadField label={t(locale, 'trucks.head.location')} className="col-span-full @3xl:hidden">
              <span className="block">{fs.location}</span>
              {zoneFor(fs.lat, fs.lng) && (
                <span className="mt-0.5 block text-sm text-t2">
                  {t(locale, 'trucks.head.driverTime')}: <LocalTime zone={zoneFor(fs.lat, fs.lng)!} className="nums font-semibold text-t1" />
                </span>
              )}
              <CopyPlace
                text={fs.location}
                copy={cityOf(fs.location) ?? fs.location}
                coords={{ lat: fs.lat, lng: fs.lng }}
                variant="action"
                hideText
                className="mt-1.5"
              />
              <TruckState fuel={fs.fuel} oil={oil} locale={locale} />
            </HeadField>
          )}
        </dl>

        </div>
        {/* Правая колонка — сама машина: фото на высоту левой колонки (по центру, а не
            прижатое вниз под пустотой) и где стоит. В узкой плитке колонка
            раскладывается (contents): фото полосой сверху, место — в паспорте. */}
        <div className="flex min-w-0 flex-col gap-4 @max-3xl:contents @3xl:py-5 @3xl:pr-5">
          <div className="relative h-44 @max-3xl:order-first @3xl:h-auto @3xl:min-h-44 @3xl:flex-1">
            <TruckPhoto
              fill
              truckId={truck.id}
              hasPhoto={meta?.hasTruckPhoto ?? false}
              model={meta?.truckModel ?? null}
              demo={companyId === 'demo'}
              alt={`${t(locale, 'trucks.detail.truckAlt')} ${truck.number ?? ''}`}
            />
          </div>
          {fs?.location && (
            <dl className="@max-3xl:hidden">
              <HeadField label={t(locale, 'trucks.head.location')}>
                <span className="block">{fs.location}</span>
                {zoneFor(fs.lat, fs.lng) && (
                  <span className="mt-0.5 block text-sm text-t2">
                    {t(locale, 'trucks.head.driverTime')}: <LocalTime zone={zoneFor(fs.lat, fs.lng)!} className="nums font-semibold text-t1" />
                  </span>
                )}
                <CopyPlace
                  text={fs.location}
                  copy={cityOf(fs.location) ?? fs.location}
                  coords={{ lat: fs.lat, lng: fs.lng }}
                  variant="action"
                  hideText
                  className="mt-1.5"
                />
                <TruckState fuel={fs.fuel} oil={oil} locale={locale} />
              </HeadField>
            </dl>
          )}
        </div>
      </div>
    </section>
  ))

  // Текущее задание — своя плитка. В шапке оно жило внутри левой колонки, и вся
  // шапка получалась блоком в пол-экрана, который нечем было двигать.
  add('assignment', (
    <section className="panel h-full p-4 sm:p-5">
        <h2 className="mb-2 flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'trucks.detail.currentAssignment')}
          <Info text={t(locale, 'trucks.detail.currentAssignmentInfo')} />
        </h2>
        <MissingPodBanner loads={missingPod} rateCons={rateCons} locale={locale} className="mb-3" />
        <StalePartialBanner items={stalePartials} locale={locale} />
        {/* Rate Con, из которого груз так и не завёлся (разбор прервали) — одной
            кнопкой в груз. Жил в плитке «Новый груз из rate con», которой больше нет. */}
        <OrphanRateCons
          truckId={truck.id}
          docs={docs
            .filter((d) => d.kind === 'ratecon' && d.loadId === null)
            .map((d) => ({ id: d.id, title: d.title, uploadedAt: d.uploadedAt }))}
        />
        {activeLoad ? (
          <>
            {/* Статус — ВПЛОТНУЮ к маршруту. justify-between отбрасывал его к правому
                краю, и посреди строки зияла пустая полоса в пол-экрана. */}
            {/* Груз — одна карточка-ссылка: маршрут крупно, под ним статус, номер
                и брокер. Вся карточка нажимается и ведёт на груз — ссылка-подложка,
                как у списка грузов ниже: так рядом работает кнопка Rate Con
                (<button> внутри <a> — невалидная разметка). */}
            <div className="group relative flex items-center gap-3 rounded-xl border border-haul-500/30 bg-haul-500/[0.07] px-3.5 py-2.5 transition-colors hover:border-haul-400/60 hover:bg-haul-500/[0.14]">
              <Link
                href={`/loads/${activeLoad.id}`}
                aria-label={`${activeLoad.origin ?? '—'} → ${activeLoad.destination ?? '—'}`}
                className="absolute inset-0 rounded-[inherit]"
              />
              <div className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-xl font-semibold leading-6">
                    {activeLoad.origin ?? '—'} → {activeLoad.destination ?? '—'}
                    {activeVia && <span className="ml-1.5 text-base font-medium text-t3">· {activeVia}</span>}
                  </span>
                  <span className="mt-0.5 shrink-0 text-lg text-haul-300 transition-transform group-hover:translate-x-0.5">
                    ↗
                  </span>
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-t3">
                  <StatusBadge status={activeLoad.status} locale={locale} />
                  {activeLoad.referenceId && <span className="nums">#{activeLoad.referenceId}</span>}
                  {activeLoad.brokerName && <span className="min-w-0 truncate">{activeLoad.brokerName}</span>}
                </span>
              </div>
              {rateCons.has(activeLoad.id) && (
                <span className="relative z-10 shrink-0">
                  <RateConButton docId={rateCons.get(activeLoad.id)!} compact />
                </span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <HeadField label={t(locale, 'trucks.detail.pickup')}>
                <span className="nums">{activeLoad.pickupTime || usDate(activeLoad.pickupDate) || '—'}</span>
              </HeadField>
              <HeadField label={t(locale, 'trucks.detail.delivery')}>
                <span className="nums">{activeLoad.deliveryTime || usDate(activeLoad.deliveryDate) || '—'}</span>
              </HeadField>
              <HeadField label={t(locale, 'trucks.detail.rate')}>
                <span className="nums text-xl font-semibold">{usd.format(activeLoad.rate)}</span>
                <Rpm
                  rate={activeLoad.rate}
                  miles={activeLoad.loadedMiles + activeLoad.deadheadMiles}
                  className="ml-1.5 text-sm text-t2"
                />
              </HeadField>
            </dl>
            {partials.map((p) => (
              <div
                key={p.id}
                className="relative mt-3 flex items-center gap-x-2 rounded-xl border border-haul-500/30 bg-haul-500/[0.06] px-3 py-2 text-base hover:border-haul-400/60"
              >
                {/* Ссылка-подложка, как у текущего груза выше: рядом работает кнопка Rate Con,
                    и она стоит вне переносимой части — на телефоне остаётся справа. */}
                <Link
                  href={`/loads/${p.id}`}
                  aria-label={`${p.origin ?? '—'} → ${p.destination ?? '—'}`}
                  className="absolute inset-0 rounded-[inherit]"
                />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-base leading-6 font-semibold text-haul-300">
                    {t(locale, 'trucks.detail.partialLoad')}
                  </span>
                  <span className="font-medium text-t1">
                    {p.origin ?? '—'} → {p.destination ?? '—'}
                  </span>
                  <span className="nums text-t3">{p.pickupTime || usDate(p.pickupDate)}</span>
                  {p.referenceId && <span className="nums text-sm text-t3">#{p.referenceId}</span>}
                  {p.brokerName && <span className="truncate text-sm text-t3">· {p.brokerName}</span>}
                  <span className="nums ml-auto font-medium text-t2">{usd.format(p.rate)}</span>
                  <Rpm rate={p.rate} miles={p.loadedMiles + p.deadheadMiles} className="text-sm text-t3" />
                </div>
                {rateCons.has(p.id) && (
                  <span className="relative z-10 shrink-0">
                    <RateConButton docId={rateCons.get(p.id)!} compact />
                  </span>
                )}
              </div>
            ))}
          </>
        ) : (
          <div className="text-base text-t3">
            {/* Не просто «свободен», а ГДЕ стоит: это и есть ответ, в каком городе
                искать ему груз. Без GPS остаётся прежняя фраза. Завести груз — кнопкой
                «＋ Груз» в шапке. */}
            <span className="flex flex-wrap items-center gap-2">
              {idleDays != null && (
                <span
                  className={`nums rounded-md px-1.5 py-0.5 text-sm font-semibold ${
                    idleDays >= 4 ? 'bg-bad-500/15 text-bad-400' : idleDays >= 2 ? 'bg-warn-500/15 text-warn-400' : 'bg-white/[0.06] text-t2'
                  }`}
                >
                  {t(locale, 'trucks.detail.idleDays').replace('{n}', String(idleDays))}
                </span>
              )}
              <span>
                {cityOf(fs?.location)
                  ? t(locale, 'trucks.detail.idleAt').replace('{place}', cityOf(fs?.location)!)
                  : t(locale, 'trucks.detail.noActiveLoad')}
              </span>
            </span>
          </div>
        )}
        <PrevLoad load={prevLoad} rcId={prevLoad ? rateCons.get(prevLoad.id) : undefined} locale={locale} className="mt-3" />
        {/* Страница водителя — заметным блоком, а не значком в углу: пока водитель
            ссылку не открывал, блок подсвечен и зовёт её отправить. */}
        {driverLink && !activeLoad && (
          <DriverLinkButton url={driverLink} truckId={truck.id} driverPhone={meta?.driverPhone ?? null} seenAt={driverSeen} />
        )}
    </section>
  ))

  // Длинные части задания: точки по порядку, следующий груз, предупреждение о
  // стыковке. Своей плиткой — в колонке шапки они делали её то длиннее соседней, то
  // короче, и пустота переезжала туда-сюда.
  if (activeLoad && ((taskLoads.length > 1 ? !mapShowsTask : activeStops.length > 2) || nextLoad))
    add('task', (
      <section className="panel h-full p-4 sm:p-5">
          {/* Порядок точек нужен, только когда их больше двух: у обычного рейса
              «откуда → куда» в строке выше и есть всё задание. */}
          {/* Партиалы — список остановок под картой, рядом с дорогой, которую он задаёт. */}
          {(taskLoads.length > 1 ? !mapShowsTask : activeStops.length > 2) && (
            <TaskStops
              loads={taskLoads}
              events={taskEvents}
              locale={locale}
              truckId={truck.id}
              order={taskLoads.length > 1 ? taskOrder : parseTaskOrder(await getSetting(taskOrderKey(truck.id)))}
              className="mt-3"
            />
          )}
          {nextLoad && (
            <div className="relative mt-3 flex items-center gap-x-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-base hover:border-white/25">
              {/* Ссылка-подложка: рядом работает кнопка Rate Con (<button> в <a> — невалидно),
                  вне переносимой части — на телефоне остаётся справа. */}
              <Link
                href={`/loads/${nextLoad.id}`}
                aria-label={`${nextLoad.origin ?? '—'} → ${nextLoad.destination ?? '—'}`}
                className="absolute inset-0 rounded-[inherit]"
              />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-base font-semibold text-t2">
                  {t(locale, 'trucks.detail.nextLoad')}
                </span>
                <span className="font-medium text-t1">
                  {nextLoad.origin ?? '—'} → {nextLoad.destination ?? '—'}
                </span>
                <span className="nums text-t3">{nextLoad.pickupTime || usDate(nextLoad.pickupDate)}</span>
                {nextLoad.referenceId && (
                  <span className="nums text-sm text-t3">#{nextLoad.referenceId}</span>
                )}
                <span className="nums ml-auto font-medium text-t2">{usd.format(nextLoad.rate)}</span>
                <Rpm rate={nextLoad.rate} miles={nextLoad.loadedMiles + nextLoad.deadheadMiles} className="text-sm text-t3" />
              </div>
              {rateCons.has(nextLoad.id) && (
                <span className="relative z-10 shrink-0">
                  <RateConButton docId={rateCons.get(nextLoad.id)!} compact />
                </span>
              )}
            </div>
          )}
          {nextLoad && (
            <QueuedLoadHint compact locale={locale} current={activeLoad} next={nextLoad} nextId={nextLoad.id} fit={queueFitNext} />
          )}
      </section>
    ))

  // Неделя трака — одной плиткой картинок (components/truck-week.tsx) вместо
  // двенадцати плиток-цифр (план «Порядок в TMS»; владелец 09.10: «меньше цифр,
  // больше визуала»): гросс столбиками по дням пикапа, мили полосой «гружёные / пустые»,
  // «вовремя» кольцом. Бак — шкалой в шапке, пробег и масло — во вкладке
  // «Обслуживание», топливо груза — в расходах на карточке груза.
  // Столбики по дням пикапа (без пикапа — по дню заведения, как у недели выше):
  // эта неделя и прошлая — пунктиром за ней.
  const weekFrom = weekStartIso(todayEt())
  const weekDays = Array.from({ length: 7 }, () => 0)
  const prevDays = Array.from({ length: 7 }, () => 0)
  for (const { load } of rows) {
    if (load.status === 'quoted') continue
    const iso = load.pickupDate ? load.pickupDate.slice(0, 10) : todayEt(new Date(load.createdAt))
    const i = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${weekFrom}T12:00:00Z`)) / 86_400_000)
    if (i >= 0 && i < 7) weekDays[i] += load.rate
    else if (i >= -7 && i < 0) prevDays[i + 7] += load.rate
  }
  add('week', (
    <TruckWeek
      locale={locale}
      d={{
        weekFrom,
        today: todayEt(),
        days: weekDays,
        gross: weekGross,
        prevDays,
        prevGross: prevDays.reduce((a, b) => a + b, 0),
        targetGross: meta?.weekTargetGross ?? null,
        miles: weekMiles,
        deadhead: weekDeadhead,
        targetMiles: meta?.weekTargetMiles ?? null,
        onTimePct,
        onTimeTotal: onTime.total,
      }}
    />
  ))

  // Незакрытый ремонт: висит, пока пункт не отметят выполненным в «Нужно починить».
  // Строкой в самом низу страницы о поломке узнавали практически никогда.
  if (openTodos > 0)
    add('todos', (
      <a
        href="#care"
        className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
          hasUrgentTodo
            ? 'border-bad-500/35 bg-bad-500/[0.10] hover:bg-bad-500/[0.15]'
            : 'border-warn-500/30 bg-warn-500/[0.08] hover:bg-warn-500/[0.13]'
        }`}
      >
        <span
          className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-md ring-1 ${
            hasUrgentTodo
              ? 'bg-bad-500/20 text-bad-400 ring-bad-400/25'
              : 'bg-warn-500/20 text-warn-400 ring-warn-400/25'
          }`}
        >
          <span className="text-sm leading-none">🔧</span>
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-base font-semibold leading-6 ${
              hasUrgentTodo ? 'text-bad-400' : 'text-warn-400'
            }`}
          >
            {t(locale, 'trucks.care.todoHeading')} · {openTodos}
          </p>
          <p className="mt-0.5 text-base text-t1">
            {todos
              .filter((x) => !x.doneAt)
              .slice(0, 4)
              .map((x) => (x.priority === 'urgent' ? `${x.title} (${t(locale, 'trucks.care.prioUrgent')})` : x.title))
              .join(' · ')}
            {openTodos > 4 && ` … +${openTodos - 4}`}
          </p>
        </div>
      </a>
    ))

  // Где трак сейчас и где был — одна плитка: карта, под ней история пути (план
  // «Порядок в TMS»: «Карта и история пути»). Без GPS карты нет — история остаётся.
  // Окно истории переключается на клиенте (components/trip-history-panel.tsx);
  // ?history= по-прежнему задаёт первое окно, чтобы старые ссылки работали.
  add('map', (
    <section className="panel p-4">
      {mapMarkers.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
              {t(locale, 'trucks.detail.onMap')}
              <Info text={t(locale, 'trucks.detail.onMapInfo')} />
            </h2>
            <RefreshFleetButton
              staleMinutes={fs?.updatedAt ? Math.round((Date.now() - new Date(fs.updatedAt).getTime()) / 60000) : null}
            />
          </div>
          <FleetMap
            markers={mapMarkers}
            routes={mapRoutes}
            height="clamp(320px, 46vh, 600px)"
            distanceMi={routeMiles}
          />
          {/* Два груза в трейлере: остановки обоих одним списком прямо под картой —
              порядок меняется перетаскиванием или стрелками, и дорога с милями над
              списком перестраивается по нему. */}
          {mapShowsTask && (
            <TaskStops loads={taskLoads} events={taskEvents} locale={locale} truckId={truck.id} order={taskOrder} className="mt-4" />
          )}
        </>
      )}
      <div className={mapMarkers.length > 0 ? 'mt-4 border-t border-white/8 pt-3' : ''}>
        <TripHistoryPanel
          embedded
          truckId={truck.id}
          windows={HISTORY_WINDOWS}
          initialHours={historyWindow.hours}
          initialLegs={history}
          // Города погрузок и выгрузок этого трака — по ним стоянка в истории
          // распознаётся как детеншен. Грузы уже загружены выше, нового запроса нет.
          stops={loads.flatMap((l) => [
            ...(l.origin ? [{ city: l.origin, kind: 'pickup' as const, day: l.pickupDate }] : []),
            ...(l.destination ? [{ city: l.destination, kind: 'delivery' as const, day: l.deliveryDate }] : []),
          ])}
        />
      </div>
    </section>
  ))

  // «Водитель» по текущему грузу — тот же блок, что на карточке груза.
  if (activeLoad)
    add('driver', (
      <DriverTimeline
        events={driverEvents}
        locale={locale}
        truckId={truck.id}
        loadId={activeLoad.id}
        stops={activeStops}
        link={
          driverLink ? (
            <DriverLinkButton
              embedded
              url={driverLink}
              truckId={truck.id}
              driverPhone={meta?.driverPhone ?? null}
              seenAt={driverSeen}
            />
          ) : undefined
        }
        detention={windows.map((w) => ({
          at: w.at,
          sinceIso: w.sinceIso,
          endIso: w.endIso,
          min: w.min,
          rateHr: terms?.rate ?? 35,
          freeHr: terms?.free ?? 2,
          refId: activeLoad.referenceId,
          route: `${activeLoad.origin ?? '—'} → ${activeLoad.destination ?? '—'}`,
          truck: truckLabel(truck),
        }))}
      />
    ))

  // Низ карточки — вкладками «Грузы | Документы | Обслуживание»
  // (components/truck-tabs.tsx). Раньше это были четыре плитки на три экрана вниз:
  // грузы и бумаги рядом, под ними обслуживание и свёрнутая экономика трака.
  // Кнопки «Добавить груз» у списка больше нет — груз заводится «＋ Груз» в шапке.
  const loadsNode = (
    <section className="panel @container p-4">
      {rows.length === 0 ? (
        <p className="text-base text-t3">{t(locale, 'trucks.detail.noLoadsYet')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Остальные грузы — не лентой, а по дню из мини-календаря (день пикапа). */}
          <DateMore limit={6} items={rows.map(({ load, r }) => {
            const rcId = rateCons.get(load.id)
            return { day: (load.pickupDate ?? load.createdAt).slice(0, 10), node: (
              /* Узко (телефон) — две строки: маршрут целиком, под ним статус, мили и
                 ставка. Широко — одна строка, как в таблице: маршрут, цифры одной
                 колонкой справа, кнопка Rate Con последней. */
              <div
                key={load.id}
                className="panel-interactive relative flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-white/6 p-3 @3xl:items-center"
              >
                {/* Вся строка открывает груз: ссылка-подложка, кнопка Rate Con рядом
                    работает (<a> внутри <a> — невалидно и съедает нажатия). */}
                <Link
                  href={`/loads/${load.id}`}
                  aria-label={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
                  className="absolute inset-0 rounded-[inherit]"
                />
                <span className="min-w-0 flex-1 basis-0 text-md font-medium leading-5">
                  {load.origin ?? '—'} → {load.destination ?? '—'}
                </span>
                {rcId && (
                  <span className="relative z-10 -my-0.5 shrink-0 @3xl:order-last">
                    <RateConButton docId={rcId} compact />
                  </span>
                )}
                <div className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 @3xl:w-[26rem] @3xl:basis-auto">
                  <StatusBadge status={load.status} locale={locale} />
                  <span className="nums text-sm text-t2">
                    {Math.round(r.totalMiles)} mi · {usd2.format(r.allInRpm)}/mi
                  </span>
                  <DeadheadFlag miles={load.deadheadMiles} okMiles={load.deadheadOkMiles} locale={locale} className="relative z-10" />
                  {/* Крупно — ставка груза, а не чистыми: «сколько стоит груз». */}
                  <span className="nums ml-auto shrink-0 text-md font-bold">{usd.format(load.rate)}</span>
                </div>
              </div>
            ) }
          })} />
        </div>
      )}
    </section>
  )

  const docsNode = (
    <section className="panel flex min-w-0 flex-col p-4">
      <DocUpload truckId={truck.id} />
      {/* attachTargets = this truck's live loads, so a file that came in via
          Telegram and landed under the truck can be recognised into a load or
          linked to an existing one straight from the list. */}
      <div>
        <DocList
          docs={docs}
          byDate
          limit={8}
          attachTargets={live.map((l) => ({
            id: l.id,
            label: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
          }))}
        />
      </div>
    </section>
  )

  // Обслуживание: масло, «нужно починить», сроки и журнал — и экономика трака
  // (свёрнута, в заголовке все её цифры одной строкой). Ссылки «#care» открывают
  // эту вкладку: id="care" теперь у самих вкладок.
  const careNode = (
    <div className="flex flex-col gap-4">
      <TruckCare
        truckId={truck.id}
        meta={meta}
        records={records}
        todos={todos}
        currentOdometer={fs?.odometer ?? null}
        oil={oil}
        docs={docs}
        locale={locale}
      />
      <details className="group panel p-4">
        <summary className="-m-1 flex cursor-pointer list-none flex-wrap items-center gap-1.5 rounded-lg p-1 text-base leading-6 font-semibold text-t1 transition-colors hover:bg-white/[0.03] hover:text-t1">
          <span className="text-base leading-none text-t3 transition-transform duration-200 group-open:rotate-90">
            ▸
          </span>
          {t(locale, 'trucks.detail.economics')}
          <Info text={t(locale, 'trucks.detail.economicsInfo')} />
          <span className="nums flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-normal text-t2 group-open:hidden sm:ml-2 sm:basis-auto">
            <span>{truck.mpg} mpg</span>
            <span aria-hidden>·</span>
            <span>{usd2.format(truck.fuelPricePerGallon)}/gal</span>
            <FuelPriceButton truckId={truck.id} locale={locale} />
            <span aria-hidden>·</span>
            <span>
              {t(locale, 'trucks.econ.driver')}{' '}
              {truck.driverPay.mode === 'cpm' ? `${truck.driverPay.centsPerMile}¢/mi` : `${truck.driverPay.percentOfGross}%`}
            </span>
            <span aria-hidden>·</span>
            <span>
              {usd.format(truck.truckPaymentPerDay + truck.insurancePerDay + truck.eldPermitsPerDay)}/{t(locale, 'trucks.econ.day')}
            </span>
            <span aria-hidden>·</span>
            <span>
              {t(locale, 'trucks.econ.maint')} {usd2.format(truck.maintenanceCostPerMile)}/mi
            </span>
            <span aria-hidden>·</span>
            <span>
              {t(locale, 'trucks.econ.factoring')} {truck.factoringPercent}%
            </span>
            <span aria-hidden>·</span>
            <span>
              {t(locale, 'trucks.econ.dispatch')} {truck.dispatchPercent}%
            </span>
          </span>
        </summary>
        <div className="mt-4">
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
            locale={locale}
          />
        </div>
      </details>
    </div>
  )

  // Точка у вкладки «Обслуживание», если там что-то горит: ремонт, масло, срок документа.
  const exp = expiries(meta, locale)
  const careTone =
    hasUrgentTodo || oil?.tone === 'bad' || exp.some((e) => e.tone === 'bad')
      ? ('bad' as const)
      : openTodos > 0 || oil?.tone === 'warn' || exp.some((e) => e.tone === 'warn')
        ? ('warn' as const)
        : null
  add('tabs', (
    <TruckTabs
      loads={loadsNode}
      docs={docsNode}
      care={careNode}
      label={t(locale, 'trucks.tabs.label')}
      labels={{
        loads: rows.length ? `${t(locale, 'trucks.detail.loadsHeading')} · ${rows.length}` : t(locale, 'trucks.detail.loadsHeading'),
        docs: docs.length ? `${t(locale, 'trucks.detail.documents')} · ${docs.length}` : t(locale, 'trucks.detail.documents'),
        care: t(locale, 'trucks.tabs.care'),
      }}
      careTone={careTone}
    />
  ))

  const grid = await tileGrid('truck-detail', TRUCK_DETAIL_TILES, locale, migrateTruckCard)

  return (
    <main className="page">
      <BackButton href="/trucks" label={t(locale, 'trucks.detail.backAll')} />
      <PairBar
        current="truck"
        truck={{ id: truck.id, label: truckLabel(truck, meta?.trailerNumber), short: truckShortLabel(truck) }}
        load={
          activeLoad
            ? {
                id: activeLoad.id,
                label: `${activeLoad.origin ?? '—'} → ${activeLoad.destination ?? '—'}`,
                sub: statusLabel(locale, activeLoad.status),
              }
            : null
        }
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

const FUEL_TEXT = { good: 'text-good-400', warn: 'text-warn-400', bad: 'text-bad-400' } as const
const FUEL_BAR = { good: 'bg-good-400', warn: 'bg-warn-400', bad: 'bg-bad-400' } as const

/** Состояние машины под «где сейчас»: бак шкалой и — только когда пора — масло
 *  плашкой-ссылкой на вкладку «Обслуживание». Были плитками-цифрами «Топливо» и
 *  «Масло через»; масло живёт во вкладке, но «пора менять» не должно туда прятаться. */
function TruckState({
  fuel,
  oil,
  locale,
}: {
  fuel: number | null | undefined
  oil: { milesLeft: number; tone: 'good' | 'warn' | 'bad' } | null
  locale: Locale
}) {
  const oilDue = oil && oil.tone !== 'good' ? oil : null
  if (fuel == null && !oilDue) return null
  return (
    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {fuel != null && <FuelGauge pct={fuel} label={t(locale, 'trucks.chip.fuel')} />}
      {oilDue && (
        <a
          href="#care"
          className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-semibold transition-colors ${
            oilDue.tone === 'bad' ? 'bg-bad-500/15 text-bad-400 hover:bg-bad-500/25' : 'bg-warn-500/15 text-warn-400 hover:bg-warn-500/25'
          }`}
        >
          <Droplet size={13} strokeWidth={2.4} />
          {oilDue.milesLeft > 0
            ? `${t(locale, 'trucks.chip.oilIn')} ${oilDue.milesLeft.toLocaleString('en-US')} mi`
            : `${t(locale, 'trucks.care.oilHeading')}: ${t(locale, 'trucks.care.overdueShort')}`}
        </a>
      )}
    </span>
  )
}

/** Бак шкалой: сколько осталось, видно без чтения цифры. Красная до 15 %, жёлтая до
 *  30 % — как у бывшей плитки «Топливо». */
function FuelGauge({ pct, label }: { pct: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)))
  const tone = v <= 15 ? 'bad' : v <= 30 ? 'warn' : 'good'
  return (
    <span className="flex items-center gap-2 text-sm" title={`${label}: ${v}%`}>
      <Fuel size={14} strokeWidth={2.2} className={FUEL_TEXT[tone]} aria-label={label} />
      <span className="h-2 w-24 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <span className={`block h-full rounded-full ${FUEL_BAR[tone]}`} style={{ width: `${v}%` }} />
      </span>
      <span className={`nums font-semibold ${tone === 'good' ? 'text-t2' : FUEL_TEXT[tone]}`}>{v}%</span>
    </span>
  )
}

/** Поле шапки трака: мелкая подпись сверху, значение под ней. */
function HeadField({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-sm font-medium leading-4 text-t3">{label}</dt>
      <dd className="mt-1 text-md font-medium leading-5 text-t1">{children}</dd>
    </div>
  )
}
