import { Plus } from 'lucide-react'
import { Button } from '@/components/button'
import Link from 'next/link'
import { listLoads, listTrucks } from '@/lib/loads'
import { currentLoadsByTruck, truckLabel } from '@/lib/map'
import { FleetHeatmap, dayKey } from '@/components/fleet-heatmap'
import { getCompany } from '@/lib/invoice'
import {
  expiries,
  oilStatus,
  openTodoCounts,
  truckMetas,
  truckPhotoFlags,
} from '@/lib/maintenance'
import { sql } from '@/lib/db'
import { usd, weekStart } from '@/lib/fmt'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { t, type Locale } from '@/lib/i18n'
import { DriverAvatar } from '@/components/driver-avatar'
import { StatusBadge } from '@/components/status'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

type FS = { unit: string; drive_status: string | null; location: string | null; odometer: number | null }

// Same live-status reading as the Обзор fleet cards — one visual language everywhere.
function driveDot(s: string | null): string {
  if (!s) return 'bg-white/20'
  if (/mi\/h|^d$/i.test(s)) return 'bg-good-500'
  if (/^on$/i.test(s)) return 'bg-haul-500'
  return 'bg-white/30'
}

function cityOf(location: string | null): string | null {
  if (!location) return null
  const m = location.match(/from\s+(.+)$/i)
  return m ? m[1] : location
}

const unavailableLabel = (locale: Locale, status: 'repair' | 'vacation') =>
  t(locale, status === 'repair' ? 'trucks.avail.repair' : 'trucks.avail.vacation')

