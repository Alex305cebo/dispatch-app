import { cityOf } from '@/lib/maintenance-core'
import { Plus } from 'lucide-react'
import { Button } from '@/components/button'
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
  truckMetas,
} from '@/lib/maintenance'
import { sql } from '@/lib/db'
import { usd, shortName, weekBounds, loadWeekAnchorMs } from '@/lib/fmt'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { placeCity } from '@/lib/place'
import { t, type Locale } from '@/lib/i18n'
import { Info } from '@/components/info'

export const dynamic = 'force-dynamic'

type FS = {
  unit: string
  drive_status: string | null
  location: string | null
  odometer: number | null
  fuel: number | null
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
  const [trucks, company, metas, fleetRaw, dispatcherPhone] = await Promise.all([
    listTrucks(companyId),
    getCompany(),
    truckMetas(companyId),
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

  // id трака → деньги и бумаги. Плоский объект, а не Map: так он без потерь
  // переезжает с сервера в браузер вместе с остальными пропсами списка.
  const moneyByTruck: Record<number, { week: number; loads: number; docWarn: string | null }> = {}
  for (const { truck, count, weekGross } of perTruck) {
    const meta = metas.get(truck.id) ?? null
    const worst = expiries(meta, locale).find((e) => e.tone !== 'good')
    moneyByTruck[truck.id] = {
      week: weekGross,
      loads: count,
      docWarn: worst ? worst.label : null,
    }
  }

  // «С грузом» и «свободно» считает и показывает панель над картой — здесь остались
  // только те, кого нельзя грузить: этого числа в плитках нет.
  const unavailable = trucks.filter((t) => t.unavailable).length

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t(locale, 'trucks.page.title')}</h1>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-white/65">
            {/* Строка стояла отдельной панелью ПОД списком и повторяла плитки над
                картой: «с грузом» и «свободно» там уже есть. Здесь осталось только
                то, чего в плитках нет, — деньги парка за неделю и машины, которые
                нельзя грузить. */}
            <span className="nums font-semibold text-white/85">
              {usd.format(perTruck.reduce((sum, x) => sum + x.weekGross, 0))}
            </span>
            <span className="flex items-center gap-1">
              {t(locale, 'trucks.page.weekGross')}
              <Info text={t(locale, 'trucks.page.weekGrossInfo')} />
            </span>
            {unavailable > 0 && (
              <span className="text-warn-400">
                · {unavailable} {t(locale, 'trucks.page.unavailable')}
              </span>
            )}
            <span className="text-white/40">·</span>
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

      {/* Вторая половина строки списка: деньги за неделю, число грузов и ближайший
          к истечению документ. Раньше ради них под списком стояла ВТОРАЯ сетка
          карточек, и один трак показывался на странице дважды. Считает страница —
          она уже держит и грузы, и паспорта траков. */}
      {/* Живая часть парка — первым делом: карта, счётчики и список «где сейчас».
          Раньше это был отдельный раздел «Трекинг», и один и тот же трак жил на двух
          экранах разными половинами. Своя Suspense-граница, потому что здесь ждут
          геокодирование и маршрутизатор: шапка и всё, что ниже, показываются сразу. */}
      <EldLinks count={shareCount} />
      <Suspense fallback={<BoardSkeleton />}>
        <FleetBoard
          locale={locale}
          money={moneyByTruck}
          // Справочник водителей и календарь загрузки — сразу под картой и
          // счётчиками, ДО списка траков. Оба отвечают на вопросы, которые задают
          // раньше разбора отдельной машины: что сказать брокеру и кто когда
          // освободится. Под списком карточек их приходилось искать прокруткой.
          between={
            <>
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
            </>
          }
        />
      </Suspense>

    </main>
  )
}
