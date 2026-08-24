import { cityOf } from '@/lib/maintenance-core'
import { Fuel, Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { LinkPending } from '@/components/link-pending'
import Link from 'next/link'
import { Suspense } from 'react'
import { EldLinks } from '@/components/eld-links'
import { BoardSkeleton, FleetBoard } from './fleet-board'
import { listLoads, listTrucks } from '@/lib/loads'
import { currentLoadsByTruck, truckLabel } from '@/lib/map'
import { FleetHeatmap } from '@/components/fleet-heatmap'
import { DriverDirectory } from '@/components/driver-directory'
import { dispatcherPhoneKey, getSetting } from '@/lib/settings'
import { getCurrentUser } from '@/lib/session'
import { buildWorkingDays } from '@/lib/heatmap'
import { getCompany } from '@/lib/invoice'
import {
  expiries,
  oilStatus,
  openTodoCounts,
  truckMetas,
} from '@/lib/maintenance'
import { sql } from '@/lib/db'
import { usd, shortName, weekBounds, loadWeekAnchorMs } from '@/lib/fmt'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { placeCity } from '@/lib/place'
import { t, type Locale } from '@/lib/i18n'
import { DriverAvatar } from '@/components/driver-avatar'
import { StatusBadge } from '@/components/status'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

type FS = {
  unit: string
  drive_status: string | null
  location: string | null
  odometer: number | null
  fuel: number | null
}

// Same live-status reading as the Обзор fleet cards — one visual language everywhere.
function driveDot(s: string | null): string {
  if (!s) return 'bg-white/20'
  if (/mi\/h|^d$/i.test(s)) return 'bg-good-500'
  if (/^on$/i.test(s)) return 'bg-haul-500'
  return 'bg-white/30'
}

/** «2026-08-17» → «17 авг». Год не пишем: столбец про ближайшие дни. */
function shortDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
  })
}

const unavailableLabel = (locale: Locale, status: 'repair' | 'vacation') =>
  t(locale, status === 'repair' ? 'trucks.avail.repair' : 'trucks.avail.vacation')