export default async function Page() {
  const companyId = await companyScope()
  const locale = await getLocale()
  const [trucks, company, photoIds, metas, todoCounts, fleetRaw] = await Promise.all([
    listTrucks(companyId),
    getCompany(),
    truckPhotoFlags(companyId),
    truckMetas(companyId),
    openTodoCounts(companyId),
    sql`SELECT unit, drive_status, location, odometer FROM fleet_status`,
  ])
  const byUnit = new Map((fleetRaw as FS[]).map((f) => [f.unit, f]))

  // Per-truck loads in parallel — the whole point is strict separation, so each
  // truck's money is computed only from its own loads.
  const weekBegin = weekStart()
  const perTruck = await Promise.all(
    trucks.map(async (t) => {
      const loads = await listLoads(companyId, { truckId: t.id })
      const live = loads.filter((l) => l.status !== 'cancelled')
      // The truck's current load is already sitting in `live` — asking the DB for it
      // separately made this loop cost two round trips per truck instead of one.
      const current = currentLoadsByTruck(live).get(t.id) ?? null
      // The card headline is the week's total rate (gross) — the number the owner
      // watches — not net. Scoped to this calendar week (Mon–Mon).
      const weekGross = live
        .filter((l) => new Date(l.createdAt).getTime() >= weekBegin)
        .reduce((s, l) => s + l.rate, 0)
      // Per-day money for the utilisation grid. Anchored on the PICKUP date — the day
      // the truck actually worked — falling back to when the load was entered for rows
      // whose rate con never printed one.
      const byDay = new Map<string, number>()
      for (const l of live) {
        const when = l.pickupDate ? Date.parse(`${l.pickupDate}T12:00:00`) : Date.parse(l.createdAt)
        if (Number.isNaN(when)) continue
        const k = dayKey(when)
        byDay.set(k, (byDay.get(k) ?? 0) + l.rate)
      }
      return { truck: t, count: live.length, current, weekGross, byDay }
    }),
  )

  const busy = perTruck.filter((x) => x.current).length
  const unavailable = trucks.filter((t) => t.unavailable).length
  const free = trucks.length - busy - unavailable

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t(locale, 'trucks.page.title')}</h1>
          <p className="text-[13px] text-white/65">
            {trucks.length} {t(locale, 'trucks.page.inFleet')}
            {company.owner && (
              <>
                {t(locale, 'trucks.page.ownerPrefix')}
                <span className="font-medium text-white/80">{company.owner}</span>
              </>
            )}
          </p>
        </div>
        <Button href="/trucks/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
          {t(locale, 'trucks.page.addTruck')}
        </Button>
      </div>

      {/* Fleet at a glance — the same counters a dispatcher juggles in their head. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-[12.5px]">
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="size-2 rounded-full bg-haul-500" /> {busy} {t(locale, 'trucks.page.withLoad')}
        </span>
        <span className="flex items-center gap-1.5 text-white/80">
          <span className="size-2 rounded-full bg-good-500" /> {free} {t(locale, 'trucks.page.free')}
        </span>
        {unavailable > 0 && (
          <span className="flex items-center gap-1.5 text-warn-400">
            <span className="size-2 rounded-full bg-warn-400" /> {unavailable} {t(locale, 'trucks.page.unavailable')}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-white/45">
          {t(locale, 'trucks.page.weekGross')}{' '}
          <span className="nums font-semibold text-white/85">
            {usd.format(perTruck.reduce((s, x) => s + x.weekGross, 0))}
          </span>
          <Info text={t(locale, 'trucks.page.weekGrossInfo')} />
        </span>
      </div>

      <div className="mb-4">
        <FleetHeatmap
          locale={locale}
          rows={perTruck.map(({ truck, byDay }) => ({
            id: truck.id,
            label: truck.number?.trim() || truck.name,
            byDay,
          }))}
        />
      </div>

      <div className="stagger grid gap-2.5 sm:grid-cols-2">
        {perTruck.map(({ truck, count, current, weekGross }) => {
          const fs = truck.number ? byUnit.get(truck.number) : undefined
          const meta = metas.get(truck.id) ?? null
          const oil = oilStatus(meta, fs?.odometer ?? null)
          // The one date closest to biting — same ranking the truck page's expiry
          // panel uses; green ones stay off the card (healthy is the quiet default).
          const worstDoc = expiries(meta, locale).find((e) => e.tone !== 'good')
          const todos = todoCounts.get(truck.id) ?? 0
          const off = truck.unavailable

          return (
            <Link
              key={truck.id}
              href={`/trucks/${truck.id}`}
              className={`panel flex min-w-0 flex-col gap-2.5 p-4 transition-colors hover:border-white/20 hover:bg-white/[0.03] ${
                off ? 'border-warn-400/25' : ''
              }`}
            >
              {/* Identity + money */}
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <DriverAvatar truckId={truck.id} name={truck.driverName} hasPhoto={photoIds.has(truck.id)} size={44} locale={locale} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-ink-900 ${driveDot(fs?.drive_status ?? null)}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {/* Number never truncates — it's the truck's identity. flex-wrap lets
                      the badge drop to its own line on a tight card instead of spilling
                      over the week-gross column to its right. */}
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="shrink-0 text-[15px] font-semibold">{truck.number ?? truck.name}</span>
                    {off ? (
                      <span className="shrink-0 rounded-full bg-warn-400/15 px-2 py-0.5 text-[10.5px] font-semibold text-warn-400">
                        {unavailableLabel(locale, off)}
                      </span>
                    ) : !current ? (
                      <span className="shrink-0 rounded-full bg-good-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-good-400">
                        {t(locale, 'trucks.card.available')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-white/60">
                    {truck.driverName ? `${truck.driverName} · ` : ''}
                    📍 {cityOf(fs?.location ?? null) ?? t(locale, 'trucks.card.noData')}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`nums whitespace-nowrap text-[16px] font-bold ${weekGross > 0 ? 'text-good-400' : 'text-white/40'}`}>
                    {usd.format(weekGross)}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-white/40">{t(locale, 'trucks.card.perWeek')}</div>
                </div>
              </div>

              {/* Current assignment */}
              {current && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-1.5">
                  <span className="min-w-0 truncate text-[12px] text-white/75">
                    {current.origin ?? '—'} → {current.destination ?? '—'}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={current.status} locale={locale} />
                    <span className="nums text-[12px] font-semibold text-white/80">{usd.format(current.rate)}</span>
                  </span>
                </div>
              )}

              {/* Health chips — only what needs attention; a healthy truck stays clean. */}
              {(oil || worstDoc || todos > 0 || count > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {oil && (
                    <span
                      className={`nums rounded-full px-2 py-0.5 font-medium ${
                        oil.tone === 'bad'
                          ? 'bg-bad-500/15 text-bad-400'
                          : oil.tone === 'warn'
                            ? 'bg-warn-400/15 text-warn-400'
                            : 'bg-white/6 text-white/55'
                      }`}
                    >
                      🛢 {t(locale, 'trucks.card.oilPrefix')} {Math.max(0, oil.milesLeft).toLocaleString('en-US')} mi
                    </span>
                  )}
                  {worstDoc && (
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        worstDoc.tone === 'bad' ? 'bg-bad-500/15 text-bad-400' : 'bg-warn-400/15 text-warn-400'
                      }`}
                    >
                      📄 {worstDoc.label} · {worstDoc.daysLeft < 0 ? t(locale, 'trucks.common.overdue') : `${worstDoc.daysLeft} ${t(locale, 'trucks.common.daysSuffix')}`}
                    </span>
                  )}
                  {todos > 0 && (
                    <span className="rounded-full bg-warn-400/15 px-2 py-0.5 font-medium text-warn-400">
                      🔧 {t(locale, 'trucks.card.toFix')}: {todos}
                    </span>
                  )}
                  <span className="ml-auto text-white/40">{count} {t(locale, 'trucks.card.loadsCount')}</span>
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </main>
  )
}
