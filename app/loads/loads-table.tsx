'use client'

// Список «Грузов» — одной таблицей, как «Статус траков» на образце SmartHop (владелец,
// 13/10/26: «мне понравился новый вид, переделай всё»). Строка — груз: маршрут, водитель,
// статус плашкой, полоса рейса из трёх шагов с ближайшей остановкой, ставка и кнопка RC.
// До этого каждый водитель был отдельной карточкой с грузами внутри: десять карточек
// подряд, и колонки у грузов не совпадали — глаз не шёл по столбцу ставок.
//
// На телефоне строка складывается: маршрут и статус сверху, под ними водитель, полоса
// рейса и деньги. Шапка колонок — только там, где колонки есть.

import Link from 'next/link'
import { Info } from '@/components/info'
import { RateConButton } from '@/components/ratecon-button'
import { DeleteButton } from '@/components/delete-button'
import { DriverAvatar } from '@/components/driver-avatar'
import { StatusBadge } from '@/components/status'
import { PriorityChip } from '@/components/priority-picker'
import { DeadheadFlag } from '@/components/deadhead-flag'
import { RateBadge } from '@/components/analysis'
import { TripSteps } from '@/components/today-cards'
import { ShowMore } from '@/components/collapse'
import { deleteLoad } from '@/app/actions'
import { currentLoadsByTruck, nextLoadsByTruck, type LoadRecord, type TruckRecord } from '@/lib/map'
import { marketVerdict, pctText } from '@/lib/dat-market-core'
import { driveTime, shortName, usd, usd2, usDate } from '@/lib/fmt'
import { scheduleConnection, whenText } from '@/lib/loads-dashboard'
import { stopsFrom } from '@/lib/stops'
import { t, type Locale } from '@/lib/i18n'
import type { LoadMetrics } from '@/components/loads-toolbar'

/** Колонки на компьютере: груз · водитель · статус · рейс · ставка · кнопки. */
/** Статус шире, чем нужно плашке: под ней ещё «Опаздывает · 70ч 28м» одной строкой. */
const COLS = 'lg:grid lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(9rem,1.15fr)_minmax(0,1.6fr)_minmax(0,1fr)_4.5rem] lg:gap-x-4'

/** Сколько шагов рейса пройдено: забукирован — 1, в пути — 2, доставлен — 3. */
const STEPS: Record<LoadRecord['status'], number | null> = {
  quoted: 0,
  booked: 1,
  in_transit: 2,
  delivered: 3,
  paid: 3,
  cancelled: null,
}

export function LoadsTable({
  loads,
  allLoads,
  trucks,
  metrics,
  rateCons,
  photoIds,
  locale,
}: {
  /** Что показать — после поиска, фильтра и сортировки. */
  loads: LoadRecord[]
  /** Все грузы без фильтров: по ним решается, есть ли у трака следующий рейс. */
  allLoads: LoadRecord[]
  trucks: TruckRecord[]
  metrics: Record<number, LoadMetrics>
  rateCons: Map<number, number>
  photoIds: Set<number>
  locale: Locale
}) {
  const byId = new Map(trucks.map((tr) => [tr.id, tr]))
  // Текущий и следующий рейс каждого трака — по ВСЕМ грузам: фильтр «В работе» не
  // должен делать вид, что следующего груза нет, только потому что он скрыт.
  const current = currentLoadsByTruck(allLoads)
  const next = nextLoadsByTruck(allLoads)
  const steps: [string, string, string] = [t(locale, 'today.step.booked'), t(locale, 'today.step.picked'), t(locale, 'today.step.delivered')]

  const rows = loads.map((load) => {
    const truck = load.truckId == null ? undefined : byId.get(load.truckId)
    const m = metrics[load.id]
    const isCurrent = truck != null && current.get(truck.id)?.id === load.id
    const nextLoad = truck != null ? next.get(truck.id) : undefined
    const cur = truck != null ? current.get(truck.id) : undefined
    return (
      <LoadLine
        key={load.id}
        load={load}
        truck={truck}
        m={m}
        rcId={rateCons.get(load.id)}
        hasPhoto={truck != null && photoIds.has(truck.id)}
        // Трак довезёт этот груз — и дальше ничего: первый, кому искать следующий.
        noNext={isCurrent && !nextLoad}
        // Следующий рейс начинается раньше, чем кончится текущий, — даты не сходятся.
        overlap={nextLoad?.id === load.id && cur != null && scheduleConnection(cur, load) === 'overlap'}
        steps={steps}
        locale={locale}
      />
    )
  })

  return (
    <div className="panel overflow-hidden p-0">
      <div className={`${COLS} hidden border-b border-white/8 px-4 py-2.5 text-xs font-medium text-t3`}>
        <span>{t(locale, 'loads.col.load')}</span>
        <span>{t(locale, 'today.col.driver')}</span>
        <span>{t(locale, 'today.col.status')}</span>
        <span className="flex items-center gap-1">
          {t(locale, 'today.col.trip')}
          <Info text={steps.join(' → ')} />
        </span>
        <span className="text-right">{t(locale, 'loads.col.rate')}</span>
        <span />
      </div>
      {/* Длинный список («Завершённые», «Все») — порциями: сорок строк подряд уводят
          страницу на пять экранов вниз. */}
      <ShowMore limit={25} label={t(locale, 'loads.page.showMore')} items={rows} />
    </div>
  )
}

