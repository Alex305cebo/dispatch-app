import Link from 'next/link'
import {
  currentLoadForTruck,
  listLoads,
  listReceivables,
  listTrucks,
  listUninvoicedDelivered,
  rateConByLoad,
} from '@/lib/loads'
import { truckLabel, type TruckRecord } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { sql } from '@/lib/db'
import { deliveryInfo } from '@/lib/geo-routing'
import { fleetExpiryAlerts, truckPhotoFlags, truckTrailerNumbers } from '@/lib/maintenance'
import { companyScope, getCurrentUser } from '@/lib/session'
import { can } from '@/lib/capabilities-server'
import { usd, usd2, driveTime, weekStart } from '@/lib/fmt'
import { StatusBadge } from '@/components/status'
import { RateConButton } from '@/components/ratecon-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

type FS = { unit: string; drive_status: string | null; location: string | null; lat: number | null; lng: number | null }

// HOS isn't connected (Live Share gives GPS only), so the dot shows the LIVE drive
// status instead of stale hours: rolling = green, on-duty = blue, else muted.
function driveDot(s: string | null): string {
  if (!s) return 'bg-white/20'
  if (/mi\/h|^d$/i.test(s)) return 'bg-good-500'
  if (/^on$/i.test(s)) return 'bg-haul-500'
  return 'bg-white/30'
}

function driveDotTitle(s: string | null): string {
  if (!s) return 'Нет данных с ELD'
  if (/mi\/h|^d$/i.test(s)) return 'В движении'
  if (/^on$/i.test(s)) return 'На месте (on duty)'
  return 'Стоит'
}

// ELD gives "12.0mi N from Ashland, VA" — the card just wants "Ashland, VA".
function cityOf(location: string | null): string | null {
  if (!location) return null
  const m = location.match(/from\s+(.+)$/i)
  return m ? m[1] : location
}

