import { cityOf } from '@/lib/maintenance-core'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { Plus } from 'lucide-react'
import { BackButton } from '@/components/back-button'
import { Button } from '@/components/button'
import { PairBar } from '@/components/pair-bar'
import { DriverLinkButton } from '@/components/driver-link-button'
import { sql } from '@/lib/db'
import { getTruck, listDocs, listLoads, rateConByLoad } from '@/lib/loads'
import { activeLoadsByTruck, currentLoadsByTruck, nextLoadsByTruck, truckLabel, truckShortLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { fleetStatusByUnit, getTruckMeta, listMaintenance, listTodos, oilStatus } from '@/lib/maintenance'
import { tripHistory } from '@/lib/eld'
import { loadMapData, statusTone } from '@/lib/load-map'
import { usd, usd2, weekBounds, loadWeekAnchorMs, usDate } from '@/lib/fmt'
import { FleetMap } from '@/components/fleet-map'
import { StatusBadge, statusLabel } from '@/components/status'
import { TruckForm } from '@/components/truck-form'
import { TruckCare } from '@/components/truck-care'
import { DriverCard } from '@/components/driver-card'
import { TruckRcDrop } from '@/components/truck-rc-drop'
import { OrphanRateCons } from '@/components/orphan-ratecons'
import { DocList, DocUpload } from '@/components/docs'
import { RateConButton } from '@/components/ratecon-button'
import { TripHistoryPanel } from '@/components/trip-history-panel'
import { RefreshFleetButton } from '@/components/refresh-fleet-button'
import { TruckAvailability } from '@/components/truck-availability'
import { TruckDispatcher } from '@/components/truck-dispatcher'
import { Info } from '@/components/info'
import { companyScope, getCurrentUser } from '@/lib/session'
import { getCompany } from '@/lib/invoice'
import { dispatcherPhoneKey, getSetting, detentionTerms } from '@/lib/settings'
import { stopWindows } from '@/lib/detention'
import { stopsFrom, viaLabel } from '@/lib/stops'
import { listLoadEvents } from '@/lib/load-events'
import { DriverTimeline } from '@/components/driver-timeline'
import { QueuedLoadHint } from '@/components/queued-load-hint'
import { getLocale } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { CopyPlace } from '@/components/copy-place'
import { TruckPhoto } from '@/components/truck-photo'
import { ShowMore } from '@/components/collapse'

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
  const [loads, meta, records, todos, fleet, docs, rateCons, history, company, dispatcherPhone] = await Promise.all([
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
  // Партиалы: едут вместе с текущим в одном трейлере.
  const partials = (activeLoadsByTruck(live).get(truck.id) ?? []).filter((l) => l.id !== activeLoad?.id)
  const activeStops = activeLoad ? stopsFrom(activeLoad) : []
  const activeVia = activeLoad ? viaLabel(activeStops, locale) : null

  // Map: the truck where it sits (ELD GPS) plus a delivery pin at its active load's
  // destination city, with rough miles + drive time to it.
  // Отметки водителя — и для стоянки у склада, и чтобы карта знала, какая
  // остановка следующая.
  const driverEvents = activeLoad ? await listLoadEvents(companyId, activeLoad.id) : []
  const mapData = await loadMapData(activeLoad, truck, fs, locale, driverEvents)
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
    rest: 'text-white/70',
  }

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

      {/* ===== Шапка-баннер, как карточка товара: слева номер, водитель, где стоит;
           справа трак крупно во всю высоту шапки, за ним мягкая подсветка. На
           телефоне картинка — полосой сверху. Задание и цифры — ниже в той же
           панели. ===== */}
      <section className="panel relative mt-3 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-full bg-[radial-gradient(60%_90%_at_85%_45%,rgba(109,90,232,0.22),transparent_70%)] sm:w-3/5"
        />
        <div className="relative grid sm:grid-cols-[minmax(0,1fr)_minmax(280px,44%)]">
          <div className="min-w-0 p-4 sm:p-5">
          <h1 className="text-[22px] font-semibold leading-7 sm:text-[26px] sm:leading-8">{truck.number ?? truck.name}</h1>

          {/* One wrapping row instead of a stack of full-width lines — trailer,
              driver, phone and live GPS all read as one compact block on any width,
              wrapping to extra lines on narrow phones instead of stretching tall. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-[13px]">
            {meta?.trailerNumber && (
              <>
                <span className="text-white/55">
                  {t(locale, 'trucks.detail.trailer')} {meta.trailerNumber}
                </span>
                <span aria-hidden className="text-white/25">
                  ·
                </span>
              </>
            )}
            <span className="font-medium text-white/85">{truck.driverName || t(locale, 'trucks.detail.noDriver')}</span>
            <span aria-hidden className="hidden text-white/25 sm:inline">
              ·
            </span>
            {/* Driver contact — the number a dispatcher actually needs at hand. */}
            {meta?.driverPhone ? (
              <a
                href={`tel:${meta.driverPhone}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1 font-medium text-white/85 transition-colors hover:bg-white/12"
              >
                📞 {meta.driverPhone}
              </a>
            ) : (
              <span className="text-white/40">{t(locale, 'trucks.detail.noPhone')}</span>
            )}
          </div>
          {fs?.location && (
            /* Место — своей строкой под именем и телефоном: в общем ряду на телефоне
               кнопки «Копировать» и «Карта» уезжали на разные строки, а статус «ON»
               оставался один посреди пустоты. Место — кнопка: ответ на «где сейчас
               трак» почти всегда тут же уходит брокеру. Копируется «город, штат». */
            <div
              className={`mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] ${toneClass[statusTone(fs.driveStatus)]}`}
            >
              <CopyPlace
                text={`📍 ${fs.location}`}
                copy={cityOf(fs.location) ?? fs.location}
                coords={{ lat: fs.lat, lng: fs.lng }}
                size="sm"
              />
              {fs.driveStatus && <span className="font-semibold">· {fs.driveStatus}</span>}
            </div>
          )}

          {(meta?.vin || meta?.plate) && (
            <p className="mt-1.5 text-[11px] text-white/45">
              {[meta.plate && `${t(locale, 'trucks.detail.plateLabel')} ${meta.plate}`, meta.vin && `VIN ${meta.vin}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {/* Кто ведёт эту машину. Закрепление живёт в админке, а нужно оно здесь: на
              странице трака и спрашивают «кто им занимается». */}
          {user?.role === 'admin' ? (
            <div className="mt-2">
              <TruckDispatcher truckId={truck.id} current={dispatcherId} users={staff} />
            </div>
          ) : (
            dispatcherName && (
              <p className="mt-1.5 text-[11px] text-white/45">
                {t(locale, 'trucks.detail.dispatcher').replace('{name}', dispatcherName)}
              </p>
            )
          )}

          {/* Manual availability — dims the truck across the app and pulls it out of
              the "free" counters until it's flipped back. */}
          <div className="mt-2.5">
            <TruckAvailability truckId={truck.id} current={truck.unavailable} locale={locale} />
          </div>

        {/* ===== Current assignment: route, pickup/delivery dates, at a glance ===== */}
        <div className="mt-4 border-t border-white/8 pt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
            {t(locale, 'trucks.detail.currentAssignment')}
            <Info text={t(locale, 'trucks.detail.currentAssignmentInfo')} />
          </h2>
          {activeLoad ? (
            <>
              {/* Статус — ВПЛОТНУЮ к маршруту. justify-between отбрасывал его к правому
                  краю, и посреди строки зияла пустая полоса в пол-экрана. */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Кнопка, а не текст-ссылка: маршрут — единственный переход с трака на
                    его груз, и подчёркиванием при наведении он себя не выдавал. */}
                <Link
                  href={`/loads/${activeLoad.id}`}
                  className="group flex min-w-0 items-center gap-2 rounded-xl border border-haul-500/35 bg-haul-500/[0.10] px-3 py-1.5 transition-colors hover:border-haul-400/60 hover:bg-haul-500/20"
                >
                  <span className="truncate text-[16px] font-semibold">
                    {activeLoad.origin ?? '—'} → {activeLoad.destination ?? '—'}
                    {activeVia && <span className="ml-1.5 text-[13px] font-medium text-white/50">· {activeVia}</span>}
                  </span>
                  <span className="shrink-0 text-[14px] text-haul-300 transition-transform group-hover:translate-x-0.5">
                    ↗
                  </span>
                </Link>
                <StatusBadge status={activeLoad.status} locale={locale} />
                {activeLoad.referenceId && (
                  <span className="nums text-[12px] text-white/45">#{activeLoad.referenceId}</span>
                )}
                {activeLoad.brokerName && (
                  <span className="truncate text-[12px] text-white/45">· {activeLoad.brokerName}</span>
                )}
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-white/60 font-medium">
                    {t(locale, 'trucks.detail.pickup')}
                  </dt>
                  <dd className="font-medium text-white/85">
                    {activeLoad.pickupTime || usDate(activeLoad.pickupDate) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/60 font-medium">
                    {t(locale, 'trucks.detail.delivery')}
                  </dt>
                  <dd className="font-medium text-white/85">
                    {activeLoad.deliveryTime || usDate(activeLoad.deliveryDate) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/60 font-medium">
                    {t(locale, 'trucks.detail.rate')}
                  </dt>
                  <dd className="font-medium text-white/85">{usd.format(activeLoad.rate)}</dd>
                </div>
              </dl>
              {partials.map((p) => (
                <Link
                  key={p.id}
                  href={`/loads/${p.id}`}
                  className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-haul-500/30 bg-haul-500/[0.06] px-3 py-2 text-[13px] hover:border-haul-400/60"
                >
                  <span className="text-base leading-6 font-semibold text-haul-300">
                    {t(locale, 'trucks.detail.partialLoad')}
                  </span>
                  <span className="font-medium text-white/85">
                    {p.origin ?? '—'} → {p.destination ?? '—'}
                  </span>
                  <span className="nums text-white/50">{p.pickupTime || usDate(p.pickupDate)}</span>
                  {p.referenceId && <span className="nums text-[12px] text-white/40">#{p.referenceId}</span>}
                  {p.brokerName && <span className="truncate text-[12px] text-white/45">· {p.brokerName}</span>}
                  <span className="nums ml-auto font-medium text-white/70">{usd.format(p.rate)}</span>
                </Link>
              ))}
              {nextLoad && (
                <Link
                  href={`/loads/${nextLoad.id}`}
                  className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] hover:border-white/25"
                >
                  <span className="text-[13px] font-semibold text-white/75">
                    {t(locale, 'trucks.detail.nextLoad')}
                  </span>
                  <span className="font-medium text-white/85">
                    {nextLoad.origin ?? '—'} → {nextLoad.destination ?? '—'}
                  </span>
                  <span className="nums text-white/50">{nextLoad.pickupTime || usDate(nextLoad.pickupDate)}</span>
                  {nextLoad.referenceId && (
                    <span className="nums text-[12px] text-white/40">#{nextLoad.referenceId}</span>
                  )}
                  <span className="nums ml-auto font-medium text-white/70">{usd.format(nextLoad.rate)}</span>
                </Link>
              )}
              {nextLoad && <QueuedLoadHint compact locale={locale} current={activeLoad} next={nextLoad} />}
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-white/55">
              {/* Не просто «свободен», а ГДЕ стоит: это и есть ответ, в каком городе
                  искать ему груз. Без GPS остаётся прежняя фраза. */}
              {cityOf(fs?.location)
                ? t(locale, 'trucks.detail.idleAt').replace('{place}', cityOf(fs?.location)!)
                : t(locale, 'trucks.detail.noActiveLoad')}
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
          {/* Страница водителя — заметным блоком, а не значком в углу: пока водитель
              ссылку не открывал, блок подсвечен и зовёт её отправить. */}
          {driverLink && !activeLoad && (
            <DriverLinkButton url={driverLink} driverPhone={meta?.driverPhone ?? null} seenAt={driverSeen} />
          )}
        </div>

        {/* Цифры трака — одной компактной строкой ПОД заданием: сроки текущего рейса
            читаются раньше недельной ставки и масла. */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-white/8 pt-3">
          <Chip
            label={t(locale, 'trucks.chip.weekRate')}
            value={usd.format(weekGross)}
            tone={weekGross > 0 ? 'good' : undefined}
            info={t(locale, 'trucks.chip.weekRateInfo')}
          />
          <Chip
            label={t(locale, 'trucks.chip.rpm')}
            value={`${usd2.format(avgRpm)}`}
            info={t(locale, 'trucks.chip.rpmInfo')}
          />
          <Chip
            label={t(locale, 'trucks.chip.oilIn')}
            value={oil ? `${Math.max(0, oil.milesLeft).toLocaleString('en-US')} mi` : '—'}
            tone={oil?.tone}
            info={t(locale, 'trucks.chip.oilInInfo')}
          />
          {fs?.fuel != null && (
            <Chip
              label={t(locale, 'trucks.chip.fuel')}
              value={`${Math.round(fs.fuel)}%`}
              tone={fs.fuel <= 15 ? 'bad' : fs.fuel <= 30 ? 'warn' : undefined}
              info={t(locale, 'trucks.chip.fuelInfo')}
            />
          )}
        </div>
          </div>
          {/* Трак — во всю высоту левой колонки: шапка, задание и цифры слева, машина
              справа, пустого места под текстом больше нет. На телефоне — полосой сверху. */}
          <div className="relative h-44 max-sm:order-first sm:h-auto">
            <TruckPhoto
              fill
              truckId={truck.id}
              hasPhoto={meta?.hasTruckPhoto ?? false}
              model={meta?.truckModel ?? null}
              demo={companyId === 'demo'}
              alt={`${t(locale, 'trucks.detail.truckAlt')} ${truck.number ?? ''}`}
            />
          </div>
        </div>
      </section>

      {/* Незакрытый ремонт — прямо над картой, а не строкой в самом низу страницы: раньше
          о поломке узнавали, только домотав до «Журнала», то есть практически никогда.
          Висит, пока пункт не отметят выполненным в разделе «Нужно починить». */}
      {openTodos > 0 && (
        <a
          href="#care"
          className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
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
            <span className="text-[12px] leading-none">🔧</span>
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`text-base font-semibold leading-6 ${
                hasUrgentTodo ? 'text-bad-400' : 'text-warn-400'
              }`}
            >
              {t(locale, 'trucks.care.todoHeading')} · {openTodos}
            </p>
            <p className="mt-0.5 text-[13px] text-white/80">
              {todos
                .filter((x) => !x.doneAt)
                .slice(0, 4)
                .map((x) => (x.priority === 'urgent' ? `${x.title} (${t(locale, 'trucks.care.prioUrgent')})` : x.title))
                .join(' · ')}
              {openTodos > 4 && ` … +${openTodos - 4}`}
            </p>
          </div>
        </a>
      )}

      {/* ===== RC drop — первым делом под шапкой: рейт-кон прилетает каждый час,
          и с него начинается любая работа с траком. ===== */}
      <section className="panel mt-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
            {t(locale, 'trucks.detail.newLoadFromRc')}
            <Info text={t(locale, 'trucks.detail.newLoadFromRcInfo')} />
          </h2>
          <Link href={`/loads/new?truck=${truck.id}`} className="text-[12px] text-white/55 hover:text-white/85">
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

      {/* Порядок — по частоте: карта отвечает на «где он сейчас» одним взглядом и
          стоит первой; рейт-кон и документы прилетают каждый час; водитель и история
          пути — раз в неделю; ремонт и экономика — раз в месяц. ===== */}
      {/* Блок «Водитель» по текущему грузу — тот же, что на карточке груза:
          отметки рейса и стоянка у склада с детеншеном, над картой. */}
      {activeLoad && (
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
      )}

      {/* ===== Map: where the truck sits + where delivery is ===== */}
      {mapMarkers.length > 0 && (
        <section className="panel mt-4 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
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
      )}

      {/* ===== Trip history: drive legs + stops, long rests called out ===== */}
      {/* The window switch is client-side now — see components/trip-history-panel.tsx.
          ?history= is still honoured for the initial render so existing links keep
          working, it just isn't how the buttons change the window any more. */}
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

      {/* ===== Around the truck: loads + documents ===== */}
      {/* Высота каждой панели — по её содержимому (items-start), без внутренней
          прокрутки: список из двух файлов не тянется до высоты семи грузов, а на
          телефоне вложенный скролл не ловит палец. */}
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <section className="panel flex min-w-0 flex-col p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base leading-6 font-semibold text-white/90">
              {t(locale, 'trucks.detail.loadsHeading')}
              {active > 0 && ` · ${active} ${t(locale, 'trucks.detail.inProgress')}`}
            </h2>
            <Button href={`/loads/new?truck=${truck.id}`} size="sm" icon={<Plus size={13} strokeWidth={2.5} />}>
              {t(locale, 'trucks.detail.addLoadCta')}
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="text-[13px] text-white/55">{t(locale, 'trucks.detail.noLoadsYet')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <ShowMore limit={4} label={t(locale, 'docs.library.more')} items={rows.map(({ load, r }) => {
                const rcId = rateCons.get(load.id)
                return (
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
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-md font-medium">
                        {load.origin ?? '—'} → {load.destination ?? '—'}
                      </span>
                      <StatusBadge status={load.status} locale={locale} />
                      {rcId && (
                        <span className="relative z-10">
                          <RateConButton docId={rcId} compact />
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="nums min-w-0 truncate text-sm text-white/60">
                        {Math.round(r.totalMiles)} mi · {usd2.format(r.allInRpm)}/mi
                      </span>
                      {/* Headline is the load's actual RATE, never net — the owner reads
                          these cards as "what this load is worth". Net is the small line. */}
                      <span className="nums shrink-0 text-md font-bold">{usd.format(load.rate)}</span>
                    </div>
                  </div>
                )
              })} />
            </div>
          )}
        </section>

        <section className="panel flex min-w-0 flex-col p-4">
          <div className="mb-2">
            <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
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
              attachTargets={live.map((l) => ({
                id: l.id,
                label: `${l.origin ?? '—'} → ${l.destination ?? '—'}`,
              }))}
            />
          </div>
        </section>
      </div>

      {/* ===== Водитель — раскрыт по умолчанию (просьба пользователя): имя, телефон,
           трак/трейлер, VIN, сроки CDL и медкарты видны сразу. ===== */}
      <details open className="group panel mt-4 p-4">
        <summary className="-m-1 flex cursor-pointer list-none items-center gap-1.5 rounded-lg p-1 text-base leading-6 font-semibold text-white/90 transition-colors hover:bg-white/[0.03] hover:text-white/90">
          <span className="text-[13px] leading-none text-white/40 transition-transform duration-200 group-open:rotate-90">
            ▸
          </span>
          {t(locale, 'trucks.detail.driverHeading')}
        </summary>
        <div className="mt-3">
          <DriverCard
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
            embedded
            locale={locale}
          />
        </div>
      </details>

      {/* ===== Care: oil, to-fix, compliance dates, service log =====
           id="care" is the target of the document-deadline links on the dashboard.
           They used to point at ?tab=care — a parameter nothing has ever read, so the
           click landed at the top of the page and left the dispatcher to scroll for the
           expiry they had just clicked on. */}
      <div id="care" className="mt-4 scroll-mt-4">
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

      {/* ===== Экономика — свёрнута, но в заголовке видны все её цифры одной строкой:
           расход, дизель, оплата водителя, фиксированные в день, обслуживание,
           факторинг, диспетч. Раскрытая — форма, где всё это правится. ===== */}
      <details className="group panel mt-4 p-4">
        <summary className="-m-1 flex cursor-pointer list-none flex-wrap items-center gap-1.5 rounded-lg p-1 text-base leading-6 font-semibold text-white/90 transition-colors hover:bg-white/[0.03] hover:text-white/90">
          <span className="text-[13px] leading-none text-white/40 transition-transform duration-200 group-open:rotate-90">
            ▸
          </span>
          {t(locale, 'trucks.detail.economics')}
          <Info text={t(locale, 'trucks.detail.economicsInfo')} />
          <span className="nums flex min-w-0 basis-full flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] font-normal text-white/60 group-open:hidden sm:ml-2 sm:basis-auto">
            <span>{truck.mpg} mpg</span>
            <span aria-hidden>·</span>
            <span>{usd2.format(truck.fuelPricePerGallon)}/gal</span>
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
    </main>
  )
}

function Chip({
  label,
  value,
  tone,
  info,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'warn'
  info?: string
}) {
  const color =
    tone === 'good'
      ? 'text-good-400'
      : tone === 'bad'
        ? 'text-bad-400'
        : tone === 'warn'
          ? 'text-warn-400'
          : 'text-white'
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`nums text-[15px] font-semibold ${color}`}>{value}</span>
      <span className="flex items-center gap-1 text-xs font-medium text-white/60">
        {label}
        {info && <Info text={info} />}
      </span>
    </div>
  )
}
