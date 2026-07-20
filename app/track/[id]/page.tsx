import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { eldStatus } from '@/lib/map'
import { agoText } from '@/lib/fmt'
import { idleSince } from '@/lib/eld'
import { FleetMap, type MapMarker } from '@/components/fleet-map'

// Public, no login — a link a dispatcher can hand to a broker/customer so they can
// watch one truck without touching the real app. Only what's needed for that: the
// truck number, its current spot, and when it was last seen. No driver, no load, no
// rate — see middleware.ts, which keeps this route in its matcher (unlike a full
// exclusion) specifically so client-supplied identity headers still get stripped here.
export const dynamic = 'force-dynamic'

type Row = { number: string | null; drive_status: string | null; location: string | null; lat: number | null; lng: number | null; updated_at: string | null }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = (await sql`
    SELECT t.number, fs.drive_status, fs.location, fs.lat, fs.lng, fs.updated_at
    FROM trucks t LEFT JOIN fleet_status fs ON fs.unit = t.number
    WHERE t.id = ${Number(id)}`) as Row[]
  const row = rows[0]
  if (!row) notFound()

  const hasFix = row.lat !== null && row.lng !== null
  const idleAt =
    hasFix && row.number ? await idleSince(row.number, row.lat!, row.lng!).catch(() => null) : null
  const idleHours = idleAt ? Math.floor((Date.now() - idleAt.getTime()) / 3_600_000) : null
  const st = eldStatus(row.drive_status, idleHours)
  const markers: MapMarker[] = hasFix
    ? [{ lat: row.lat!, lng: row.lng!, label: row.number ?? '—', sub: row.location ?? undefined, tone: st.tone, kind: 'truck' }]
    : []

  return (
    // Covers the nav: same trick as the login page — the root layout always renders
    // the company sidebar, and this link goes to people outside the company.
    <main className="fixed inset-0 z-[100] overflow-y-auto bg-ink-950 px-4 pb-20 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-[18px] font-semibold">Трак {row.number ?? '—'}</h1>
        <p className="mt-1 text-[13px] text-white/65">
          {row.location ?? 'Нет данных'} · {st.text}
          {row.updated_at && <span className="text-white/40"> · обновлено {agoText(row.updated_at)}</span>}
        </p>

        <div className="mt-4">
          {hasFix ? (
            <FleetMap markers={markers} routes={[]} />
          ) : (
            <p className="panel p-6 text-center text-[13px] text-white/55">Координаты пока не пришли.</p>
          )}
        </div>
      </div>
    </main>
  )
}
