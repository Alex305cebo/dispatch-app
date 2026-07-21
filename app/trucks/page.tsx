import Link from 'next/link'
import { listLoads, listTrucks } from '@/lib/loads'
import { truckLabel } from '@/lib/map'
import { getCompany } from '@/lib/invoice'
import { truckPhotoFlags, truckTrailerNumbers } from '@/lib/maintenance'
import { usd, weekStart } from '@/lib/fmt'
import { DriverAvatar } from '@/components/driver-avatar'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [trucks, company, photoIds, trailers] = await Promise.all([
    listTrucks(),
    getCompany(),
    truckPhotoFlags(),
    truckTrailerNumbers(),
  ])
  // Per-truck loads in parallel — the whole point is strict separation, so each
  // truck's money is computed only from its own loads.
  const weekBegin = weekStart()
  const perTruck = await Promise.all(
    trucks.map(async (t) => {
      const loads = (await listLoads({ truckId: t.id })).filter((l) => l.status !== 'cancelled')
      // The card headline is the week's total rate (gross) — the number the owner
      // watches — not net. Scoped to this calendar week (Mon–Mon).
      const weekGross = loads
        .filter((l) => new Date(l.createdAt).getTime() >= weekBegin)
        .reduce((s, l) => s + l.rate, 0)
      return {
        truck: t,
        count: loads.length,
        active: loads.filter((l) => l.status === 'booked' || l.status === 'in_transit').length,
        weekGross,
      }
    }),
  )

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-semibold">Траки</h1>
          <p className="text-[13px] text-white/65">
            {trucks.length} в парке
            {company.owner && (
              <>
                {' · владелец '}
                <span className="font-medium text-white/80">{company.owner}</span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/trucks/new"
          className="rounded-xl bg-haul-500 px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-haul-400"
        >
          + Трак
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {perTruck.map(({ truck, count, active, weekGross }) => (
          <Link
            key={truck.id}
            href={`/trucks/${truck.id}`}
            // min-w-0: a flex container is ALSO a grid item here (single-column grid
            // below `sm`), and grid items default to min-width:auto — meaning this
            // card's natural (unshrunk) content width was blowing out the grid track
            // past the viewport instead of the track shrinking to fit. This is the
            // actual fix; min-w-0 further down the tree only helps once the card
            // itself is allowed to shrink.
            className="panel flex min-w-0 items-center justify-between gap-4 p-4 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <DriverAvatar truckId={truck.id} name={truck.driverName} hasPhoto={photoIds.has(truck.id)} size={44} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{truckLabel(truck)}</div>
                <div className="mt-0.5 truncate text-[12px] text-white/65">
                  {trailers.has(truck.id) && <>Трейлер {trailers.get(truck.id)} · </>}
                  {count} груз(ов){active > 0 && ` · ${active} в работе`}
                </div>
              </div>
            </div>
            <div className="min-w-0 text-right">
              <div
                className={`nums whitespace-nowrap text-lg font-bold ${weekGross > 0 ? 'text-good-400' : 'text-white/40'}`}
              >
                {usd.format(weekGross)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-white/45">рейт за неделю</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
