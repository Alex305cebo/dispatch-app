import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/back-button'
import { currentLoadForTruck, getTruck, listDocs, listLoads, rateConByLoad } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { cityCoordsBest, deliveryInfoBest } from '@/lib/geo-routing'
import {
  fleetStatusByUnit,
  getTruckMeta,
  listMaintenance,
  listTodos,
  oilStatus,
} from '@/lib/maintenance'
import { headingOf, tripHistory } from '@/lib/eld'
import { driveTime, usd, usd2 } from '@/lib/fmt'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { StatusBadge } from '@/components/status'
import { TruckForm } from '@/components/truck-form'
import { TruckCare } from '@/components/truck-care'
import { DriverCard } from '@/components/driver-card'
import { TruckRcDrop } from '@/components/truck-rc-drop'
import { OrphanRateCons } from '@/components/orphan-ratecons'
import { DocList, DocUpload } from '@/components/docs'
import { RateConButton } from '@/components/ratecon-button'
import { TripHistory } from '@/components/trip-history'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

// ZigZag duty codes → colour bucket for the live badge.
function statusTone(s: string | null): 'move' | 'on' | 'rest' {
  if (!s) return 'rest'
  if (/mi\/h|^d$/i.test(s)) return 'move'
  if (/^on$/i.test(s)) return 'on'
  return 'rest'
}

