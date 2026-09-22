import { cityOf } from '@/lib/maintenance-core'
import Link from 'next/link'
import { type ReactNode } from 'react'
import { WidgetGrid, type Widget } from '@/components/widget-grid'
import { tileGrid } from '@/lib/tiles'
import { migrateTruckDriverCard, TRUCK_DETAIL_TILES } from '@/lib/tiles-core'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Phone, Plus } from 'lucide-react'
import { BackButton } from '@/components/back-button'
import { Button } from '@/components/button'
import { PairBar } from '@/components/pair-bar'
import { DriverLinkButton } from '@/components/driver-link-button'
import { sql } from '@/lib/db'
import { getTruck, listDocs, listLoads, rateConByLoad } from '@/lib/loads'
import { activeLoadsByTruck, currentLoadsByTruck, nextLoadsByTruck, prevLoadFor, truckLabel, truckShortLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { fleetStatusByUnit, getTruckMeta, listMaintenance, listTodos, oilStatus } from '@/lib/maintenance'
import { tripHistory } from '@/lib/eld'
import { loadMapData, statusTone } from '@/lib/load-map'
import { usd, usd2, weekBounds, loadWeekAnchorMs, usDate } from '@/lib/fmt'
import { zoneFor } from '@/lib/tz'
import { LocalTime } from '@/components/local-time'
import { FleetMap } from '@/components/fleet-map'
import { StatusBadge, statusLabel } from '@/components/status'
import { TruckForm } from '@/components/truck-form'
import { FuelPriceButton } from '@/components/fuel-price-button'
import { TruckCare } from '@/components/truck-care'
import { DriverActions, DriverPhoto } from '@/components/driver-card'
import { TruckRcDrop } from '@/components/truck-rc-drop'
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
import { t } from '@/lib/i18n'
import { CopyPlace } from '@/components/copy-place'
import { TruckPhoto } from '@/components/truck-photo'
import { DateMore } from '@/components/date-more'
import { MissingPodBanner } from '@/components/missing-pod-banner'
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
        WHERE is_demo = FALSE AND disabled_at IS NULL AND pending_since IS NULL
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
  const [loads, meta, records, todos, fleet, docs, rateCons, history, company, dispatcherPhone, stopEvents] = await Promise.all([
    listLoads(companyId, { truckId: truck.id }),
    getTruckMeta(truck.id),
    listMaintenance(truck.id),
    listTodos(truck.id),
    fleetStatusByUnit(),
    listDocs(companyId, { truckId: truck.id }),
    rateConByLoad(companyId),
    truck.number ? tripHistory(truck.number, historyWindow.hours) : Promise.resolve([]),
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
  // SMS» видны без лишнего нажатия. В демо ссылку не выдаём.
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

  const live = loads.filter((l) => l.status !== 'cancelled')
  // Доставленные грузы без POD — первой строкой «Текущего задания».
  const missingPod = await loadsMissingPod(companyId, live)
  const rows = live.map((l) => ({ load: l, r: calcLoad(l, truck) }))
  const active = live.filter((l) => l.status === 'booked' || l.status === 'in_transit').length

  // The hero chips are all "this truck's week at a glance" — Чистыми/Ставка-миля
  // must come from the SAME loads as Рейт за неделю, or net (from every active
  // load ever) reads as bigger than gross (from just this week), which looks like
  // the math is broken even though each number was individually correct.
  const { start: weekBegin, end: weekEnd } = weekBounds()
  // Same anchoring as the trucks list: this week's rows are the loads RUN this week
  // (pickup date, Monday→Monday), so week gross/net/RPM all describe the same 7 days.
  const weekRows = rows.filter((x) => {
    const ms = loadWeekAnchorMs(x.load.pickupDate, x.load.createdAt)
    return ms >= weekBegin && ms < weekEnd
  })
  const weekGross = weekRows.reduce((s, x) => s + x.load.rate, 0)
  const weekMiles = weekRows.reduce((s, x) => s + x.r.totalMiles, 0)
  const avgRpm = weekMiles > 0 ? weekRows.reduce((s, x) => s + x.r.gross, 0) / weekMiles : 0
  const weekDeadhead = weekRows.reduce((s, x) => s + x.r.deadheadMiles, 0)
  const weekDeadheadPct = weekMiles > 0 ? Math.round((weekDeadhead / weekMiles) * 100) : 0
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
  const mapData = await loadMapData(activeLoad, truck, fs, locale, driverEvents)
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
  // Партиалы — теми же пинами и линиями, без второго трака (fs не передаём).
  for (const p of partials) {
    const extra = await loadMapData(p, truck, undefined, locale)
    mapData.markers.push(...extra.markers)
    mapData.routes.push(...extra.routes)
  }
  const { markers: mapMarkers, routes: mapRoutes, miles: routeMiles } = mapData
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
        <MissingPodBanner loads={missingPod} locale={locale} className="mb-3" />
        <StalePartialBanner items={stalePartials} locale={locale} />
        {activeLoad ? (
          <>
            {/* Статус — ВПЛОТНУЮ к маршруту. justify-between отбрасывал его к правому
                краю, и посреди строки зияла пустая полоса в пол-экрана. */}
            {/* Груз — одна карточка-ссылка: маршрут крупно, под ним статус, номер
                и брокер. Вся карточка нажимается и ведёт на груз. */}
            <Link
              href={`/loads/${activeLoad.id}`}
              className="group block rounded-xl border border-haul-500/30 bg-haul-500/[0.07] px-3.5 py-2.5 transition-colors hover:border-haul-400/60 hover:bg-haul-500/[0.14]"
            >
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
            </Link>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <HeadField label={t(locale, 'trucks.detail.pickup')}>
                <span className="nums">{activeLoad.pickupTime || usDate(activeLoad.pickupDate) || '—'}</span>
              </HeadField>
              <HeadField label={t(locale, 'trucks.detail.delivery')}>
                <span className="nums">{activeLoad.deliveryTime || usDate(activeLoad.deliveryDate) || '—'}</span>
              </HeadField>
              <HeadField label={t(locale, 'trucks.detail.rate')}>
                <span className="nums text-xl font-semibold">{usd.format(activeLoad.rate)}</span>
              </HeadField>
            </dl>
            {partials.map((p) => (
              <Link
                key={p.id}
                href={`/loads/${p.id}`}
                className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-haul-500/30 bg-haul-500/[0.06] px-3 py-2 text-base hover:border-haul-400/60"
              >
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
              </Link>
            ))}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-base text-t3">
            {/* Не просто «свободен», а ГДЕ стоит: это и есть ответ, в каком городе
                искать ему груз. Без GPS остаётся прежняя фраза. */}
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
            {/* Свободный трак — главное действие на карточке: завести ему груз.
                Была текстовая ссылка «+ груз» в углу, её не находили. */}
            <Button
              href={`/loads/new?truck=${truck.id}`}
              variant="primary"
              icon={<Plus size={15} strokeWidth={2.5} />}
            >
              {t(locale, 'trucks.detail.addLoadCta')}
            </Button>
          </div>
        )}
        <PrevLoad load={prevLoad} locale={locale} className="mt-3" />
        {/* Страница водителя — заметным блоком, а не значком в углу: пока водитель
            ссылку не открывал, блок подсвечен и зовёт её отправить. */}
        {driverLink && !activeLoad && (
          <DriverLinkButton url={driverLink} driverPhone={meta?.driverPhone ?? null} seenAt={driverSeen} />
        )}
    </section>
  ))

  // Длинные части задания: точки по порядку, следующий груз, предупреждение о
  // стыковке. Своей плиткой — в колонке шапки они делали её то длиннее соседней, то
  // короче, и пустота переезжала туда-сюда.
  if (activeLoad && (taskLoads.length > 1 || activeStops.length > 2 || nextLoad))
    add('task', (
      <section className="panel h-full p-4 sm:p-5">
          {/* Порядок точек нужен, только когда их больше двух: у обычного рейса
              «откуда → куда» в строке выше и есть всё задание. */}
          {(taskLoads.length > 1 || activeStops.length > 2) && (
            <TaskStops
              loads={taskLoads}
              events={taskEvents}
              locale={locale}
              truckId={truck.id}
              order={parseTaskOrder(await getSetting(taskOrderKey(truck.id)))}
              className="mt-3"
            />
          )}
          {nextLoad && (
            <Link
              href={`/loads/${nextLoad.id}`}
              className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-base hover:border-white/25"
            >
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
            </Link>
          )}
          {nextLoad && (
            <QueuedLoadHint compact locale={locale} current={activeLoad} next={nextLoad} nextId={nextLoad.id} fit={queueFitNext} />
          )}
      </section>
    ))

  // Цифры трака — каждая своей маленькой плиткой. Раньше это была одна таблица на
  // всю ширину: двенадцать чисел, которые нельзя ни подвинуть, ни убрать.
  // Ключи смысловые, а не по порядку: часть цифр есть не у каждого трака, и
  // сохранённый порядок не должен путать пробег с топливом.
  const chips: (ChipProps & { id: string })[] = [
  {
    id: 'week-rate',
    label: t(locale, 'trucks.chip.weekRate'),
    value: usd.format(weekGross),
    tone: weekGross > 0 ? 'good' : undefined,
    info: t(locale, 'trucks.chip.weekRateInfo'),
  },
  {
    id: 'week-miles',
    label: t(locale, 'trucks.chip.weekMiles'),
    value: `${Math.round(weekMiles).toLocaleString('en-US')} mi`,
    info: t(locale, 'trucks.chip.weekMilesInfo'),
  },
  { id: 'rpm', label: t(locale, 'trucks.chip.rpm'), value: usd2.format(avgRpm), info: t(locale, 'trucks.chip.rpmInfo') },
  {
    id: 'deadhead',
    label: t(locale, 'trucks.chip.deadhead'),
    value: weekMiles > 0 ? `${Math.round(weekDeadhead).toLocaleString('en-US')} mi · ${weekDeadheadPct}%` : '—',
    tone: weekMiles > 0 ? (weekDeadheadPct >= 25 ? 'bad' : weekDeadheadPct >= 15 ? 'warn' : 'good') : undefined,
    info: t(locale, 'trucks.chip.deadheadInfo'),
  },
  // Цель недели из профиля водителя: сколько уже проехал / заработал против цели.
  ...(meta?.weekTargetMiles
    ? [
        {
          id: 'week-target',
          label: t(locale, 'trucks.chip.weekTarget'),
          value: `${Math.round(weekMiles).toLocaleString('en-US')} / ${meta.weekTargetMiles.toLocaleString('en-US')} mi · ${Math.round((weekMiles / meta.weekTargetMiles) * 100)}%`,
          tone: weekMiles >= meta.weekTargetMiles ? ('good' as const) : undefined,
          info: t(locale, 'trucks.chip.weekTargetInfo'),
        },
      ]
    : []),
  ...(meta?.weekTargetGross
    ? [
        {
          id: 'week-target-gross',
          label: t(locale, 'trucks.chip.weekTargetGross'),
          value: `${usd.format(weekGross)} / ${usd.format(meta.weekTargetGross)} · ${Math.round((weekGross / meta.weekTargetGross) * 100)}%`,
          tone: weekGross >= meta.weekTargetGross ? ('good' as const) : undefined,
          info: t(locale, 'trucks.chip.weekTargetInfo'),
        },
      ]
    : []),
  {
    id: 'on-time',
    label: `${t(locale, 'trucks.chip.onTime')}${truck.driverName ? ` · ${truck.driverName}` : ''}`,
    value:
      onTimePct == null
        ? t(locale, 'trucks.chip.onTimeFew')
        : t(locale, 'trucks.chip.onTimeValue').replace('{pct}', String(onTimePct)).replace('{n}', String(onTime.total)),
    tone: onTimePct == null ? undefined : onTimePct >= 90 ? 'good' : onTimePct < 80 ? 'warn' : undefined,
    info: t(locale, 'trucks.chip.onTimeInfo'),
  },
  ...(fs?.odometer != null
    ? [
        {
          id: 'odometer',
          label: t(locale, 'trucks.chip.odometer'),
          value: `${Math.round(fs.odometer).toLocaleString('en-US')} mi`,
          info: t(locale, 'trucks.chip.odometerInfo'),
        },
      ]
    : []),
  {
    id: 'oil',
    label: t(locale, 'trucks.chip.oilIn'),
    value: oil ? `${Math.max(0, oil.milesLeft).toLocaleString('en-US')} mi` : '—',
    tone: oil?.tone,
    info: t(locale, 'trucks.chip.oilInInfo'),
  },
  ...(fs?.fuel != null
    ? [
        {
          id: 'fuel',
          label: t(locale, 'trucks.chip.fuel'),
          value: `${Math.round(fs.fuel)}%`,
          tone: fs.fuel <= 15 ? ('bad' as const) : fs.fuel <= 30 ? ('warn' as const) : undefined,
          info: t(locale, 'trucks.chip.fuelInfo'),
        },
      ]
    : []),
  ...(activeLoad
    ? [
        {
          id: 'load-fuel',
          label: t(locale, 'trucks.chip.loadFuel'),
          value: usd.format(calcLoad(activeLoad, truck).fuel),
          info: t(locale, 'trucks.chip.loadFuelInfo'),
        },
      ]
    : []),
]
  for (const c of chips) add(c.id, <Chip {...c} />)

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

  // Где трак сейчас и куда сдаёт.
  if (mapMarkers.length > 0)
    add('map', (
      <section className="panel p-4">
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
      </section>
    ))

  // Рейт-кон прилетает каждый час, и с него начинается любая работа с траком.
  add('ratecon', (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'trucks.detail.newLoadFromRc')}
          <Info text={t(locale, 'trucks.detail.newLoadFromRcInfo')} />
        </h2>
        <Link href={`/loads/new?truck=${truck.id}`} className="text-sm text-t3 hover:text-t1">
          {t(locale, 'trucks.detail.orManually')}
        </Link>
      </div>
      <TruckRcDrop
        truckId={truck.id}
        currentLoad={
          activeLoad
            ? { id: activeLoad.id, route: `${activeLoad.origin ?? '—'} → ${activeLoad.destination ?? '—'}` }
            : null
        }
      />
      <OrphanRateCons
        truckId={truck.id}
        docs={docs
          .filter((d) => d.kind === 'ratecon' && d.loadId === null)
          .map((d) => ({
            id: d.id,
            title: d.title,
            uploadedAt: d.uploadedAt,
          }))}
      />
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
            <DriverLinkButton embedded url={driverLink} driverPhone={meta?.driverPhone ?? null} seenAt={driverSeen} />
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

  // История пути. Переключатель окна — на клиенте (components/trip-history-panel.tsx);
  // ?history= по-прежнему задаёт первое окно, чтобы старые ссылки работали.
  add('trips', (
    <TripHistoryPanel
      truckId={truck.id}
      windows={HISTORY_WINDOWS}
      initialHours={historyWindow.hours}
      initialLegs={history}
      // Города погрузок и выгрузок этого трака — по ним стоянка в истории
      // распознаётся как детеншен. Грузы уже загружены выше, нового запроса нет.
      stops={loads.flatMap((l) => [
        ...(l.origin ? [{ city: l.origin, kind: 'pickup' as const, day: l.pickupDate }] : []),
        ...(l.destination
          ? [
              {
                city: l.destination,
                kind: 'delivery' as const,
                day: l.deliveryDate,
              },
            ]
          : []),
      ])}
    />
  ))

  // Грузы трака и его бумаги — две плитки в полстроки, рядом.
  add('loads', (
    <section className="panel flex min-w-0 flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base leading-6 font-semibold text-t1">
          {t(locale, 'trucks.detail.loadsHeading')}
          {active > 0 && ` · ${active} ${t(locale, 'trucks.detail.inProgress')}`}
        </h2>
        <Button href={`/loads/new?truck=${truck.id}`} size="sm" icon={<Plus size={13} strokeWidth={2.5} />}>
          {t(locale, 'trucks.detail.addLoadCta')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-base text-t3">{t(locale, 'trucks.detail.noLoadsYet')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Остальные грузы — не лентой, а по дню из мини-календаря (день пикапа). */}
          <DateMore limit={4} items={rows.map(({ load, r }) => {
            const rcId = rateCons.get(load.id)
            return { day: (load.pickupDate ?? load.createdAt).slice(0, 10), node: (
              /* Two lines, not one. This card sits in a half-width column beside the
                 documents panel, and the old single row asked the route, the status
                 badge, the rate and the RC button to share ~330px — so every route
                 clipped to "Denver, CO → Kansas C…". Route owns line one; the money
                 drops to line two, where it has the width to itself. */
              <div key={load.id} className="panel-interactive relative rounded-xl border border-white/6 p-3">
                {/* The WHOLE row opens the load now, not just the route text — a
                    2cm-wide link inside a card-sized target is a miss waiting to
                    happen. Overlay link, so the RC button next to it keeps working
                    (an anchor inside an anchor is invalid HTML and eats clicks). */}
                <Link
                  href={`/loads/${load.id}`}
                  aria-label={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
                  className="absolute inset-0 rounded-[inherit]"
                />
                {/* Маршрут — первой строкой ЦЕЛИКОМ, с переносом: рядом с ним стоит
                    только маленькая кнопка RC. Статус переехал во вторую строку —
                    на телефоне он отнимал у маршрута половину ширины. */}
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-md font-medium leading-5">
                    {load.origin ?? '—'} → {load.destination ?? '—'}
                  </span>
                  {rcId && (
                    <span className="relative z-10 -mt-0.5 shrink-0">
                      <RateConButton docId={rcId} compact />
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge status={load.status} locale={locale} />
                  <span className="nums text-sm text-t2">
                    {Math.round(r.totalMiles)} mi · {usd2.format(r.allInRpm)}/mi
                  </span>
                  <DeadheadFlag miles={load.deadheadMiles} okMiles={load.deadheadOkMiles} locale={locale} className="relative z-10" />
                  {/* Headline is the load's actual RATE, never net — the owner reads
                      these cards as "what this load is worth". Net is the small line. */}
                  <span className="nums ml-auto shrink-0 text-md font-bold">{usd.format(load.rate)}</span>
                </div>
              </div>
            ) }
          })} />
        </div>
      )}
    </section>
  ))

  add('docs', (
    <section className="panel flex min-w-0 flex-col p-4">
      <div className="mb-2">
        <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-t1">
          {t(locale, 'trucks.detail.documents')}
          <Info text={t(locale, 'trucks.detail.documentsInfo')} />
        </h2>
      </div>
      <DocUpload truckId={truck.id} />
      {/* attachTargets = this truck's live loads, so a file that came in via
          Telegram and landed under the truck can be recognised into a load or
          linked to an existing one straight from the list. */}
      <div>
        <DocList
          docs={docs}
          byDate
          limit={Math.max(3, Math.round(Math.min(rows.length, 4) * 1.25))}
          attachTargets={live.map((l) => ({
            id: l.id,
            label: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
          }))}
        />
      </div>
    </section>
  ))

  // Масло, «нужно починить», сроки и журнал. id="care" — цель ссылок о сроках
  // документов с обзора, поэтому его менять нельзя.
  add('care', (
    <div id="care" className="scroll-mt-4">
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
    </div>
  ))

  // Экономика — свёрнута, но в заголовке видны все её цифры одной строкой.
  add('economics', (
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
  ))

  const grid = await tileGrid('truck-detail', TRUCK_DETAIL_TILES, locale, migrateTruckDriverCard)

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
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

type ChipProps = {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'warn'
  info?: string
}

function Chip({ label, value, tone, info }: ChipProps) {
  const color =
    tone === 'good'
      ? 'text-good-400'
      : tone === 'bad'
        ? 'text-bad-400'
        : tone === 'warn'
          ? 'text-warn-400'
          : 'text-white'
  // Плитка: подпись сверху, число под ней — одинаковая высота во всей таблице.
  return (
    <div className="panel flex h-full w-full min-w-0 flex-col justify-center gap-0.5 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-1 text-sm font-medium leading-4 text-t3">
        <span className="truncate">{label}</span>
        {info && <Info text={info} />}
      </span>
      <span className={`nums text-xl font-semibold leading-6 ${color}`}>{value}</span>
    </div>
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
