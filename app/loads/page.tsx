import Link from 'next/link'
import { listLoads, listTrucks, rateConByLoad } from '@/lib/loads'
import { truckLabel, type TruckRecord } from '@/lib/map'
import { calcLoad } from '@/lib/profit'
import { usd, usd2 } from '@/lib/fmt'
import { StatusBadge } from '@/components/status'
import { RateConButton } from '@/components/ratecon-button'
import { DeleteButton } from '@/components/delete-button'
import { deleteLoad } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [loads, trucks, rateCons] = await Promise.all([listLoads(), listTrucks(), rateConByLoad()])
  const byId = new Map<number, TruckRecord>(trucks.map((t) => [t.id, t]))
  const fallback = trucks[0]

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
        <div className="flex flex-col gap-2">
          {loads.map((l) => {
            // Each load costs against its OWN truck. Money lives in calcLoad, not SQL.
            const truck = (l.truckId !== null ? byId.get(l.truckId) : undefined) ?? fallback
            if (!truck) return null
            const r = calcLoad(l, truck)
            const rcId = rateCons.get(l.id)
            return (
              // Row is a flex container, not one big <Link>: the rate con button must
              // be a sibling of the link, never nested inside it.
              <div
                key={l.id}
                className="panel flex items-center gap-3 p-4 transition-colors hover:border-white/15"
              >
                <Link href={`/loads/${l.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium">
                        {l.origin ?? '—'} → {l.destination ?? '—'}
                      </span>
                      <StatusBadge status={l.status} />
                    </div>
                    <div className="nums mt-1 text-[12px] text-white/65">
                      <span className="text-white/45">{truckLabel(truck)}</span> · чистыми{' '}
                      <span className={r.net >= 0 ? 'text-good-400/90' : 'text-bad-400/90'}>
                        {usd.format(r.net)}
                      </span>{' '}
                      · {Math.round(r.totalMiles)} mi · {usd2.format(r.allInRpm)}/mi
                    </div>
                  </div>
                  <div className="nums shrink-0 text-right text-lg font-bold">{usd.format(l.rate)}</div>
                </Link>
                {rcId && <RateConButton docId={rcId} compact />}
                <DeleteButton
                  action={deleteLoad}
                  id={l.id}
                  title={`${l.origin ?? '—'} → ${l.destination ?? '—'}`}
                  note="и его расчёты удалятся насовсем."
                />
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