// truck_position_log is pruned to 7 days on every write (lib/eld.ts) — that's the
// real ceiling on how far back "full history" can ever reach, not a UI choice.
const HISTORY_WINDOWS = [
  { hours: 24, label: '24 часа' },
  { hours: 72, label: '3 дня' },
  { hours: 168, label: '7 дней' },
] as const

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ history?: string }>
}) {
  const { id } = await params
  const truck = await getTruck(Number(id))
  if (!truck) notFound()

  const requestedHours = Number((await searchParams).history)
  const historyWindow =
    HISTORY_WINDOWS.find((w) => w.hours === requestedHours) ?? HISTORY_WINDOWS[0]

  const [loads, meta, records, todos, fleet, docs, rateCons, history] = await Promise.all([
    listLoads({ truckId: truck.id }),
    getTruckMeta(truck.id),
    listMaintenance(truck.id),
    listTodos(truck.id),
    fleetStatusByUnit(),
    listDocs({ truckId: truck.id }),
    rateConByLoad(),
    truck.number ? tripHistory(truck.number, historyWindow.hours) : Promise.resolve([]),
  ])
  const fs = truck.number ? fleet.get(truck.number) : undefined

  const live = loads.filter((l) => l.status !== 'cancelled')
  const rows = live.map((l) => ({ load: l, r: calcLoad(l, truck) }))
  const totalNet = rows.reduce((s, x) => s + x.r.net, 0)
  const totalMiles = rows.reduce((s, x) => s + x.r.totalMiles, 0)
  const avgRpm = totalMiles > 0 ? rows.reduce((s, x) => s + x.r.gross, 0) / totalMiles : 0
  const active = live.filter((l) => l.status === 'booked' || l.status === 'in_transit').length
  // Replaces the HOS chip: what this truck actually booked in the last 7 days.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const weekGross = live
    .filter((l) => new Date(l.createdAt).getTime() >= weekAgo)
    .reduce((s, l) => s + l.rate, 0)
  const openTodos = todos.filter((t) => !t.doneAt).length
  const oil = oilStatus(meta, fs?.odometer ?? null)

  // The truck's current assignment — feeds the hero's route/dates summary AND the
  // map below it, so it's fetched once, unconditionally (a truck can have an active
  // load worth showing even with no live GPS fix yet).
  const activeLoad = await currentLoadForTruck(truck.id)

  // Map: the truck where it sits (ELD GPS) plus a delivery pin at its active load's
  // destination city, with rough miles + drive time to it.
  const mapMarkers: MapMarker[] = []
  const mapRoutes: MapRoute[] = []
  const lat = fs?.lat ?? null
  const lng = fs?.lng ?? null
  if (lat != null && lng != null) {
    const heading = truck.number ? await headingOf(truck.number, lat, lng).catch(() => null) : null
    const truckM: MapMarker = {
      lat,
      lng,
      label: truck.number ?? truck.name,
      sub: [fs?.location, fs?.driveStatus].filter(Boolean).join('\n'),
      tone: statusTone(fs?.driveStatus ?? null),
      kind: 'truck',
      heading: heading ?? undefined,
    }
    // Prefer the RC's exact street address over the bare city — pins the real dock,
    // not just the city center. Falls back to ZIP then city if OSM can't resolve that
    // specific address (common for rural/warehouse addresses).
    const pickup = await cityCoordsBest(activeLoad?.pickupAddress, activeLoad?.origin)
    // Not picked up yet: the real road ahead is truck → pickup (the actual deadhead)
    // → delivery (the loaded miles) — never a straight line to delivery that skips
    // the pickup stop entirely.
    let legToPickup: Awaited<ReturnType<typeof deliveryInfoBest>> = null
    let legToDelivery: Awaited<ReturnType<typeof deliveryInfoBest>> = null
    if (activeLoad?.status === 'booked' && pickup) {
      ;[legToPickup, legToDelivery] = await Promise.all([
        deliveryInfoBest({ lat, lng }, activeLoad.pickupAddress, activeLoad.origin),
        deliveryInfoBest(pickup, activeLoad.deliveryAddress, activeLoad.destination),
      ])
    } else if (activeLoad) {
      legToDelivery = await deliveryInfoBest({ lat, lng }, activeLoad.deliveryAddress, activeLoad.destination)
    }
    if (pickup && activeLoad) {
      mapMarkers.push({
        lat: pickup.lat,
        lng: pickup.lng,
        label: `Пикап · ${activeLoad.origin}`,
        sub: [activeLoad.pickupTime || (activeLoad.pickupDate ? activeLoad.pickupDate.slice(0, 10) : null)]
          .filter(Boolean)
          .join('\n'),
        kind: 'pickup',
      })
    }
    if (legToDelivery && activeLoad) {
      const routeMiles = (legToPickup?.miles ?? 0) + legToDelivery.miles
      const routeEtaMin = (legToPickup?.etaMin ?? 0) + legToDelivery.etaMin
      truckM.eta = `${routeMiles} mi · ~${driveTime(routeEtaMin)} до delivery`
      if (legToPickup && pickup) {
        mapRoutes.push({ from: [lat, lng], to: [pickup.lat, pickup.lng], coords: legToPickup.coords })
        mapRoutes.push({
          from: [pickup.lat, pickup.lng],
          to: [legToDelivery.lat, legToDelivery.lng],
          coords: legToDelivery.coords,
        })
      } else {
        mapRoutes.push({
          from: [lat, lng],
          to: [legToDelivery.lat, legToDelivery.lng],
          coords: legToDelivery.coords,
        })
      }
      mapMarkers.push({
        lat: legToDelivery.lat,
        lng: legToDelivery.lng,
        label: `Delivery · ${activeLoad.destination}`,
        sub: activeLoad.origin ? `Из ${activeLoad.origin}` : undefined,
        kind: 'dest',
      })
    }
    mapMarkers.push(truckM)
  }

  const toneClass = {
    move: 'text-good-400',
    on: 'text-haul-400',
    rest: 'text-white/70',
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <BackButton href="/trucks" label="Все траки" />

      {/* ===== HERO: the truck in the centre, key info around it ===== */}
      <section className="relative mt-3 overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-b from-ink-800/80 to-ink-950 px-4 pt-5 pb-4 sm:px-8">
        <div className="text-center">
          <h1 className="text-[26px] font-bold leading-none">{truck.number ?? truck.name}</h1>
          {meta?.trailerNumber && (
            <p className="mt-1 text-[13px] text-white/55">Трейлер {meta.trailerNumber}</p>
          )}
          <p className="mt-1 text-[14px] text-white/70">{truck.driverName || 'Без водителя'}</p>
          {/* Driver contact — the number a dispatcher actually needs at hand. */}
          {meta?.driverPhone ? (
            <a
              href={`tel:${meta.driverPhone}`}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/12"
            >
              📞 {meta.driverPhone}
            </a>
          ) : (
            <p className="mt-1.5 text-[12px] text-white/40">
              ☎ телефон не указан — заполни ниже, в блоке «Водитель»
            </p>
          )}
          {(meta?.vin || meta?.plate) && (
            <p className="mt-1.5 text-[11px] text-white/45">
              {[meta.plate && `Номер ${meta.plate}`, meta.vin && `VIN ${meta.vin}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {fs?.location && (
            <p className={`mt-1.5 text-[13px] ${toneClass[statusTone(fs.driveStatus)]}`}>
              📍 {fs.location}
              {fs.driveStatus && ` · ${fs.driveStatus}`}
            </p>
          )}
        </div>

        <img
          src="/truck.png"
          alt={`Трак ${truck.number ?? ''}`}
          className="mx-auto my-1 w-full max-w-3xl drop-shadow-2xl"
        />

        {/* Info ring — the truck's numbers at a glance. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Chip label="Чистыми" value={usd.format(totalNet)} tone={totalNet >= 0 ? 'good' : 'bad'} />
          <Chip label="Ставка/миля" value={`${usd2.format(avgRpm)}`} />
          <Chip
            label="Рейт за неделю"
            value={usd.format(weekGross)}
            tone={weekGross > 0 ? 'good' : undefined}
          />
          <Chip
            label="Масло через"
            value={oil ? `${Math.max(0, oil.milesLeft).toLocaleString('en-US')} mi` : '—'}
            tone={oil?.tone}
          />
        </div>

        {/* ===== Current assignment: route, pickup/delivery dates, at a glance ===== */}
        <div className="mt-4 border-t border-white/8 pt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Текущее задание
            <Info text="Куда едет этот трак прямо сейчас: маршрут активного груза, когда пикап и когда delivery. Полная информация о ставке, брокере и особых условиях — по клику, на странице груза." />
          </h2>
          {activeLoad ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/loads/${activeLoad.id}`}
                  className="truncate text-[16px] font-semibold hover:text-haul-400"
                >
                  {activeLoad.origin ?? '—'} → {activeLoad.destination ?? '—'}
                </Link>
                <StatusBadge status={activeLoad.status} />
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/45">Пикап</dt>
                  <dd className="font-medium text-white/85">
                    {activeLoad.pickupTime || activeLoad.pickupDate?.slice(0, 10) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/45">Delivery</dt>
                  <dd className="font-medium text-white/85">
                    {activeLoad.deliveryTime || activeLoad.deliveryDate?.slice(0, 10) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-white/45">Ставка</dt>
                  <dd className="font-medium text-white/85">{usd.format(activeLoad.rate)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-white/55">
              Груза сейчас нет — трак свободен.
              <Link href={`/loads/new?truck=${truck.id}`} className="text-haul-400 hover:underline">
                + груз
              </Link>
            </div>
          )}
        </div>

        {/* ===== Driver: name, phone, licence dates — merged into the same card ===== */}
        <div className="mt-4 border-t border-white/8 pt-4">
          <DriverCard
            truckId={truck.id}
            name={truck.driverName}
            phone={meta?.driverPhone ?? null}
            cdlExpiry={meta?.cdlExpiry ?? null}
            medcardExpiry={meta?.medcardExpiry ?? null}
            hasPhoto={meta?.hasPhoto ?? false}
            embedded
          />
        </div>
      </section>

      {/* ===== Map: where the truck sits + where delivery is ===== */}
      {mapMarkers.length > 0 && (
        <section className="panel mt-4 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            На карте
            <Info text="Где сейчас трак (по GPS из ELD) и куда идёт доставка — точка delivery из активного груза этого трака. Линия и подпись показывают примерное расстояние и время в пути до места выгрузки." />
          </h2>
          <FleetMap markers={mapMarkers} routes={mapRoutes} height={300} />
        </section>
      )}

      {/* ===== Trip history: drive legs + stops, long rests called out ===== */}
      <details className="panel mt-4 p-4" open={history.length > 0}>
        <summary className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          История пути · {historyWindow.label}
          <Info text="Путь трака по GPS-точкам из ELD, разбитый на движение и стоянки. Остановки короче 30 минут (светофоры, пробки) не показываются — только заметные: погрузка/выгрузка, заправка, отдых. Стоянки от 6 часов подряд помечены как долгий отдых. GPS-история хранится 7 дней." />
          <span className="ml-auto flex gap-1 normal-case">
            {HISTORY_WINDOWS.map((w) => (
              <Link
                key={w.hours}
                href={w.hours === 24 ? `/trucks/${truck.id}` : `/trucks/${truck.id}?history=${w.hours}`}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  w.hours === historyWindow.hours
                    ? 'bg-haul-500/15 text-haul-400'
                    : 'text-white/45 hover:text-white/75'
                }`}
              >
                {w.label}
              </Link>
            ))}
          </span>
        </summary>
        <div className="mt-3">
          <TripHistory legs={history} />
        </div>
      </details>

      {/* ===== RC drop — the fastest path: paperwork in, load out ===== */}
      <section className="panel mt-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Новый груз из rate con
            <Info text="Перетащи сюда PDF или фото rate confirmation — ИИ распознает его, сразу создаст груз на этот трак, прикрепит документ и покажет, что проверить (detention, lumper, team, низкая ставка, брокер и т.д.). Без ручного заполнения форм." />
          </h2>
          <Link
            href={`/loads/new?truck=${truck.id}`}
            className="text-[12px] text-white/55 hover:text-white/85"
          >
            или вручную →
          </Link>
        </div>
        <TruckRcDrop truckId={truck.id} />
        <OrphanRateCons
          truckId={truck.id}
          docs={docs
            .filter((d) => d.kind === 'ratecon' && d.loadId === null)
            .map((d) => ({ id: d.id, title: d.title, uploadedAt: d.uploadedAt }))}
        />
      </section>

      {/* ===== Around the truck: loads + documents ===== */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/62">
              Грузы{active > 0 && ` · ${active} в работе`}
            </h2>
            <Link href={`/loads/new?truck=${truck.id}`} className="text-[12px] text-haul-400 hover:underline">
              + груз
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="text-[13px] text-white/55">Пока нет грузов. Загрузи rate con выше — груз создастся сам.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map(({ load, r }) => {
                const rcId = rateCons.get(load.id)
                return (
                  <div
                    key={load.id}
                    className="flex items-center gap-2 rounded-xl border border-white/6 p-3 transition-colors hover:border-white/15"
                  >
                    <Link href={`/loads/${load.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium">
                            {load.origin ?? '—'} → {load.destination ?? '—'}
                          </span>
                          <StatusBadge status={load.status} />
                        </div>
                        <div className="nums mt-0.5 text-[12px] text-white/60">
                          чистыми{' '}
                          <span className={r.net >= 0 ? 'text-good-400/90' : 'text-bad-400/90'}>
                            {usd.format(r.net)}
                          </span>{' '}
                          · {usd2.format(r.allInRpm)}/mi
                        </div>
                      </div>
                      {/* Headline is the load's actual RATE, never net — the owner reads
                          these cards as "what this load is worth". Net is the small line. */}
                      <span className="nums shrink-0 text-[14px] font-bold">
                        {usd.format(load.rate)}
                      </span>
                    </Link>
                    {rcId && <RateConButton docId={rcId} compact />}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="panel p-4">
          <div className="mb-2">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
              Документы
              <Info text="Бумаги трака: страховка, регистрация, инспекция и т.д. Плюс сюда попадают rate con и POD по его грузам. Загружай PDF или фото." />
            </h2>
          </div>
          <DocUpload truckId={truck.id} />
          <DocList docs={docs} />
        </section>
      </div>

      {/* ===== Care: oil, to-fix, compliance dates, service log ===== */}
      <div className="mt-4">
        <TruckCare
          truckId={truck.id}
          meta={meta}
          records={records}
          todos={todos}
          currentOdometer={fs?.odometer ?? null}
          oil={oil}
        />
      </div>
      {openTodos > 0 && (
        <p className="mt-2 text-center text-[12px] text-bad-400">
          Нужно починить: {openTodos} — см. раздел выше.
        </p>
      )}

      {/* ===== Economics — collapsed by default (rarely changed) ===== */}
      <details className="panel mt-4 p-4">
        <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Экономика трака (для расчёта прибыли)
          <Info text="Настройки, по которым считается прибыль каждого груза: MPG, цена дизеля, оплата водителя, фиксированные расходы, обслуживание, факторинг, диспетч. Заполняется один раз и меняется редко — поэтому спрятано." />
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
}: {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'warn'
}) {
  const color =
    tone === 'good' ? 'text-good-400' : tone === 'bad' ? 'text-bad-400' : tone === 'warn' ? 'text-warn-400' : 'text-white'
  return (
    <div className="rounded-xl border border-white/8 bg-ink-900/50 px-3 py-2 text-center backdrop-blur">
      <div className={`nums text-[16px] font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/55">{label}</div>
    </div>
  )
}
