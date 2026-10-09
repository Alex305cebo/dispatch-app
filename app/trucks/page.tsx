import { Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { PageHeader } from '@/components/page-header'
import { Suspense } from 'react'
import { EldLinks } from '@/components/eld-links'
import { EldNewTrucks } from '@/components/eld-new-trucks'
import { BoardSkeleton, FleetBoard } from './fleet-board'
import { listLoads, listTrucks } from '@/lib/loads'
import { currentLoadsByTruck } from '@/lib/map'
import { FleetHeatmap } from '@/components/fleet-heatmap'
import type { DirectoryCompany } from '@/components/driver-directory'
import { dispatcherPhoneKey, getSetting } from '@/lib/settings'
import { getCurrentUser } from '@/lib/session'
import { buildWorkingDays, idleDays } from '@/lib/heatmap'
import { todayEt } from '@/lib/payments'
import { getCompany } from '@/lib/invoice'
import { expiries, truckMetas } from '@/lib/maintenance'
import { sql } from '@/lib/db'
import { shortName, weekBounds, loadWeekAnchorMs, usDate } from '@/lib/fmt'
import { companyScope } from '@/lib/session'
import { seesFleetGps } from '@/lib/company'
import { getLocale } from '@/lib/i18n-server'
import { placeCity } from '@/lib/place'
import { t, type Locale } from '@/lib/i18n'
import type { TruckMoney } from '@/components/fleet-list'
import { tileGrid } from '@/lib/tiles'
import { migrateTrucksTiles, TRUCKS_TILES } from '@/lib/tiles-core'

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
  void locale
  return usDate(iso.slice(0, 10)) || iso
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
  // Всё одной волной: раньше две настройки читались по очереди ДО основной пачки —
  // два лишних круга в базу перед каждым открытием «Траков».
  const [shareRaw, samsaraOn, allLoads, trucks, company, metas, fleetRaw, dispatcherPhone, dispRows] = await Promise.all([
    getSetting('eld_share_tokens'),
    import('@/lib/eld-samsara').then(async (m) => (await m.samsaraToken()) !== ''),
    // Все грузы компании одним запросом (тот же, что берёт «Доска парка» ниже, —
    // cache() отдаёт его ей без второго круга), дальше раскладываем по тракам здесь.
    listLoads(companyId),
    listTrucks(companyId),
    getCompany(),
    truckMetas(companyId),
    seesFleetGps(companyId) ? sql`SELECT unit, drive_status, location, odometer, fuel, driver_name FROM fleet_status` : Promise.resolve([]),
    // Свой номер диспетчера — в блок «Driver Info» для брокера (правится он в меню аккаунта).
    user ? getSetting(dispatcherPhoneKey(user.id)) : Promise.resolve(null),
    // Кто закреплён за каждым траком. Раньше в блоке для брокера у ВСЕХ водителей
    // стоял тот, кто открыл страницу, — а траки распределены между диспетчерами.
    // Телефон берём из настроек того же человека одним запросом, а не по одному.
    sql`SELECT t.id, u.name, s.value AS phone
        FROM trucks t
        JOIN users u ON u.id = t.dispatcher_id
        LEFT JOIN settings s ON s.key = 'disp_phone:' || u.id
        WHERE t.company_id = ${companyId}`,
  ])
  const shareCount = shareRaw ? (JSON.parse(shareRaw) as string[]).length : 0
  const dispByTruck = new Map(
    (dispRows as { id: number; name: string; phone: string | null }[]).map((r) => [
      r.id,
      { name: r.name, phone: r.phone ?? '' },
    ]),
  )
  const byUnit = new Map((fleetRaw as FS[]).map((f) => [f.unit, f]))
  // Юниты, которые ELD уже видит, а в парке их нет — новый трак заводится кнопкой.
  // Демо-юниты и демо-компанию не трогаем: у демо свой выдуманный парк.
  const known = new Set(trucks.map((t) => t.number).filter(Boolean))
  const eldNew =
    companyId === 'default'
      ? (fleetRaw as (FS & { driver_name: string | null })[])
          .filter((f) => f.unit && !f.unit.startsWith('DEMO-') && !known.has(f.unit))
          .map((f) => ({
            unit: f.unit,
            driver: f.driver_name ? f.driver_name.trim().split(/\s+/).reverse().join(' ') : null,
            location: f.location ?? null,
          }))
      : []

  // Грузы каждого трака — из общего списка по truck_id. Раньше это был отдельный
  // запрос на КАЖДЫЙ трак: на парке из 15 траков — три волны по пять (столько
  // соединений в пуле), то есть три лишних круга в базу на каждое открытие раздела.
  // Деньги трака по-прежнему считаются только из его собственных грузов.
  const loadsByTruck = new Map<number, typeof allLoads>()
  for (const l of allLoads) {
    if (l.truckId == null) continue
    const list = loadsByTruck.get(l.truckId)
    if (list) list.push(l)
    else loadsByTruck.set(l.truckId, [l])
  }
  const { start: weekBegin, end: weekEnd } = weekBounds()
  const perTruck = await Promise.all(
    trucks.map(async (t) => {
      const loads = loadsByTruck.get(t.id) ?? []
      const live = loads.filter((l) => l.status !== 'cancelled')
      // The truck's current load is already sitting in `live` — asking the DB for it
      // separately made this loop cost two round trips per truck instead of one.
      const current = currentLoadsByTruck(live).get(t.id) ?? null
      // The card headline is the week's total rate (gross) — the number the owner
      // watches — not net. Scoped to this calendar week (Mon–Mon).
      // This week's gross = loads the truck actually RAN this week (pickup date,
      // Monday→Monday), not loads entered this week. The whole point of the fix.
      // Заявки (не подтверждены) в гросс не входят — как на «Сегодня», «Грузах» и в «Деньгах»:
      // иначе «Гросс недели» на разных страницах был разной цифрой.
      const weekLoads = live.filter((l) => {
        const ms = loadWeekAnchorMs(l.pickupDate, l.createdAt)
        return l.status !== 'quoted' && ms >= weekBegin && ms < weekEnd
      })
      const weekGross = weekLoads.reduce((s, l) => s + l.rate, 0)
      // Мили тех же грузов — из них Rate per mile недели рядом с гроссом.
      const weekMiles = weekLoads.reduce((s, l) => s + l.loadedMiles + l.deadheadMiles, 0)
      // Utilisation grid days for this truck (shared helper — same shape on the dashboard).
      const working = buildWorkingDays(live)
      return { truck: t, count: live.length, current, weekGross, weekMiles, working }
    }),
  )

  // id трака → деньги, бумаги и простой. Плоский объект, а не Map: так он без потерь
  // переезжает с сервера в браузер вместе с остальными пропсами списка.
  const today = todayEt()
  const moneyByTruck: Record<number, TruckMoney> = {}
  for (const { truck, count, current, weekGross, weekMiles, working } of perTruck) {
    const meta = metas.get(truck.id) ?? null
    const worst = expiries(meta, locale).find((e) => e.tone !== 'good')
    moneyByTruck[truck.id] = {
      week: weekGross,
      miles: weekMiles,
      loads: count,
      docWarn: worst ? worst.label : null,
      // Тот же счёт, что у «Загрузки парка»: дни с последней выгрузки у свободного.
      idle: truck.unavailable || current ? null : idleDays(working, today),
    }
  }

  // Блок брокеру в строке трака: компания и тот, кто открыл страницу. Свой номер и
  // реквизиты правятся в меню аккаунта — на странице их больше нет отдельными плитками.
  const directory: DirectoryCompany = {
    mc: company.mcdot.replace(/^MC[\s#-]*/i, ''),
    companyName: company.name,
    companyEmail: company.email,
    dispatcherName: user?.name ?? '',
    dispatcherPhone: dispatcherPhone ?? '',
  }
  const dispatchers = Object.fromEntries(dispByTruck)
  const grid = await tileGrid('trucks', TRUCKS_TILES, locale, migrateTrucksTiles)

  return (
    <main className="page">
      {/* Цифры парка ушли из шапки в плитки над картой — их двигают и уменьшают, как
          всё остальное. В подписи остался владелец: это не число. */}
      <PageHeader
        title={t(locale, 'trucks.page.title')}
        subtitle={
          <>
            {t(locale, 'trucks.page.subtitle')}
            {company.owner && (
              <>
                {' · '}
                {t(locale, 'trucks.page.ownerPrefix').trim()} <span className="font-medium text-t1">{company.owner}</span>
              </>
            )}
          </>
        }
        // Одна главная кнопка (план «Порядок в TMS»). «Обновить цену дизеля» — в строке
        // над списком траков, рядом с «Обновить» GPS.
        actions={
          <Button href="/trucks/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
            {t(locale, 'trucks.page.addTruck')}
          </Button>
        }
      />

      {/* Живая часть парка: цифры, карта и список траков «где сейчас». Своя
          Suspense-граница, потому что здесь ждут геокодирование и маршрутизатор:
          шапка показывается сразу. */}
      <EldNewTrucks units={eldNew} />

      <Suspense fallback={<BoardSkeleton />}>
        <FleetBoard
          locale={locale}
          money={moneyByTruck}
          company={directory}
          dispatchers={dispatchers}
          grid={grid}
          // «Загрузка парка» — вкладка рядом со списком: кто когда освободится.
          schedule={
            <FleetHeatmap
              heading={false}
              today={today}
              rows={perTruck.map(({ truck, working, current }) => {
                const fs = truck.number ? byUnit.get(truck.number) : undefined
                return {
                  id: truck.id,
                  label: truck.number?.trim() || truck.name,
                  sub: shortName(truck.driverName),
                  working,
                  // Два правых столбца вместо полосы и процента: куда едет либо где
                  // стоит, и когда освободится.
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
          }
          // Под списком: подключение ELD — раз в жизни трака.
          after={
            <>
              {/* ELD — машины владельца; в своём кабинете диспетчера блока нет. */}
              {!user?.isWorkspace && (
                <EldLinks
                  count={shareCount + (samsaraOn ? 1 : 0)}
                  eldOn={!!process.env.ELD_USERNAME}
                  canEdit={user?.role === 'admin' && !user.isDemo}
                />
              )}
            </>
          }
        />
      </Suspense>
    </main>
  )
}