function LoadLine({
  load,
  truck,
  m,
  rcId,
  hasPhoto,
  noNext,
  overlap,
  steps,
  locale,
}: {
  load: LoadRecord
  truck: TruckRecord | undefined
  m: LoadMetrics | undefined
  rcId: number | undefined
  hasPhoto: boolean
  noNext: boolean
  overlap: boolean
  steps: [string, string, string]
  locale: Locale
}) {
  const route = `${load.origin ?? '—'} → ${load.destination ?? '—'}`
  const meta = [load.referenceId ? `#${load.referenceId}` : null, load.brokerName].filter(Boolean).join(' · ')
  const totalMiles = load.loadedMiles + load.deadheadMiles
  const late = m?.lateMin != null ? `${t(locale, 'loads.dash.late')} · ${driveTime(m.lateMin, locale)}` : null

  // Подпись под полосой рейса — что дальше по этому грузу: куда, и строкой ниже когда.
  // Одной строкой дата обрезалась на полуслове («10/10/26 16:…»).
  // У «Букинга» ближайшей остановки ещё нет (рейс не открыт) — тогда показываем погрузку.
  const stop = m?.nextStop ?? (load.status === 'quoted' ? stopsFrom(load)[0] : null)
  // У довезённого — только дата доставки: «Оплачен»/«Доставлен» уже сказала плашка
  // статуса рядом, второй раз то же слово — лишний текст. Нет POD — сказать словами.
  const delivered = { text: usDate(load.deliveryDate) || '—', title: t(locale, 'loads.dash.deliveredOn').replace('{date}', usDate(load.deliveryDate) || '—'), cls: 'nums text-t3' }
  const caption: { text: string; when?: string; title?: string; cls: string } | null =
    load.status === 'paid' || (load.status === 'delivered' && m?.hasPod)
      ? delivered
      : load.status === 'delivered'
        ? { text: t(locale, 'loads.filter.noPod'), cls: 'text-warn-400' }
        : stop
          ? {
              text: `${t(locale, stop.role === 'pickup' ? 'stops.pickup' : 'stops.delivery')} · ${stop.city ?? stop.address ?? '—'}`,
              when: whenText(stop.date, stop.time, t(locale, 'loads.dash.noDate'), t(locale, 'loads.dash.noTime')),
              cls: 'text-t2',
            }
          : null

  // Ставка против рынка (вписанного в груз или DAT по региону погрузки) — по гружёным милям.
  const market =
    m?.market && load.loadedMiles > 0 && load.rate > 0 ? marketVerdict(load.rate / load.loadedMiles, m.market) : null

  return (
    <div className={`relative border-t border-white/[0.07] px-4 py-3 transition-colors first:border-t-0 hover:bg-white/[0.025] ${COLS} lg:items-center`}>
      {/* Груз: маршрут — ссылка на карточку; на телефоне справа от него статус. */}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/loads/${load.id}`} className="break-words text-base font-semibold leading-snug text-t1 hover:text-haul-400">
            {route}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-t3">
            {meta && <span className="min-w-0 break-words">{meta}</span>}
            {load.partial && (
              <span className="rounded-md bg-haul-500/15 px-1.5 py-0.5 text-2xs font-semibold text-haul-300">{t(locale, 'loads.dash.partial')}</span>
            )}
            <PriorityChip priority={load.priority} locale={locale} />
            <DeadheadFlag miles={load.deadheadMiles} okMiles={load.deadheadOkMiles} locale={locale} />
          </div>
        </div>
        <span className="shrink-0 lg:hidden">
          <StatusBadge status={load.status} locale={locale} />
        </span>
      </div>

      {/* Водитель и трак — ссылка на карточку трака. */}
      <div className="mt-2 min-w-0 lg:mt-0">
        {truck ? (
          <Link href={`/trucks/${truck.id}`} className="flex min-w-0 items-center gap-2 hover:text-haul-400">
            <DriverAvatar truckId={truck.id} name={truck.driverName} hasPhoto={hasPhoto} size={26} locale={locale} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-t1">{shortName(truck.driverName) || truck.name}</span>
              <span className="nums block truncate text-xs text-t3">{truck.number?.trim() || truck.name}</span>
            </span>
          </Link>
        ) : (
          <span className="text-sm font-medium text-warn-400">{t(locale, 'loads.dash.unassigned')}</span>
        )}
      </div>

      {/* Статус — своя колонка на компьютере; опоздание — красной плашкой под ним. */}
      <div className="hidden min-w-0 flex-col items-start gap-1 lg:flex">
        <StatusBadge status={load.status} locale={locale} />
        {late && <span className="nums whitespace-nowrap rounded-full bg-bad-500/15 px-2 py-0.5 text-2xs font-semibold text-bad-400">{late}</span>}
      </div>

      {/* Рейс: три шага полосой и что дальше. */}
      <div className="mt-2.5 min-w-0 lg:mt-0">
        <TripSteps steps={STEPS[load.status]} labels={steps} />
        {caption && (
          <div className="mt-1.5 text-xs" title={caption.title ?? (caption.when ? `${caption.text} · ${caption.when}` : caption.text)}>
            <div className={`truncate font-medium ${caption.cls}`}>{caption.text}</div>
            {caption.when && <div className="nums truncate text-t3">{caption.when}</div>}
          </div>
        )}
        {(late || noNext || overlap) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {late && <span className="rounded-full bg-bad-500/15 px-2 py-0.5 text-2xs font-semibold text-bad-400 lg:hidden">{late}</span>}
            {overlap && (
              <span className="rounded-full bg-bad-500/15 px-2 py-0.5 text-2xs font-semibold text-bad-400">{t(locale, 'loads.dash.overlapShort')}</span>
            )}
            {noNext && (
              <span
                className="rounded-full bg-warn-400/15 px-2 py-0.5 text-2xs font-semibold text-warn-400"
                title={`${t(locale, 'loads.dash.noNext')} · ${load.destination ?? '—'} · ${usDate(load.deliveryDate) || t(locale, 'loads.dash.noDate')}`}
              >
                {t(locale, 'loads.dash.noNextShort')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Ставка: сумма крупно, под ней мили и $/mi, рядом — к рынку. На телефоне — одной
          строкой слева, кнопки справа. */}
      <div className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 pr-20 lg:mt-0 lg:block lg:pr-0 lg:text-right">
        <span className="nums text-md font-bold text-t1">{usd.format(load.rate)}</span>
        <span className="nums text-xs text-t3 lg:block">
          {Math.round(totalMiles).toLocaleString('en-US')} mi · {usd2.format(totalMiles > 0 ? load.rate / totalMiles : 0)}/mi
        </span>
        {market && (
          <span
            className={`nums mt-0.5 inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
              market.tone === 'good' ? 'bg-good-500/15 text-good-400' : market.tone === 'bad' ? 'bg-bad-500/15 text-bad-400' : 'bg-white/8 text-t2'
            }`}
          >
            {t(locale, 'loads.dash.vsMarket').replace('{pct}', pctText(market.diff))}
          </span>
        )}
        <RateBadge rc={m?.rc} />
      </div>

      {/* RC и удалить — внизу справа на телефоне, последней колонкой на компьютере.
          Нет Rate Con у груза в работе — пунктирное «RC —» на том же месте: без него
          не выставить счёт, а пустое место такого не скажет. Ведёт в груз, где его грузят. */}
      <div className="absolute bottom-3 right-3 flex items-center justify-end gap-1 lg:static">
        {rcId != null ? (
          <RateConButton docId={rcId} compact />
        ) : (
          !m?.hasRc &&
          load.status !== 'quoted' &&
          load.status !== 'cancelled' && (
            <Link
              href={`/loads/${load.id}`}
              title={t(locale, 'actions.noRcAttached')}
              className="flex min-h-9 shrink-0 items-center rounded-lg border border-dashed border-white/15 px-2.5 text-xs font-semibold text-t3 transition-colors hover:border-haul-500 hover:text-haul-400 max-md:min-h-11"
            >
              RC —
            </Link>
          )
        )}
        <DeleteButton action={deleteLoad} id={load.id} title={route} note={t(locale, 'loads.page.deleteNote')} />
      </div>
    </div>
  )
}