export default async function Page() {
  const companyId = await companyScope()
  const locale = await getLocale()
  // Без truckPhotoFlags: truckMetas уже возвращает hasPhoto по тем же строкам
  // truck_meta (lib/maintenance.ts), так что это был отдельный круг в базу за тем,
  // что и так приезжало. На главной он оправдан — там truckMetas не грузится.
  const user = await getCurrentUser()
  // Сколько ссылок Live Share заведено — подпись блока ELD, переехавшего сюда
  // вместе с картой. Одно чтение настройки, оно и так кэшируется.
  const shareRaw = await getSetting('eld_share_tokens')
  const shareCount = shareRaw ? (JSON.parse(shareRaw) as string[]).length : 0
  const [trucks, company, metas, todoCounts, fleetRaw, dispatcherPhone] = await Promise.all([
    listTrucks(companyId),
    getCompany(),
    truckMetas(companyId),
    openTodoCounts(companyId),
    sql`SELECT unit, drive_status, location, odometer, fuel FROM fleet_status`,
    // Свой номер диспетчера — в блок «Driver Info» для брокера.
    user ? getSetting(dispatcherPhoneKey(user.id)) : Promise.resolve(null),
  ])
  const byUnit = new Map((fleetRaw as FS[]).map((f) => [f.unit, f]))

  // Per-truck loads in parallel — the whole point is strict separation, so each
  // truck's money is computed only from its own loads.
  const { start: weekBegin, end: weekEnd } = weekBounds()
  const perTruck = await Promise.all(
    trucks.map(async (t) => {
      const loads = await listLoads(companyId, { truckId: t.id })
      const live = loads.filter((l) => l.status !== 'cancelled')
      // The truck's current load is already sitting in `live` — asking the DB for it
      // separately made this loop cost two round trips per truck instead of one.
      const current = currentLoadsByTruck(live).get(t.id) ?? null
      // The card headline is the week's total rate (gross) — the number the owner
      // watches — not net. Scoped to this calendar week (Mon–Mon).
      // This week's gross = loads the truck actually RAN this week (pickup date,
      // Monday→Monday), not loads entered this week. The whole point of the fix.
      const weekGross = live
        .filter((l) => {
          const ms = loadWeekAnchorMs(l.pickupDate, l.createdAt)
          return ms >= weekBegin && ms < weekEnd
        })
        .reduce((s, l) => s + l.rate, 0)
      // Utilisation grid days for this truck (shared helper — same shape on the dashboard).
      const working = buildWorkingDays(live)
      return { truck: t, count: live.length, current, weekGross, working }
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

      {/* Живая часть парка — первым делом: карта, счётчики и список «где сейчас».
          Раньше это был отдельный раздел «Трекинг», и один и тот же трак жил на двух
          экранах разными половинами. Своя Suspense-граница, потому что здесь ждут
          геокодирование и маршрутизатор: шапка и всё, что ниже, показываются сразу. */}
      <EldLinks count={shareCount} />
      <Suspense fallback={<BoardSkeleton />}>
        <FleetBoard locale={locale} />
      </Suspense>

      {/* Справочник водителей — первым делом на странице. Эти шесть полей брокер
          спрашивает в каждом звонке, а лежали они в четырёх разных местах: имя и
          номер трака на карточке, телефон, прицеп и VIN — внутри «паспорта трака»
          на странице конкретного трака, MC компании — в настройках. Данные новых
          запросов не стоят: trucks, metas и company страница уже загрузила. */}
      <DriverDirectory
        mc={company.mcdot.replace(/^MC[\s#-]*/i, '')}
        companyName={company.name}
        companyEmail={company.email}
        dispatcherName={user?.name ?? ''}
        dispatcherPhone={dispatcherPhone ?? ''}
        drivers={trucks.map((truck) => {
          const meta = metas.get(truck.id)
          return {
            truckId: truck.id,
            driverName: truck.driverName,
            driverPhone: meta?.driverPhone ?? null,
            truckNumber: truck.number,
            trailerNumber: meta?.trailerNumber ?? null,
            vin: meta?.vin ?? null,
          }
        })}
      />

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
          rows={perTruck.map(({ truck, working, current }) => {
            const fs = truck.number ? byUnit.get(truck.number) : undefined
            return {
              id: truck.id,
              label: truck.number?.trim() || truck.name,
              sub: shortName(truck.driverName),
              working,
              // Два правых столбца вместо полосы и процента: куда едет либо где
              // стоит, и когда освободится. Данные уже на странице — карточки
              // парка ниже читают ровно эти же current и byUnit.
              place: current
                ? `→ ${current.destination ?? '—'}`
                : (placeCity(fs?.location ?? null) ?? t(locale, 'trucks.card.noData')),
              when: truck.unavailable
                ? { text: unavailableLabel(locale, truck.unavailable), tone: 'off' as const }
                : current
                  ? {
                      text: current.deliveryDate
                        ? `${t(locale, 'trucks.heatmap.until')} ${shortDate(current.deliveryDate, locale)}`
                        : t(locale, 'trucks.heatmap.onLoad'),
                      tone: 'busy' as const,
                    }
                  : { text: t(locale, 'trucks.heatmap.free'), tone: 'free' as const },
            }
          })}
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
              className={`panel panel-interactive flex min-w-0 flex-col gap-2.5 p-4 ${
                off ? 'border-warn-400/25' : ''
              }`}
            >
              {/* Identity + money */}
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <DriverAvatar truckId={truck.id} name={truck.driverName} hasPhoto={metas.get(truck.id)?.hasPhoto ?? false} size={44} locale={locale} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-ink-900 ${driveDot(fs?.drive_status ?? null)}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {/* Подпись переносится по словам, а не обрезается и не выталкивает
                      соседей. Раньше на ней стояло shrink-0: с голым номером («2237»)
                      это всегда помещалось, а с водителем и прицепом строка стала
                      втрое длиннее и вылезала за край карточки поверх суммы справа.
                      Обрезать её тоже нельзя — первым бы исчез номер прицепа, ради
                      которого подпись и собрана. */}
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    {/* Водитель, трак и прицеп одной подписью — та же, что на обзоре
                        и на странице груза (lib/map.ts truckLabel). */}
                    <span className="min-w-0 break-words text-[14px] font-semibold leading-snug sm:text-[15px]">
                      {truckLabel(truck, meta?.trailerNumber)}
                    </span>
                    <LinkPending className="text-haul-400" />
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
                    {/* Водитель уехал в подпись выше — здесь осталось только место,
                        иначе имя печаталось бы дважды подряд. */}
                    📍 {placeCity(fs?.location ?? null) ?? t(locale, 'trucks.card.noData')}
                  </div>
                  {/* VIN, once the ELD has reported it (auto-filled — see lib/eld.ts).
                      Small and muted: it's the truck's legal identity for registration
                      and compliance, wanted occasionally, never the headline. */}
                  {meta?.vin && (
                    <div className="nums mt-0.5 truncate text-[10.5px] tracking-tight text-white/35">
                      VIN {meta.vin}
                    </div>
                  )}
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

              {/* Health chips — only what needs attention; a healthy truck stays clean.
                  Fuel is the exception and shows at ANY level: "how full is it" is a
                  dispatch question before it is a problem, and a chip that only appears
                  when the tank is nearly empty trains you not to look for it. */}
              {(oil || worstDoc || todos > 0 || count > 0 || fs?.fuel != null) && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {fs?.fuel != null && (
                    <span
                      title={t(locale, 'trucks.chip.fuelInfo')}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                        fs.fuel <= 15
                          ? 'bg-bad-500/15 text-bad-400'
                          : fs.fuel <= 30
                            ? 'bg-warn-400/15 text-warn-400'
                            : 'bg-white/8 text-white/70'
                      }`}
                    >
                      <Fuel size={11} strokeWidth={2.5} />
                      <span className="nums">{Math.round(fs.fuel)}%</span>
                    </span>
                  )}
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
