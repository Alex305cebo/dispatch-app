import Link from 'next/link'
import { listLoads, listTrucks, rateConByLoad } from '@/lib/loads'
import { truckLabel, type TruckRecord, type LoadRecord } from '@/lib/map'
import { calcLoad, type Breakdown } from '@/lib/profit'
import { truckPhotoFlags } from '@/lib/maintenance'
import { usd, usd2 } from '@/lib/fmt'
import { StatusBadge } from '@/components/status'
import { RateConButton } from '@/components/ratecon-button'
import { DeleteButton } from '@/components/delete-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { deleteLoad } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function Page() {
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
      <div className="mb-6 flex items-end justify-between gap-4">
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

      {loads.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-[15px] font-medium">Пока пусто</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/70">
            Добавь груз вручную или сними QR-код с DAT камерой айфона — груз приедет сюда
            вместе с аналитикой.
          </p>
        </div>
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