export default async function Page() {
  const companyId = await companyScope()
  const user = await getCurrentUser()
  const showFinances = await can(user, 'finances')
  const [loads, trucks, fleetRaw, alerts, rateCons, photoIds, trailers, receivables, uninvoiced] =
    await Promise.all([
      listLoads(companyId),
      listTrucks(companyId),
      sql`SELECT unit, drive_status, location, lat, lng FROM fleet_status`,
      fleetExpiryAlerts(companyId),
      rateConByLoad(companyId),
      truckPhotoFlags(companyId),
      truckTrailerNumbers(companyId),
      // Only fetched when actually shown below — a dispatcher without the finances
      // capability shouldn't see money figures even loaded, not just hidden by CSS.
      showFinances ? listReceivables(companyId) : Promise.resolve([]),
      showFinances ? listUninvoicedDelivered(companyId) : Promise.resolve([]),
    ])
  const fleet = fleetRaw as FS[]
  const byId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const byUnit = new Map(fleet.map((f) => [f.unit, f]))
  const fallback = trucks[0]

  // Miles + time left to delivery, per truck — same road-routed figure as /tracking.
  const deliveryByTruck = new Map<number, { miles: number; etaMin: number; to: string }>()
  await Promise.all(
    trucks.map(async (t) => {
      const fs = t.number ? byUnit.get(t.number) : undefined
      if (!fs || fs.lat === null || fs.lng === null) return
      const load = await currentLoadForTruck(companyId, t.id)
      if (!load?.destination) return
      const dest = await deliveryInfo({ lat: fs.lat, lng: fs.lng }, load.destination)
      if (dest) deliveryByTruck.set(t.id, { miles: dest.miles, etaMin: dest.etaMin, to: load.destination })
    }),
  )

  // Each load is costed against its own truck, then summed across the fleet.
  const live = loads.filter((l) => l.status !== 'cancelled')
  const rows = live.flatMap((load) => {
    const truck = (load.truckId !== null ? byId.get(load.truckId) : undefined) ?? fallback
    return truck ? [{ load, truck, r: calcLoad(load, truck) }] : []
  })
  const totalNet = rows.reduce((s, x) => s + x.r.net, 0)
  const totalGross = rows.reduce((s, x) => s + x.r.gross, 0)
  const totalMiles = rows.reduce((s, x) => s + x.r.totalMiles, 0)
  const avgRpm = totalMiles > 0 ? rows.reduce((s, x) => s + x.r.gross, 0) / totalMiles : 0
  const active = live.filter((l) => l.status === 'booked' || l.status === 'in_transit').length
  // Trucks with nothing booked/in_transit right now — free to take a load. A truck
  // manually flagged в ремонте/отпуск isn't free either, whatever its load list says.
  const busyTruckIds = new Set(
    live.filter((l) => (l.status === 'booked' || l.status === 'in_transit') && l.truckId != null).map((l) => l.truckId),
  )
  const freeTrucks = trucks.filter((t) => !busyTruckIds.has(t.id) && !t.unavailable).length

  // Per-truck gross (rate) booked this calendar week (Mon–Mon) — replaces the useless
  // HOS % in the fleet list now that HOS isn't wired up.
  const weekBegin = weekStart()
  const weekGrossByTruck = new Map<number, number>()
  for (const l of live) {
    if (l.truckId == null || new Date(l.createdAt).getTime() < weekBegin) continue
    weekGrossByTruck.set(l.truckId, (weekGrossByTruck.get(l.truckId) ?? 0) + l.rate)
  }

  // Ждём оплаты: everything invoiced-but-unpaid, plus delivered loads with no
  // invoice yet at all — same two buckets the Финансы page's "Не оплачено" tab uses,
  // just summed to one figure for the dashboard.
  const unpaidTotal = receivables.reduce((s, r) => s + r.load.rate, 0) + uninvoiced.reduce((s, l) => s + l.rate, 0)
  const overdue = receivables.filter((r) => r.overdue)
  const overdueTotal = overdue.reduce((s, r) => s + r.load.rate, 0)

  // Важное от брокера, ещё не прочитанное — the same "must-read" flag BrokerNotes
  // highlights on the load page, surfaced here so it can't get missed by never
  // opening that particular load.
  const unreadNotes = live.filter((l) => l.brokerNotes && !l.notesReadAt)

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-semibold">Обзор</h1>
          <p className="text-[13px] text-white/65">
            {trucks.length} трак(ов) — что парк заработал и что везёт сейчас.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/loads/new"
            className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400"
          >
            + Груз
          </Link>
          <Info side="bottom" text="Добавить груз вручную. Выберешь трак, введёшь ставку и мили — приложение сразу посчитает, что груз оставит на траке чистыми." />
        </span>
      </header>

      {alerts.length > 0 && (
        <div className="mb-5 rounded-xl border border-warn-400/25 bg-warn-400/[0.06] px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-warn-400">
            Сроки документов
            <Info text="Регистрация, инспекция, страховка трака и CDL/медкарта водителя. Даты вносятся в паспорте трака (вкладка Обслуживание). Подсвечиваем за 60 дней (жёлтый) и 30 дней (красный), чтобы трак не встал out-of-service." />
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {alerts.slice(0, 6).map((a) => (
              <Link
                key={`${a.truckId}-${a.item.label}`}
                href={`/trucks/${a.truckId}?tab=care`}
                className="text-white/80 hover:underline"
              >
                <span className="text-white/50">#{a.number}</span> {a.item.label} —{' '}
                <span className={a.item.tone === 'bad' ? 'text-bad-400' : 'text-warn-400'}>
                  {a.item.daysLeft < 0 ? 'просрочено' : `${a.item.daysLeft} дн.`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {unreadNotes.length > 0 && (
        <div className="mb-5 rounded-xl border border-warn-400/25 bg-warn-400/[0.06] px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-warn-400">
            ⚠ Важное от брокера — не прочитано
            <Info text="Особые инструкции брокера (detention, аппойнтмент, требования к POD и т.д.), распознанные из rate con, которые ещё никто не отметил прочитанными на странице груза." />
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {unreadNotes.slice(0, 6).map((l) => (
              <Link key={l.id} href={`/loads/${l.id}`} className="text-white/80 hover:underline">
                {l.origin ?? '—'} → {l.destination ?? '—'}
              </Link>
            ))}
          </div>
        </div>
      )}

      {showFinances && unpaidTotal > 0 && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 ${
            overdueTotal > 0 ? 'border-bad-500/25 bg-bad-500/[0.06]' : 'border-white/8 bg-white/[0.02]'
          }`}
        >
          <p
            className={`flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider ${
              overdueTotal > 0 ? 'text-bad-400' : 'text-white/62'
            }`}
          >
            Ждём оплаты
            <Info text="Выставленные, но ещё не оплаченные счета, плюс доставленные грузы без выставленного счёта — то же, что «Не оплачено» на странице Финансы, одной цифрой." />
          </p>
          <p className="mt-1 text-[13px] text-white/80">
            <Link href="/invoices" className="nums font-semibold hover:underline">
              {usd.format(unpaidTotal)}
            </Link>
            {overdueTotal > 0 && (
              <span className="text-bad-400">
                {' '}
                — из них просрочено{' '}
                <Link href="/invoices" className="nums font-semibold hover:underline">
                  {usd.format(overdueTotal)}
                </Link>{' '}
                ({overdue.length})
              </span>
            )}
          </p>
        </div>
      )}

      {loads.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat href="/loads" label="Рейт всего" value={usd.format(totalGross)} sub={`чистыми ${usd.format(totalNet)}`} subTone={totalNet >= 0 ? 'good' : 'bad'} info="Полная ставка за все активные грузы (гросс) — самое важное: сколько всего работы взято. Снизу «чистыми» — что останется после всех расходов (топливо, водитель, фикс, обслуживание, факторинг), это доп. информация." />
          <Stat href="/trucks" label="RPM · доход на милю" value={`${usd2.format(avgRpm)}/mi`} info="RPM (rate per mile) — средний доход на милю по всему парку: общая выручка ÷ общие мили (гружёные + порожние). Главный ориентир, брать груз или нет." />
          <Stat
            href="/loads"
            label="В работе"
            value={String(active)}
            sub={trucks.length > 0 ? `${freeTrucks} свободно` : undefined}
            subTone={freeTrucks > 0 ? 'good' : undefined}
            info="Сколько грузов сейчас в статусе «забронирован» или «в пути». Снизу — сколько траков сейчас без активного груза и готовы взять новый."
          />
          <Stat href="/tracking" label="Всего миль" value={Math.round(totalMiles).toLocaleString('en-US')} info="Суммарные мили всех активных грузов — гружёные плюс порожние (deadhead)." />
        </div>
      )}

      {/* Fleet at a glance — driver + last-known ELD status, straight from the trucks. */}
      <div className="mb-2 mt-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          Парк
          <Info text="Все траки с живыми данными: где сейчас трак и сколько он заработал за неделю. Кружок слева — статус движения по GPS: зелёный едет, синий on-duty, серый стоит. Нажми на трак — вся его карточка." />
        </h2>
        <Link href="/tracking" className="text-[12px] text-haul-400 hover:underline">
          Трекинг →
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {trucks.map((t) => {
          const fs = t.number ? byUnit.get(t.number) : undefined
          const week = weekGrossByTruck.get(t.id) ?? 0
          const del = deliveryByTruck.get(t.id)
          return (
            <Link
              key={t.id}
              href={`/trucks/${t.id}`}
              // min-w-0: this card is a grid item (single column below `sm`) and grid
              // items default to min-width:auto, so its own natural content width
              // was blowing out the grid track past the viewport on narrow phones.
              className="panel flex min-w-0 flex-col gap-2.5 p-3.5 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <DriverAvatar truckId={t.id} name={t.driverName} hasPhoto={photoIds.has(t.id)} size={40} />
                  <span
                    title={driveDotTitle(fs?.drive_status ?? null)}
                    className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-ink-900 ${driveDot(fs?.drive_status ?? null)}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium">{truckLabel(t)}</span>
                    {t.unavailable && (
                      <span className="shrink-0 rounded-full bg-warn-400/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-warn-400">
                        {t.unavailable === 'repair' ? '🔧 ремонт' : '🌴 отпуск'}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12px] text-white/60">
                    {trailers.has(t.id) && <>Трейлер {trailers.get(t.id)} · </>}
                    {cityOf(fs?.location ?? null) ?? 'Нет данных с ELD'}
                  </div>
                </div>
                <div className="min-w-0 text-right">
                  <div
                    className={`nums whitespace-nowrap text-[14px] font-bold ${week > 0 ? 'text-good-400' : 'text-white/40'}`}
                  >
                    {usd.format(week)}
                  </div>
                  <div className="flex items-center justify-end gap-1 text-[9px] uppercase tracking-wider text-white/40">
                    за неделю
                    <Info text="Ставки (гросс) активных грузов этого трака за текущую календарную неделю — с понедельника." />
                  </div>
                </div>
              </div>
              {del && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5">
                  <span className="min-w-0 truncate text-[11px] text-white/55">
                    До выгрузки · <span className="text-white/75">{del.to}</span>
                  </span>
                  <span className="nums shrink-0 text-[11px] font-semibold text-white/80">
                    {del.miles} mi · ~{driveTime(del.etaMin)}
                  </span>
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {rows.length > 0 ? (
        <>
          <h2 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wider text-white/62">
            Последние грузы
          </h2>
          <div className="flex flex-col gap-2">
            {rows.slice(0, 5).map(({ load, truck, r }) => {
              const rcId = rateCons.get(load.id)
              return (
                <div
                  key={load.id}
                  className="panel flex items-center gap-3 p-4 transition-colors hover:border-white/15"
                >
                  <Link href={`/loads/${load.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium">
                          {load.origin ?? '—'} → {load.destination ?? '—'}
                        </span>
                        <StatusBadge status={load.status} />
                      </div>
                      <div className="nums mt-1 text-[12px] text-white/65">
                        <span className="text-white/45">{truckLabel(truck)}</span> · чистыми{' '}
                        <span className={r.net >= 0 ? 'text-good-400/90' : 'text-bad-400/90'}>
                          {usd.format(r.net)}
                        </span>{' '}
                        · {usd2.format(r.allInRpm)}/mi
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="nums text-[15px] font-bold">{usd.format(load.rate)}</div>
                      {load.loadedMiles > 0 && (
                        <div className="nums text-[11px] font-medium text-haul-300">
                          {Math.round(load.loadedMiles).toLocaleString('en-US')} mi
                        </div>
                      )}
                    </div>
                  </Link>
                  {rcId && <RateConButton docId={rcId} compact />}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="panel mt-6 p-6 text-center">
          <p className="text-[14px] font-medium">Грузов пока нет</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-white/65">
            Добавь груз вручную, загрузи Rate con или сними QR-код с DAT камерой айфона —
            аналитика посчитается сама.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              href="/loads/new"
              className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400"
            >
              + Груз
            </Link>
            <Link
              href="/import"
              className="rounded-xl border border-white/10 px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors hover:bg-white/5"
            >
              Rate con
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}

function Stat({
  label,
  value,
  tone,
  sub,
  subTone,
  info,
  href,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
  /** Secondary line under the big number — e.g. "чистыми $1,740". */
  sub?: string
  subTone?: 'good' | 'bad'
  info?: string
  /** Where the card leads — e.g. the loads list behind a rate total. */
  href?: string
}) {
  const body = (
    <>
      <div
        className={`nums text-xl font-bold ${
          tone === 'good' ? 'text-good-400' : tone === 'bad' ? 'text-bad-400' : ''
        }`}
      >
        {value}
      </div>
      {sub && (
        <div
          className={`nums mt-0.5 text-[11px] font-medium ${
            subTone === 'good' ? 'text-good-400/90' : subTone === 'bad' ? 'text-bad-400/90' : 'text-white/55'
          }`}
        >
          {sub}
        </div>
      )}
      <div className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/62">
        {label}
        {info && <Info text={info} />}
      </div>
    </>
  )

  if (href)
    return (
      <Link href={href} className="panel block px-4 py-3 transition-colors hover:border-white/15 hover:bg-white/[0.03]">
        {body}
      </Link>
    )
  return <div className="panel px-4 py-3">{body}</div>
}
