import Link from 'next/link'
import { listLoads, listTrucks, rateConByLoad } from '@/lib/loads'
import { truckLabel, STATUSES, type TruckRecord, type LoadRecord } from '@/lib/map'
import { calcLoad, type Breakdown } from '@/lib/profit'
import { truckPhotoFlags } from '@/lib/maintenance'
import { usd, usd2 } from '@/lib/fmt'
import { StatusBadge, STATUS_LABEL } from '@/components/status'
import { RateConButton } from '@/components/ratecon-button'
import { DeleteButton } from '@/components/delete-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { deleteLoad } from '@/app/actions'

export const dynamic = 'force-dynamic'

// Same hue family as STATUS_STYLE (components/status.tsx) — a column accent, not a
// second color scheme, so the board and the badges never drift apart.
const COLUMN_ACCENT: Record<LoadRecord['status'], string> = {
  quoted: 'border-t-white/20',
  booked: 'border-t-haul-500/60',
  in_transit: 'border-t-amber-400/60',
  delivered: 'border-t-violet-400/60',
  paid: 'border-t-good-500/60',
  cancelled: 'border-t-bad-500/50',
}

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === 'board' ? 'board' : 'driver'
  const [loads, trucks, rateCons, photoIds] = await Promise.all([
    listLoads(),
    listTrucks(),
    rateConByLoad(),
    truckPhotoFlags(),
  ])
  const byId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const fallback = trucks[0]

  // One section per driver instead of one flat list — same truck resolution as
  // before (a load with no truck, or a dangling truck_id, falls back to the first
  // truck), just bucketed by the resolved truck instead of rendered inline.
  const byTruck = new Map<number, LoadRecord[]>()
  for (const l of loads) {
    const truck = (l.truckId !== null ? byId.get(l.truckId) : undefined) ?? fallback
    if (!truck) continue
    if (!byTruck.has(truck.id)) byTruck.set(truck.id, [])
    byTruck.get(truck.id)!.push(l)
  }
  // listLoads() already orders newest-first, so each bucket stays newest-first too.
  const groups = trucks
    .map((truck) => ({ truck, loads: byTruck.get(truck.id) ?? [] }))
    .filter((g) => g.loads.length > 0)

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-semibold">Грузы</h1>
          <p className="text-[13px] text-white/65">{loads.length} шт.</p>
        </div>
        <Link
          href="/loads/new"
          className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400"
        >
          + Новый
        </Link>
      </div>

      {loads.length > 0 && (
        <div className="mb-5 flex gap-1.5 border-b border-white/8">
          <ViewTab href="/loads" active={view === 'driver'}>
            По водителю
          </ViewTab>
          <ViewTab href="/loads?view=board" active={view === 'board'}>
            По статусу
          </ViewTab>
        </div>
      )}

      {loads.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-[15px] font-medium">Пока пусто</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/70">
            Добавь груз вручную или сними QR-код с DAT камерой айфона — груз приедет сюда
            вместе с аналитикой.
          </p>
        </div>
      ) : view === 'board' ? (
        <StatusBoard loads={loads} byId={byId} fallback={fallback} rateCons={rateCons} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(({ truck, loads }) => (
            <DriverGroup
              key={truck.id}
              truck={truck}
              loads={loads}
              rateCons={rateCons}
              hasPhoto={photoIds.has(truck.id)}
            />
          ))}
        </div>
      )}
    </main>
  )
}

function ViewTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
        active ? 'border-haul-500 text-white' : 'border-transparent text-white/55 hover:text-white/85'
      }`}
    >
      {children}
    </Link>
  )
}

/** The color-coded dispatch board — every load in one glance, grouped by status
 * instead of by driver, so "what's still quoted" or "what's in transit right now"
 * doesn't require opening every driver's section to count. */
function StatusBoard({
  loads,
  byId,
  fallback,
  rateCons,
}: {
  loads: LoadRecord[]
  byId: Map<number, TruckRecord>
  fallback: TruckRecord | undefined
  rateCons: Map<number, number>
}) {
  const columns = STATUSES.map((status) => ({
    status,
    loads: loads.filter((l) => l.status === status),
  })).filter((c) => c.loads.length > 0)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {columns.map(({ status, loads }) => (
        <section
          key={status}
          className={`panel border-t-2 p-3 ${COLUMN_ACCENT[status]}`}
        >
          <h2 className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/62">
            {STATUS_LABEL[status]}
            <span className="nums font-normal text-white/40">{loads.length}</span>
          </h2>
          <div className="flex flex-col gap-1.5">
            {loads.map((load) => {
              const truck = (load.truckId !== null ? byId.get(load.truckId) : undefined) ?? fallback
              const r = truck ? calcLoad(load, truck) : null
              return (
                <div key={load.id} className="flex items-center gap-2 rounded-lg border border-white/6 p-2.5">
                  <Link href={`/loads/${load.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {load.origin ?? '—'} → {load.destination ?? '—'}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-white/55">
                      {truck ? truckLabel(truck) : '—'}
                      {r && ` · чистыми ${usd.format(r.net)}`}
                    </div>
                  </Link>
                  <span className="nums shrink-0 text-[13px] font-bold">{usd.format(load.rate)}</span>
                  {rateCons.get(load.id) && <RateConButton docId={rateCons.get(load.id)!} compact />}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function DriverGroup({
  truck,
  loads,
  rateCons,
  hasPhoto,
}: {
  truck: TruckRecord
  loads: LoadRecord[]
  rateCons: Map<number, number>
  hasPhoto: boolean
}) {
  // The load that matters right now: in transit beats booked beats everything else;
  // with none active, the newest load (loads is already newest-first) stands in for
  // "last load" — either way, one load is always featured, the rest fold away.
  const active = loads.find((l) => l.status === 'in_transit') ?? loads.find((l) => l.status === 'booked')
  const featured = active ?? loads[0]!
  const rest = loads.filter((l) => l.id !== featured.id)

  return (
    <section className="panel p-4">
      <Link
        href={`/trucks/${truck.id}`}
        className="mb-3 flex items-center gap-3 transition-colors hover:text-haul-400"
      >
        <DriverAvatar truckId={truck.id} name={truck.driverName} hasPhoto={hasPhoto} size={36} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{truckLabel(truck)}</span>
        <span className="shrink-0 text-[11px] font-normal text-white/45">{loads.length} груз(ов)</span>
      </Link>

      <LoadRow load={featured} truck={truck} rcId={rateCons.get(featured.id)} />

      {rest.length > 0 && (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-[12px] font-medium text-white/55 transition-colors hover:text-white">
            <span className="text-white/40 transition-transform group-open:rotate-90">▸</span>
            Ещё {rest.length} груз(ов)
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {rest.map((l) => (
              <LoadRow key={l.id} load={l} truck={truck} rcId={rateCons.get(l.id)} />
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function LoadRow({
  load,
  truck,
  rcId,
}: {
  load: LoadRecord
  truck: TruckRecord
  rcId: number | undefined
}) {
  // Each load costs against its OWN truck. Money lives in calcLoad, not SQL.
  const r: Breakdown = calcLoad(load, truck)
  return (
    // Row is a flex container, not one big <Link>: the rate con button must
    // be a sibling of the link, never nested inside it.
    <div className="flex items-center gap-3 rounded-xl border border-white/6 p-3 transition-colors hover:border-white/15">
      <Link href={`/loads/${load.id}`} className="flex min-w-0 flex-1 items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-medium">
              {load.origin ?? '—'} → {load.destination ?? '—'}
            </span>
            <StatusBadge status={load.status} />
          </div>
          <div className="nums mt-1 text-[12px] text-white/65">
            чистыми{' '}
            <span className={r.net >= 0 ? 'text-good-400/90' : 'text-bad-400/90'}>
              {usd.format(r.net)}
            </span>{' '}
            · {Math.round(r.totalMiles)} mi · {usd2.format(r.allInRpm)}/mi
          </div>
        </div>
        <div className="nums shrink-0 text-right text-lg font-bold">{usd.format(load.rate)}</div>
      </Link>
      {rcId && <RateConButton docId={rcId} compact />}
      <DeleteButton
        action={deleteLoad}
        id={load.id}
        title={`${load.origin ?? '—'} → ${load.destination ?? '—'}`}
        note="и его расчёты удалятся насовсем."
      />
    </div>
  )
}
