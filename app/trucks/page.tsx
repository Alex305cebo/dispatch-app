import { Plus } from 'lucide-react'
import { Button } from '@/components/button'
import { FuelPriceButton } from '@/components/fuel-price-button'
import { Suspense } from 'react'
import { EldLinks } from '@/components/eld-links'
import { EldNewTrucks } from '@/components/eld-new-trucks'
import { BoardSkeleton, FleetBoard } from './fleet-board'
import { listLoads, listTrucks } from '@/lib/loads'
import { currentLoadsByTruck } from '@/lib/map'
import { FleetHeatmap } from '@/components/fleet-heatmap'
import { CompanyTile, DriverTile, MyPhoneTile, type DirectoryCompany } from '@/components/driver-directory'
import { dispatcherPhoneKey, getSetting } from '@/lib/settings'
import { getCurrentUser } from '@/lib/session'
import { buildWorkingDays } from '@/lib/heatmap'
import { todayEt } from '@/lib/payments'
import { getCompany } from '@/lib/invoice'
import { expiries, truckMetas } from '@/lib/maintenance'
import { sql } from '@/lib/db'
import { usd, shortName, weekBounds, loadWeekAnchorMs, usDate } from '@/lib/fmt'
import { companyScope } from '@/lib/session'
import { getLocale } from '@/lib/i18n-server'
import { placeCity } from '@/lib/place'
import { t, type Locale } from '@/lib/i18n'
import { Info } from '@/components/info'
import { tileGrid } from '@/lib/tiles'
import { driverTileId, migrateDriversTile, trucksTiles } from '@/lib/tiles-core'

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
  const shareRaw = await getSetting('eld_share_tokens')
  const shareCount = shareRaw ? (JSON.parse(shareRaw) as string[]).length : 0
  const samsaraOn = (await (await import('@/lib/eld-samsara')).samsaraToken()) !== ''
  const [trucks, company, metas, fleetRaw, dispatcherPhone, dispRows] = await Promise.all([
    listTrucks(companyId),
    getCompany(),
    truckMetas(companyId),
    sql`SELECT unit, drive_status, location, odometer, fuel, driver_name FROM fleet_status`,
    // Свой номер диспетчера — в блок «Driver Info» для брокера.
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

  // Данные водителей — по маленькой плитке на каждого: ключи зависят от парка,
  // поэтому раскладку по умолчанию собирает функция, а старая единственная плитка
  // «Данные водителей» из сохранённого порядка разворачивается на своём же месте.
  const truckIds = trucks.map((truck) => truck.id)
  const directory: DirectoryCompany = {
    mc: company.mcdot.replace(/^MC[\s#-]*/i, ''),
    companyName: company.name,
    companyEmail: company.email,
    dispatcherName: user?.name ?? '',
    dispatcherPhone: dispatcherPhone ?? '',
  }
  const grid = await tileGrid('trucks', trucksTiles(truckIds), locale, (saved) =>
    migrateDriversTile(saved, truckIds),
  )

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      {/* Телефон: заголовок с цифрами на всю ширину, кнопки строкой под ним. В одну
          строку длинная «Обновить цену топлива всем тракам» уезжала за край экрана и
          зажимала заголовок в колонку шириной в слово. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{t(locale, 'trucks.page.title')}</h1>
          {/* Цифры парка ушли из этой строки в плитки над картой — их двигают и
              уменьшают, как всё остальное. Здесь остался владелец: это не число. */}
          {company.owner && (
            <p className="text-base text-t2">
              {t(locale, 'trucks.page.ownerPrefix').trim()}{' '}
              <span className="font-medium text-t1">{company.owner}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {trucks.length > 0 && <FuelPriceButton truckId={null} locale={locale} size="md" />}
          <Button href="/trucks/new" variant="primary" icon={<Plus size={15} strokeWidth={2.5} />}>
            {t(locale, 'trucks.page.addTruck')}
          </Button>
        </div>
      </div>

      {/* Вторая половина строки списка: деньги за неделю, число грузов и ближайший
          к истечению документ. Раньше ради них под списком стояла ВТОРАЯ сетка
          карточек, и один трак показывался на странице дважды. Считает страница —
          она уже держит и грузы, и паспорта траков. */}
      {/* Живая часть парка — первым делом: карта, счётчики и список «где сейчас».
          Раньше это был отдельный раздел «Трекинг», и один и тот же трак жил на двух
          экранах разными половинами. Своя Suspense-граница, потому что здесь ждут
          геокодирование и маршрутизатор: шапка и всё, что ниже, показываются сразу. */}
      <EldNewTrucks units={eldNew} />

      <Suspense fallback={<BoardSkeleton />}>
        <FleetBoard
          locale={locale}
          money={moneyByTruck}
          grid={grid}
          // Цифры парка — маленькими плитками, как на «Обзоре»: место каждой задаёт
          // TRUCKS_TILES, поэтому порядок здесь значения не имеет.
          extra={[
            {
              id: 'week-gross',
              node: (
                <div className="panel flex h-full flex-col justify-center px-3 py-2.5">
                  <div className="nums truncate text-xl leading-tight text-t1">
                    {usd.format(perTruck.reduce((sum, x) => sum + x.weekGross, 0))}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-t3">
                    {t(locale, 'trucks.page.weekGross')}
                    <Info text={t(locale, 'trucks.page.weekGrossInfo')} />
                  </div>
                </div>
              ),
            },
            {
              id: 'fleet-size',
              node: (
                <div className="panel flex h-full flex-col justify-center px-3 py-2.5">
                  <div className="nums truncate text-xl leading-tight text-t1">{trucks.length}</div>
                  <div className="mt-0.5 truncate text-xs text-t3">{t(locale, 'trucks.page.inFleet')}</div>
                </div>
              ),
            },
            {
              id: 'unavailable',
              node: (
                <div className="panel flex h-full flex-col justify-center px-3 py-2.5">
                  <div
                    className={`nums truncate text-xl leading-tight ${unavailable > 0 ? 'text-warn-400' : 'text-t1'}`}
                  >
                    {unavailable}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-t3">{t(locale, 'trucks.page.unavailable')}</div>
                </div>
              ),
            },
            // Данные водителей: свой номер, компания и по плитке на каждого водителя.
            // Всё, что спрашивает брокер, видно без единого нажатия; данные новых
            // запросов не стоят — trucks, metas и company страница уже загрузила.
            { id: 'drivers-me', node: <MyPhoneTile phone={directory.dispatcherPhone} /> },
            {
              id: 'drivers-co',
              node: (
                <CompanyTile
                  mc={directory.mc}
                  companyName={directory.companyName}
                  companyEmail={directory.companyEmail}
                />
              ),
            },
            ...trucks.map((truck) => {
              const meta = metas.get(truck.id)
              const disp = dispByTruck.get(truck.id)
              return {
                id: driverTileId(truck.id),
                node: (
                  <DriverTile
                    company={directory}
                    driver={{
                      truckId: truck.id,
                      dispatcherName: disp?.name ?? null,
                      dispatcherPhone: disp?.phone ?? null,
                      driverName: truck.driverName,
                      driverPhone: meta?.driverPhone ?? null,
                      truckNumber: truck.number,
                      trailerNumber: meta?.trailerNumber ?? null,
                      vin: meta?.vin ?? null,
                    }}
                  />
                ),
              }
            }),
          ]}
          // «Загрузка парка» — сразу под картой: кто когда освободится смотрят первым делом.
          underMap={
          <div className="mb-4">
            <FleetHeatmap
              today={todayEt()}
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
          }
          // Под карточками: подключение ELD — раз в жизни трака.
          after={
            <>
              <EldLinks
                count={shareCount + (samsaraOn ? 1 : 0)}
                eldOn={!!process.env.ELD_USERNAME}
                canEdit={user?.role === 'admin' && !user.isDemo}
              />
            </>
          }
        />
      </Suspense>
    </main>
  )
}
