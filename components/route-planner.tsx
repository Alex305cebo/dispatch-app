'use client'

// «Куда отправить трак» на «Траках» — Route Planner сайта dispatch4you, перенесённый в
// TMS. Расчёт — lib/route-plan-core.ts. На сайте всё вводилось руками: штат, расходы на
// милю, MPG, а данные DAT обновлялись раз в неделю вручную. Здесь всё уже есть: где трак
// стоит или где выгрузится, его прицеп и его расходы, а рынок — суточным снимком DAT.
// Трак, выбранный на карте или чипом, сразу становится траком планировщика; «На карте»
// красит штаты выручкой в день из выбранного штата (components/fleet-map.tsx).

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { DollarSign, Flame, Fuel, ImagePlus, MapPin, Snowflake, TrendingDown, TrendingUp } from 'lucide-react'
import { Info } from '@/components/info'
import { Stat } from '@/components/stat'
import { Button } from '@/components/button'
import { ShowMore } from '@/components/collapse'
import { useLocale } from '@/components/locale-provider'
import type { MapPlan } from '@/components/fleet-map'
import { readBoardScreenshot } from '@/app/actions'
import { notify } from '@/lib/notify'
import { safeUploadFile } from '@/lib/upload-name'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { usd, usd2, usDate } from '@/lib/fmt'
import { US_STATES } from '@/lib/us-states'
import { heatLevel, HEAT_LEVEL_ICON, HEAT_LEVEL_KEY, ltHeat, ltMedian, ltOf, regionOf, regionStates, stateFromPlace, type DatEquipment, type DatHeat, type DatSnapshot, type DatWeek } from '@/lib/dat-market-core'
import type { TruckSettings } from '@/lib/profit'
import {
  NEXT_LEG_MILES,
  NEXT_WEIGHT,
  dayTone,
  parseBoardLoads,
  rankLanes,
  rpmForTarget,
  scoreLane,
  stateName,
  type Lane,
  type PlanOptions,
  type PlanOrigin,
} from '@/lib/route-plan-core'

export type PlanTruck = {
  id: number
  label: string
  series: DatEquipment
  settings: TruckSettings
  /** Откуда трак поедет дальше: штат стоянки у свободного, штат выгрузки у занятого. */
  state: string | null
  place: string | null
  busy: boolean
  /** Дата выгрузки текущего груза, YYYY-MM-DD. */
  until: string | null
  /** GPS свободного трака — мили первого плеча точнее, чем от середины штата. */
  ll: [number, number] | null
  unavailable: 'repair' | 'vacation' | null
}

/** Суточные снимки DAT по сериям; `date` — MM/DD/YY, отформатирован на сервере: на
 * сервере и в браузере разные пояса, и дата из миллисекунд разошлась бы при гидратации. */
export type PlanSnaps = Partial<Record<DatEquipment, DatSnapshot & { date: string }>>

type Opts = { target: number; mpd: number; deadhead: number }
const DEFAULT_OPTS: Opts = { target: 1300, mpd: 500, deadhead: 50 }
/** localStorage: цель, мили в день и порожний — привычки диспетчера, а не данные трака. */
const OPTS_KEY = 'plan:opts'
const SERIES_NAME: Record<DatEquipment, string> = { VAN: 'Van', REEFER: 'Reefer', FLATBED: 'Flatbed' }
const HEAT_KEY: Record<DatHeat, MsgKey> = { hot: 'needsLoad.heatHot', warm: 'needsLoad.heatWarm', cold: 'needsLoad.heatCold' }
const TONE_TEXT = { hit: 'text-good-400', near: 'text-warn-400', miss: 'text-bad-400' } as const
const input =
  'w-full rounded-xl border border-white/10 bg-ink-950/70 px-3 py-2 text-[14px] text-white outline-none focus:border-haul-500 max-md:min-h-11'

/** Регион DAT по-человечески: NORTHEAST → Northeast. */
function regionName(snap: DatSnapshot, state: string): string {
  const code = regionOf(snap, state)?.code ?? ''
  return code.charAt(0) + code.slice(1).toLowerCase()
}

export function useRoutePlan(trucks: PlanTruck[], snaps: PlanSnaps, selectedId: number | null) {
  const locale = useLocale()
  // С кого начать: свободный трак в строю с известным штатом — ему груз ищут прямо сейчас.
  const first = trucks.find((x) => !x.unavailable && !x.busy && x.state) ?? trucks.find((x) => x.state) ?? trucks[0] ?? null
  const seriesFor = (x: PlanTruck | null): DatEquipment | null =>
    x && snaps[x.series] ? x.series : ((Object.keys(snaps)[0] as DatEquipment | undefined) ?? null)
  const [truckId, setTruckId] = useState<number | null>(first?.id ?? null)
  const [origin, setOrigin] = useState<string | null>(first?.state ?? null)
  const [series, setSeries] = useState<DatEquipment | null>(seriesFor(first))
  const [opts, setOpts] = useState<Opts>(DEFAULT_OPTS)
  const [signal, setSignal] = useState(0)
  const truck = trucks.find((x) => x.id === truckId) ?? first

  const pickTruck = (id: number) => {
    const x = trucks.find((tr) => tr.id === id)
    if (!x) return
    setTruckId(x.id)
    if (x.state) setOrigin(x.state)
    setSeries(seriesFor(x))
  }

  // Трак, выбранный на карте или чипом, — он же в планировщике. Только на СМЕНУ выбора:
  // живое обновление страницы приносит новые пропсы, и выбор в самом планировщике не
  // должен от этого откатываться.
  const lastSelected = useRef<number | null>(null)
  useEffect(() => {
    if (selectedId === lastSelected.current) return
    lastSelected.current = selectedId
    if (selectedId != null) pickTruck(selectedId)
  })

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPTS_KEY) ?? 'null') as Partial<Opts> | null
      if (saved) setOpts((o) => ({ ...o, ...clean(saved) }))
    } catch {
      /* хранилище закрыто — умолчания */
    }
  }, [])
  const updateOpts = (patch: Partial<Opts>) =>
    setOpts((o) => {
      const next = { ...o, ...clean(patch) }
      try {
        localStorage.setItem(OPTS_KEY, JSON.stringify(next))
      } catch {
        /* не запомнится — не беда */
      }
      return next
    })

  const snap = series ? (snaps[series] ?? null) : null
  const planOpts = useMemo<PlanOptions | null>(
    () => (truck ? { settings: truck.settings, milesPerDay: opts.mpd, deadhead: opts.deadhead } : null),
    [truck, opts.mpd, opts.deadhead],
  )
  const from = useMemo<PlanOrigin | null>(
    () => (origin ? { state: origin, ll: truck && origin === truck.state ? truck.ll : null } : null),
    [origin, truck],
  )
  const lanes = useMemo(() => (snap && from && planOpts ? rankLanes(snap, from, planOpts) : []), [snap, from, planOpts])

  const mapPlan = useMemo<MapPlan | null>(() => {
    if (!origin || !lanes.length) return null
    // Шкала карты — от 60% до 120% цели, как на сайте: в слабый рынок направления ниже цели
    // всё равно различаются цветом, а не сливаются в один красный.
    return {
      origin,
      signal,
      legend: {
        title: t(locale, 'plan.map.title').replace('{state}', stateName(origin)),
        mode: t(locale, 'plan.map.modePlan').replace('{state}', origin),
        from: t(locale, 'plan.from'),
        low: usd.format(opts.target * 0.6),
        high: `${usd.format(opts.target * 1.2)}+`,
        hint: `${t(locale, 'plan.map.target').replace('{v}', usd.format(opts.target))} · ${t(locale, 'plan.map.pickHint')}`,
      },
      lanes: Object.fromEntries(
        lanes.map((l) => [
          l.state,
          {
            t: (l.grossPerDay / opts.target - 0.6) / 0.6,
            text: t(locale, 'plan.map.tip')
              .replace('{gross}', usd.format(l.grossPerDay))
              .replace('{miles}', l.miles.toLocaleString('en-US'))
              .replace('{heat}', l.ratio != null ? t(locale, HEAT_LEVEL_KEY[heatLevel(l.median, l.ratio)]) : '—'),
          },
        ]),
      ),
    }
  }, [origin, lanes, opts.target, signal, locale])

  return {
    truck,
    pickTruck,
    origin,
    setOrigin,
    series,
    setSeries,
    snap,
    opts,
    updateOpts,
    planOpts,
    from,
    lanes,
    mapPlan,
    showOnMap: () => setSignal((s) => s + 1),
  }
}

export type RoutePlan = ReturnType<typeof useRoutePlan>

/** Из хранилища и полей ввода — только положительные числа (порожний может быть 0). */
function clean(v: Partial<Opts>): Partial<Opts> {
  const out: Partial<Opts> = {}
  for (const key of ['target', 'mpd', 'deadhead'] as const) {
    const n = Number(v[key])
    if (v[key] !== undefined && Number.isFinite(n) && (key === 'deadhead' ? n >= 0 : n > 0)) out[key] = n
  }
  return out
}

function HeatTag({ heat, ratio, median, locale }: { heat: DatHeat | null; ratio: number | null; median: number; locale: Locale }) {
  if (heat !== 'hot' && heat !== 'cold') return null
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${heat === 'hot' ? 'text-good-400' : 'text-bad-400'}`}>
      {t(locale, HEAT_LEVEL_KEY[heatLevel(median, ratio)])}
    </span>
  )
}

export function RoutePlanner({ plan, trucks, snaps }: { plan: RoutePlan; trucks: PlanTruck[]; snaps: PlanSnaps }) {
  const locale = useLocale()
  const [range, setRange] = useState<'all' | 'day' | 'long'>('all')
  const { truck, origin, series, snap, opts, lanes, from, planOpts } = plan
  if (!truck) return null
  const seriesList = Object.keys(snaps) as DatEquipment[]
  const best = lanes[0] ?? null
  const worst = lanes.length > 1 ? lanes[lanes.length - 1]! : null
  const lt = snap && origin ? ltOf(snap, origin) : null
  const heat = snap && lt ? ltHeat(snap, lt.ratio) : null
  const originRpm = snap && origin ? (regionOf(snap, origin)?.rpm ?? null) : null
  const s = truck.settings
  // «На 1 день»: груз вместе с порожним укладывается в «Миль в день» из настроек расчёта.
  const shown = range === 'all' ? lanes : lanes.filter((l) => (l.miles + l.deadhead <= opts.mpd) === (range === 'day'))

  const place = truck.place
  const originLine = !place
    ? t(locale, 'plan.noPlace')
    : truck.busy
      ? truck.until
        ? t(locale, 'plan.freeOn').replace('{date}', usDate(truck.until)).replace('{place}', place)
        : t(locale, 'plan.freeIn').replace('{place}', place)
      : t(locale, 'plan.standsIn').replace('{place}', place)
  const cpm = s.fuelPricePerGallon / s.mpg + s.maintenanceCostPerMile + (s.driverPay.mode === 'cpm' ? s.driverPay.centsPerMile / 100 : 0)
  const costs =
    t(locale, 'plan.costsLine')
      .replace('{cpm}', usd2.format(cpm))
      .replace('{fixed}', usd.format(s.truckPaymentPerDay + s.insurancePerDay + s.eldPermitsPerDay)) +
    (s.driverPay.mode === 'percent' ? t(locale, 'plan.costsDriverPct').replace('{v}', String(s.driverPay.percentOfGross)) : '')
  const label = 'mb-1 block text-[11px] font-medium text-white/55'

  return (
    <section id="route-planner" className="panel mb-4 scroll-mt-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90">
          {t(locale, 'plan.title')}
          <Info text={t(locale, 'plan.info')} />
        </h2>
        {snap && <span className="nums text-[11.5px] text-white/45">{t(locale, 'loadCard.marketAsOf').replace('{when}', snap.date)}</span>}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_auto] sm:items-end">
        <label className="block min-w-0">
          <span className={label}>{t(locale, 'plan.truck')}</span>
          <select value={truck.id} onChange={(e) => plan.pickTruck(Number(e.target.value))} className={input}>
            {trucks.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={label}>{t(locale, 'plan.from')}</span>
          <select value={origin ?? ''} onChange={(e) => plan.setOrigin(e.target.value || null)} className={input}>
            <option value="">{t(locale, 'plan.pickState')}</option>
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        </label>
        {seriesList.length > 1 && (
          <div className="min-w-0">
            <span className={label}>{t(locale, 'plan.trailer')}</span>
            <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
              {seriesList.map((eq) => (
                <button
                  key={eq}
                  type="button"
                  aria-pressed={eq === series}
                  onClick={() => plan.setSeries(eq)}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors max-md:min-h-10 ${
                    eq === series ? 'bg-ink-900 text-white ring-1 ring-white/10' : 'text-white/55 hover:text-white/85'
                  }`}
                >
                  {SERIES_NAME[eq]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="mt-1.5 break-words text-[12px] text-white/55">{originLine}</p>

      <details className="group mt-2 rounded-xl border border-white/8">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-[12px] text-white/55 max-md:min-h-11">
          <span className="text-white/40 transition-transform group-open:rotate-90" aria-hidden>
            ▸
          </span>
          <span className="font-medium text-white/75">{t(locale, 'plan.settings')}</span>
          <span className="nums">
            {t(locale, 'plan.settingsSummary')
              .replace('{target}', usd.format(opts.target))
              .replace('{mpd}', String(opts.mpd))
              .replace('{dh}', String(opts.deadhead))}
          </span>
        </summary>
        <div className="grid grid-cols-1 gap-2 border-t border-white/[0.06] px-3 pt-2.5 sm:grid-cols-3">
          {(
            [
              ['target', 'plan.target', 50],
              ['mpd', 'plan.mpd', 25],
              ['deadhead', 'plan.deadhead', 10],
            ] as const
          ).map(([key, msg, step]) => (
            <label key={key} className="block min-w-0">
              <span className={label}>{t(locale, msg)}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={step}
                defaultValue={opts[key]}
                key={`${key}-${opts[key]}`}
                onBlur={(e) => plan.updateOpts({ [key]: Number(e.target.value) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') plan.updateOpts({ [key]: Number((e.target as HTMLInputElement).value) })
                }}
                className={`${input} nums`}
              />
            </label>
          ))}
        </div>
        <p className="px-3 pb-2.5 pt-2 text-[11.5px] text-white/50">
          {costs} ·{' '}
          <Link href={`/trucks/${truck.id}`} className="text-haul-400 hover:underline">
            {t(locale, 'plan.editCosts')}
          </Link>
        </p>
      </details>

      {!snap ? (
        <p className="mt-3 text-[13px] text-white/55">{t(locale, 'plan.noSnap')}</p>
      ) : !origin ? (
        <p className="mt-3 text-[13px] text-white/55">{t(locale, 'plan.noOrigin')}</p>
      ) : !lanes.length || !best ? (
        <p className="mt-3 text-[13px] text-white/55">{t(locale, 'plan.noLanes').replace('{state}', stateName(origin))}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Stat
              accent="good"
              icon={<TrendingUp size={15} strokeWidth={2.5} />}
              label={t(locale, 'plan.best')}
              value={usd.format(best.grossPerDay)}
              sub={t(locale, 'plan.inDay').replace('{state}', best.name)}
            />
            {worst && (
              <Stat
                accent="bad"
                icon={<TrendingDown size={15} strokeWidth={2.5} />}
                label={t(locale, 'plan.worst')}
                value={usd.format(worst.grossPerDay)}
                sub={t(locale, 'plan.inDay').replace('{state}', worst.name)}
              />
            )}
            <Stat
              accent={heat === 'hot' ? 'good' : heat === 'cold' ? 'bad' : 'haul'}
              icon={<Flame size={15} strokeWidth={2.5} />}
              label={t(locale, 'plan.marketIn').replace('{state}', origin)}
              value={lt && snap ? t(locale, HEAT_LEVEL_KEY[heatLevel(ltMedian(snap), lt.ratio)]) : '—'}
            />
            <Stat
              accent="haul"
              icon={<DollarSign size={15} strokeWidth={2.5} />}
              label={t(locale, 'plan.rateFrom').replace('{state}', origin)}
              value={originRpm ? `${usd2.format(originRpm)}/mi` : '—'}
              sub={t(locale, 'plan.region').replace('{region}', regionName(snap, origin))}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-white/55">
              {t(locale, 'plan.lanesFrom').replace('{state}', stateName(origin))}
            </h3>
            <Button size="sm" variant="ghost" icon={<MapPin size={13} />} onClick={plan.showOnMap}>
              {t(locale, 'plan.showOnMap')}
            </Button>
          </div>
          {/* Сверху общего списка всегда дальние штаты: на длинном рейсе погрузка и простой
              размазываются на много дней. Рейсы на один день — отдельным выбором. */}
          <div className="mt-2 flex rounded-xl border border-white/10 bg-white/[0.04] p-0.5">
            {(
              [
                ['all', 'plan.range.all'],
                ['day', 'plan.range.day'],
                ['long', 'plan.range.long'],
              ] as const
            ).map(([key, msg]) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition-colors max-md:min-h-10 ${
                  range === key ? 'bg-ink-900 text-white ring-1 ring-white/10' : 'text-white/55 hover:text-white/85'
                }`}
              >
                {t(locale, msg)}
              </button>
            ))}
          </div>
          {range === 'day' && (
            <p className="mt-1.5 text-[12px] text-white/55">{t(locale, 'plan.range.dayHint').replace('{mi}', String(opts.mpd))}</p>
          )}
          {shown.length ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <ShowMore
                key={range}
                limit={5}
                label={t(locale, 'plan.more')}
                items={shown.slice(0, 10).map((lane, i) => (
                  <LaneRow key={lane.state} lane={lane} rank={i + 1} snap={snap} origin={origin} opts={opts} settings={s} locale={locale} />
                ))}
              />
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-white/55">{t(locale, 'plan.noRange').replace('{state}', stateName(origin))}</p>
          )}
          {shown.length > 10 && (
            <p className="mt-2 text-[12px] text-white/55">
              <span className="font-semibold text-bad-400">{t(locale, 'plan.traps')}:</span>{' '}
              {shown
                .slice(-3)
                .reverse()
                .map((l) => `${l.name} (${t(locale, 'plan.perDay').replace('{v}', usd.format(l.grossPerDay))})`)
                .join(', ')}
            </p>
          )}

          {from && planOpts && <BoardCompare snap={snap} from={from} planOpts={planOpts} opts={opts} locale={locale} />}
        </>
      )}

      {snap && series && <MarketDetails snap={snap} series={series} locale={locale} />}
    </section>
  )
}

/** Рынок серии целиком — то, что на сайте было карточкой аналитики: дизель, грузы на трак
 * по стране за год, ставки регионов и под каждой — штаты региона. Раскрыт сразу; сдвиг за
 * неделю стоит рядом с тем, что сдвинулось. На телефоне регионы по три в ряд, штаты кодами. */
function MarketDetails({ snap, series, locale }: { snap: DatSnapshot & { date: string }; series: DatEquipment; locale: Locale }) {
  const trend = snap.trend
  const sub = 'text-2xs font-semibold uppercase tracking-wide text-white/55'
  return (
    <details open className="group mt-4 rounded-xl border border-white/8">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-[12px] max-md:min-h-11">
        <span className="text-white/40 transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
        <span className="font-semibold text-white/80">{t(locale, 'plan.market.title').replace('{series}', SERIES_NAME[series])}</span>
        {snap.fuel && (
          <span className="nums inline-flex items-center gap-1 text-white/70">
            <Fuel size={12} aria-hidden />
            {t(locale, 'plan.market.diesel').replace('{v}', usd2.format(snap.fuel.price))}
          </span>
        )}
      </summary>
      <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-2.5">
        {snap.history && snap.history.length > 1 && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
              <h4 className={`flex items-center gap-1.5 ${sub}`}>
                {t(locale, 'plan.market.chart')}
                <Info text={t(locale, 'plan.market.chartInfo')} />
              </h4>
              <WeekChange v={trend?.ltWoW} locale={locale} />
            </div>
            <LtChart weeks={snap.history} lastChange={trend?.ltWoW} locale={locale} />
          </div>
        )}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <h4 className={`flex items-center gap-1.5 ${sub}`}>
              {t(locale, 'plan.market.regions')}
              <Info text={t(locale, 'plan.market.regionsInfo')} />
            </h4>
            <WeekChange v={trend?.rateWoW} locale={locale} />
          </div>
          {/* Столбец на регион: ставка за милю — главная цифра, под ней штаты региона по грузам
              на трак (ставок по штатам в открытом DAT нет): 2 лучших, 2 средних, 2 худших. */}
          <div className="mt-1.5 grid grid-cols-3 gap-x-1.5 gap-y-3 sm:grid-cols-5 sm:gap-x-2">
            {snap.regions.map((r) => {
              const groups = regionStates(snap, r.states)
              const median = ltMedian(snap)
              return (
                <div key={r.code} className="min-w-0">
                  <div className="panel-inset px-2 py-1.5 sm:px-2.5">
                    <div className="truncate text-[11px] text-white/55">{r.code.charAt(0) + r.code.slice(1).toLowerCase()}</div>
                    <div className="nums text-[16px] font-bold leading-tight sm:text-[18px]">
                      {usd2.format(r.rpm)}
                      <span className="text-[11px] font-medium text-white/45">/mi</span>
                    </div>
                  </div>
                  <div className="mt-1.5 space-y-1.5 px-1">
                    {(
                      [
                        ['best', 'bg-good-400'],
                        ['middle', 'bg-white/30'],
                        ['worst', 'bg-bad-400'],
                      ] as const
                    ).map(([key, dot]) =>
                      groups[key].length ? (
                        <ul key={key} className="space-y-0.5">
                          {groups[key].map((st) => (
                            <li
                              key={st.code}
                              title={`${stateName(st.code)} · ${t(locale, HEAT_LEVEL_KEY[heatLevel(median, st.ratio)])}`}
                              className="flex items-center gap-1.5 text-[12px]"
                            >
                              <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
                              <span className="min-w-0 flex-1 truncate text-white/80">
                                <span className="lg:hidden">{st.code}</span>
                                <span className="hidden lg:inline">{stateName(st.code)}</span>
                              </span>
                              <span className="shrink-0 text-[11px]">{HEAT_LEVEL_ICON[heatLevel(median, st.ratio)]}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null,
                    )}
                  </div>
                </div>
              )
            })}
            {/* На телефоне столбцы по три, а регионов пять — место шестого пустовало. В нём
                средняя ставка по регионам и что значат точки; с sm столбцов пять, и места нет.
                ponytail: рассчитано на пять регионов DAT; при четырёх осталась бы одна дыра. */}
            {snap.regions.length % 3 !== 0 && (
              <div className="min-w-0 sm:hidden">
                <div className="panel-inset px-2 py-1.5">
                  <div className="truncate text-[11px] text-white/55">{t(locale, 'plan.market.avgRegions')}</div>
                  <div className="nums text-[16px] font-bold leading-tight">
                    {usd2.format(snap.regions.reduce((sum, r) => sum + r.rpm, 0) / snap.regions.length)}
                    <span className="text-[11px] font-medium text-white/45">/mi</span>
                  </div>
                </div>
                <ul className="mt-1.5 space-y-1 px-1 text-[11.5px] leading-snug text-white/60">
                  {(
                    [
                      ['bg-good-400', 'plan.market.legendBest'],
                      ['bg-white/30', 'plan.market.legendMid'],
                      ['bg-bad-400', 'plan.market.legendWorst'],
                    ] as const
                  ).map(([dot, msg]) => (
                    <li key={msg} className="flex items-center gap-1.5">
                      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
                      {t(locale, msg)}
                    </li>
                  ))}
                  <li className="pt-0.5 text-white/45">{t(locale, 'plan.market.legendUnit')}</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  )
}

const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`

/** Сдвиг за неделю — у графика грузов на трак, у регионов ставок. */
function WeekChange({ v, locale }: { v: number | null | undefined; locale: Locale }) {
  if (v == null) return null
  const Icon = v >= 0 ? TrendingUp : TrendingDown
  return (
    <span className={`nums inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium ${v >= 0 ? 'text-good-400' : 'text-bad-400'}`}>
      <Icon size={12} aria-hidden />
      {t(locale, 'plan.market.wow').replace('{v}', signedPct(v))}
    </span>
  )
}

/** Круглые значения оси: не больше четырёх делений с шагом 1, 2, 2.5 или 5 × 10ⁿ. */
function niceTicks(lo: number, hi: number): number[] {
  const mag = 10 ** Math.floor(Math.log10(hi - lo || 1))
  let step = mag
  for (const m of [0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]) {
    step = m * mag
    if (Math.ceil(hi / step) - Math.floor(lo / step) <= 3) break
  }
  const out: number[] = []
  for (let k = Math.floor(lo / step); k <= Math.ceil(hi / step); k++) out.push(Math.round(k * step * 100) / 100)
  return out
}

/** Подписи месяцев под осью: где начинается месяц, у января — с годом; на узком графике
 * через два месяца на третий. Первый, неполный месяц не подписываем — подпись легла бы на ось. */
function monthTicks(weeks: DatWeek[], locale: Locale, every: number): { i: number; text: string }[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const out: { i: number; text: string }[] = []
  let month = -1
  weeks.forEach((wk, i) => {
    const d = new Date(`${wk.when}T00:00:00Z`)
    if (d.getUTCMonth() === month) return
    const first = month === -1
    month = d.getUTCMonth()
    if (!first) out.push({ i, text: month === 0 ? `${fmt.format(d)} ${String(d.getUTCFullYear()).slice(2)}` : fmt.format(d) })
  })
  return out.filter((_, k) => k % every === 0)
}

/** Грузов на трак по стране за год. Ось с круглыми значениями, тонкая линия — среднее за
 * год, последняя неделя подписана. Наведение, касание или стрелки — неделя, цифра и сдвиг к
 * прошлой; главное (сейчас, против среднего, минимум и максимум) видно и без этого. */
function LtChart({
  weeks,
  lastChange,
  locale,
}: {
  weeks: DatWeek[]
  /** Сдвиг последней недели от самого DAT: из округлённых точек вышло бы −7.3% рядом с его −7.2%. */
  lastChange?: number | null
  locale: Locale
}) {
  const box = useRef<HTMLDivElement>(null)
  // Ширина в пикселях, чтобы точки были круглыми, а подписи не растягивались: SVG «на всю
  // ширину» с preserveAspectRatio="none" сплющивал бы и то и другое. До замера (и на
  // сервере) — пустое место той же высоты, страница не прыгает.
  const [w, setW] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0]?.contentRect.width ?? 0)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = weeks.length
  const values = weeks.map((p) => p.ratio)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const avg = values.reduce((sum, v) => sum + v, 0) / n
  const last = weeks[n - 1]!
  const ticks = niceTicks(lo, hi)
  const floor = ticks[0]!
  const span = ticks[ticks.length - 1]! - floor || 1
  // Поля: слева значения оси, справа последняя цифра, снизу месяцы.
  const H = 128
  const L = 24
  const R = 34
  const T = 6
  const B = 18
  const plotW = Math.max(1, w - L - R)
  const x = (i: number) => L + (i * plotW) / (n - 1)
  const y = (v: number) => T + (1 - (v - floor) / span) * (H - T - B)
  const line = weeks.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ratio).toFixed(1)}`).join('')
  const months = w > 0 ? monthTicks(weeks, locale, plotW < 420 ? 3 : plotW < 760 ? 2 : 1) : []

  const at = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (rect) setHover(Math.max(0, Math.min(n - 1, Math.round(((clientX - rect.left - L) / plotW) * (n - 1)))))
  }
  const p = hover == null ? null : weeks[hover]!
  const prev = hover ? weeks[hover - 1]! : null
  const change = hover === n - 1 && lastChange != null ? lastChange : p && prev ? ((p.ratio - prev.ratio) / prev.ratio) * 100 : null
  const vsAvg = ((last.ratio - avg) / avg) * 100
  const nowText = t(locale, 'plan.market.now').replace('{v}', last.ratio.toFixed(1)).replace('{date}', usDate(last.when))
  const avgText = t(locale, vsAvg >= 0 ? 'plan.market.aboveAvg' : 'plan.market.belowAvg')
    .replace('{pct}', Math.abs(vsAvg).toFixed(0))
    .replace('{avg}', avg.toFixed(1))
  const range = ''

  return (
    <figure className="mt-1.5">
      <div
        ref={box}
        tabIndex={0}
        role="group"
        aria-label={`${t(locale, 'plan.market.chart')}: ${nowText}, ${avgText}, ${range}`}
        className="relative h-32 cursor-crosshair touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-haul-400/50"
        onPointerDown={(e) => at(e.clientX)}
        onPointerMove={(e) => at(e.clientX)}
        // Мышь ушла — подсказка прячется; после касания остаётся, чтобы её успели прочитать.
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setHover(null)
        }}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + (e.key === 'ArrowLeft' ? -1 : 1))))
        }}
      >
        {w > 0 && (
          <svg width={w} height={H} className="block overflow-visible" aria-hidden>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} className="stroke-white/[0.07]" />

              </g>
            ))}
            {months.map((m) => (
              <text key={m.i} x={x(m.i)} y={H - 4} textAnchor="middle" className="fill-white/40 text-[10px]">
                {m.text}
              </text>
            ))}
            <path d={`${line}L${x(n - 1).toFixed(1)},${y(floor)}L${L},${y(floor)}Z`} className="fill-haul-400/10" />
            <line x1={L} x2={w - R} y1={y(avg)} y2={y(avg)} className="stroke-white/30" />
            <path d={line} fill="none" className="stroke-haul-400" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* У правого края и по другую сторону линии среднего, чем последняя неделя: слева
                подпись ложилась на саму линию графика, а справа ей мешала бы только цифра «сейчас». */}
            <text
              x={w - R - 2}
              y={last.ratio >= avg ? y(avg) + 12 : y(avg) - 5}
              textAnchor="end"
              className="fill-white/60 stroke-ink-900 text-[10px] [paint-order:stroke] [stroke-width:3px]"
            >
              {t(locale, 'plan.market.avg').replace('{v}', avg.toFixed(1))}
            </text>
            {p && hover != null && (
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="stroke-white/35" />
            )}
            <circle cx={x(n - 1)} cy={y(last.ratio)} r={4} className="fill-haul-400 stroke-ink-900" strokeWidth={2} />
            {p && hover != null && (
              <circle cx={x(hover)} cy={y(p.ratio)} r={4.5} className="fill-haul-400 stroke-ink-900" strokeWidth={2} />
            )}

          </svg>
        )}
        {p && hover != null && w > 0 && (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-white/10 bg-ink-950 px-2 py-1.5 text-[11px] leading-tight"
            style={x(hover) > w / 2 ? { top: T, right: w - x(hover) + 10 } : { top: T, left: x(hover) + 10 }}
          >
            <div className="nums text-white/50">{t(locale, 'plan.market.week').replace('{date}', usDate(p.when))}</div>
            <div className="mt-0.5">
              <span className="nums text-[14px] font-bold text-white">{signedPct(((p.ratio - avg) / avg) * 100)}</span>{' '}
              <span className="text-white/60">{t(locale, 'plan.market.perTruck')}</span>
            </div>
            {change != null && (
              <div className={`nums mt-0.5 ${change >= 0 ? 'text-good-400' : 'text-bad-400'}`}>
                {t(locale, 'plan.market.wow').replace('{v}', signedPct(change))}
              </div>
            )}
          </div>
        )}
      </div>
      <figcaption className="nums mt-1 text-[11.5px] leading-snug text-white/55">
        <span className="font-semibold text-white/85">{nowText}</span> ·{' '}
        <span className={vsAvg >= 0 ? 'text-good-400' : 'text-bad-400'}>{avgText}</span>
      </figcaption>
    </figure>
  )
}

function LaneRow({
  lane,
  title,
  rank,
  snap,
  origin,
  opts,
  settings,
  locale,
  reasons,
  board = false,
}: {
  lane: Lane
  /** Подпись вместо названия штата — у груза с доски: откуда, куда, брокер. */
  title?: string
  rank?: number
  snap: DatSnapshot
  origin: string
  opts: Opts
  settings: TruckSettings
  locale: Locale
  reasons?: string[]
  board?: boolean
}) {
  const tone = dayTone(lane.grossPerDay, opts.target)
  const need = rpmForTarget(lane, opts.target)
  return (
    <details className="group rounded-lg border border-white/8 transition-colors open:border-white/15 hover:border-white/15">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2 max-md:min-h-11">
        {rank != null && <span className="nums w-4 shrink-0 text-right text-[11px] text-white/40">{rank}</span>}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="min-w-0 break-words text-[13.5px] font-semibold">{title ?? lane.name}</span>
            <HeatTag heat={lane.heat} ratio={lane.ratio} median={lane.median} locale={locale} />
          </span>
          <span className="nums block break-words text-[11.5px] text-white/50">
            {lane.miles.toLocaleString('en-US')} mi · {usd2.format(lane.rpm)}/mi · {t(locale, 'plan.loadShort').replace('{v}', usd.format(lane.rate))}
            {need > 0 && (
              <>
                {' · '}
                <span className={lane.rpm >= need ? 'text-good-400/80' : 'text-warn-400/90'}>
                  {t(locale, 'plan.needRpm').replace('{v}', usd2.format(need))}
                </span>
              </>
            )}
          </span>
          {reasons && reasons.length > 0 && <span className="block text-[11.5px] text-white/60">{reasons.join(' · ')}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className={`nums block text-[15px] font-bold leading-tight ${TONE_TEXT[tone]}`}>
            {t(locale, 'plan.perDay').replace('{v}', usd.format(lane.grossPerDay))}
          </span>
          <span className="nums block text-[11px] text-white/50">{t(locale, 'plan.netShort').replace('{v}', usd.format(lane.netPerDay))}</span>
        </span>
      </summary>
      <LaneCalc lane={lane} snap={snap} origin={origin} opts={opts} settings={settings} locale={locale} board={board} tone={tone} />
    </details>
  )
}

/** Полный расчёт направления — каждая цифра видна, и с ней можно спорить. */
function LaneCalc({
  lane,
  snap,
  origin,
  opts,
  settings,
  locale,
  board,
  tone,
}: {
  lane: Lane
  snap: DatSnapshot
  origin: string
  opts: Opts
  settings: TruckSettings
  locale: Locale
  board: boolean
  tone: 'hit' | 'near' | 'miss'
}) {
  const b = lane.load
  const minus = (v: number) => `−${usd.format(v)}`
  const days = (v: number) => t(locale, 'plan.days').replace('{v}', v.toFixed(1))
  const row = (text: string, value: string, cls = '') => (
    <div className="flex justify-between gap-3 border-b border-dashed border-white/[0.07] py-1">
      <span className="min-w-0 text-white/60">{text}</span>
      <span className={`nums shrink-0 font-medium ${cls}`}>{value}</span>
    </div>
  )
  const section = (text: string) => <p className="mt-2 text-2xs font-semibold uppercase tracking-wide text-white/45 first:mt-0">{text}</p>
  const totalMiles = (lane.miles + lane.deadhead).toLocaleString('en-US')
  return (
    <div className="border-t border-white/[0.06] px-3 pb-3 pt-2 text-[12.5px]">
      {section(t(locale, 'plan.calc.load'))}
      {row(
        board
          ? t(locale, 'plan.calc.revenueBoard').replace('{miles}', lane.miles.toLocaleString('en-US')).replace('{rpm}', usd2.format(lane.rpm))
          : t(locale, 'plan.calc.revenue')
              .replace('{miles}', lane.miles.toLocaleString('en-US'))
              .replace('{rpm}', usd2.format(lane.rpm))
              .replace('{region}', regionName(snap, origin)),
        usd.format(lane.rate),
      )}
      {row(
        t(locale, 'plan.calc.fuel')
          .replace('{miles}', totalMiles)
          .replace('{mpg}', String(settings.mpg))
          .replace('{price}', usd2.format(settings.fuelPricePerGallon)),
        minus(b.fuel),
      )}
      {row(t(locale, 'plan.calc.driver'), minus(b.driver))}
      {row(t(locale, 'plan.calc.maintenance'), minus(b.maintenance))}
      {row(t(locale, 'plan.calc.fixed').replace('{days}', lane.driveDays.toFixed(1)), minus(b.truckPayment + b.insurance + b.eldPermits))}
      {b.factoring + b.dispatch > 0 && row(t(locale, 'plan.calc.fees'), minus(b.factoring + b.dispatch))}
      {row(t(locale, 'plan.calc.loadNet'), usd.format(b.net), b.net >= 0 ? 'text-good-400' : 'text-bad-400')}

      {section(t(locale, 'plan.calc.cycle'))}
      {row(t(locale, 'plan.calc.drive').replace('{miles}', totalMiles).replace('{mpd}', String(opts.mpd)), days(lane.driveDays))}
      {row(
        lane.ratio != null
          ? t(locale, 'plan.calc.wait')
              .replace('{state}', lane.state)
              .replace('{heat}', t(locale, HEAT_LEVEL_KEY[heatLevel(lane.median, lane.ratio)]))
          : t(locale, 'plan.calc.waitNoLt').replace('{state}', lane.state),
        days(lane.wait),
      )}
      {row(t(locale, 'plan.calc.waitCost'), minus(lane.idleCost))}
      {lane.next && lane.nextRpm
        ? row(
            t(locale, 'plan.calc.next')
              .replace('{miles}', String(NEXT_LEG_MILES))
              .replace('{rpm}', usd2.format(lane.nextRpm))
              .replace('{region}', regionName(snap, lane.state)),
            `${NEXT_WEIGHT * lane.next.net >= 0 ? '+' : '−'}${usd.format(Math.abs(NEXT_WEIGHT * lane.next.net))} · ${days(NEXT_WEIGHT * lane.nextDays)}`,
          )
        : row(t(locale, 'plan.calc.nextNone'), '—')}
      {row(t(locale, 'plan.calc.cycleTotal'), days(lane.cycleDays))}

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        <div className="panel-inset flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-white/60">{t(locale, 'plan.calc.grossDay').replace('{target}', usd.format(opts.target))}</span>
          <span className={`nums font-bold ${TONE_TEXT[tone]}`}>{usd.format(lane.grossPerDay)}</span>
        </div>
        <div className="panel-inset flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-white/60">{t(locale, 'plan.calc.netDay')}</span>
          <span className={`nums font-bold ${lane.netPerDay >= 0 ? 'text-good-400' : 'text-bad-400'}`}>{usd.format(lane.netPerDay)}</span>
        </div>
      </div>
    </div>
  )
}

/** Конкретные грузы с доски — тем же расчётом, что направления: вместе с тем, где груз
 * оставит трак. Диспетчер ничего не печатает: делает скриншот доски и жмёт Ctrl+V на
 * странице, перетаскивает картинку в рамку или выбирает файл — ИИ пишет грузы строками.
 * Сами строки спрятаны в «Поправить цифры вручную»: поле с «TX 980 2450 60» на виду
 * пользователь не понял, а нужно оно только если ИИ ошибся в цифре. Живёт только на
 * странице: это черновик под звонок брокеру. */
function BoardCompare({
  snap,
  from,
  planOpts,
  opts,
  locale,
}: {
  snap: DatSnapshot
  from: PlanOrigin
  planOpts: PlanOptions
  opts: Opts
  locale: Locale
}) {
  const [text, setText] = useState('')
  const [reading, setReading] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { rows, bad } = useMemo(() => {
    const rows = parseBoardLoads(text)
      .map((b) => {
        // Ставки на доске нет («?») — по рынку DAT региона погрузки: он в подписи груза
        // со скриншота («Fresno, CA → Houston, TX»), у ручной строки — откуда поедет трак.
        const fromLabel = b.label ? stateFromPlace(b.label.split('→')[0]) : null
        const pickup = fromLabel && regionOf(snap, fromLabel) ? fromLabel : from.state
        const marketRpm = regionOf(snap, pickup)?.rpm
        const rate = b.rate ?? (marketRpm ? Math.round(b.miles * marketRpm) : null)
        const lane = rate === null ? null : scoreLane(snap, from, b.state, planOpts, { miles: b.miles, rate, deadhead: b.deadhead })
        return lane ? { lane, label: b.label, market: b.rate === null, pickup } : null
      })
      .filter((x): x is { lane: Lane; label: string | undefined; market: boolean; pickup: string } => x !== null)
      .sort((a, b) => b.lane.grossPerDay - a.lane.grossPerDay)
    // Первая строка, которую не понять, — вслух: молча пропущенная «ca-tx» выглядела так,
    // будто поле не работает вовсе.
    const bad = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !parseBoardLoads(l).length)
    return { rows, bad }
  }, [text, snap, from, planOpts])

  const read = (list: File[]) => {
    const files = list.filter((f) => f.type.startsWith('image/')).slice(0, 4)
    if (!files.length || reading) return
    if (files.reduce((sum, f) => sum + f.size, 0) > 8 * 1024 * 1024) return notify('error', t(locale, 'tolls.docTooBig'))
    const fd = new FormData()
    for (const f of files) fd.append('file', safeUploadFile(f))
    setReading(true)
    readBoardScreenshot(fd)
      .then((res) => {
        if ('error' in res) return notify('error', res.error)
        if (!res.lines.length) return notify('warn', t(locale, 'plan.boardNone'))
        setText((cur) => [cur.trim(), ...res.lines].filter(Boolean).join('\n'))
        notify(
          'ok',
          t(locale, 'plan.boardRead').replace('{n}', String(res.lines.length)) +
            (res.skipped ? t(locale, 'plan.boardSkipped').replace('{n}', String(res.skipped)) : ''),
        )
      })
      .catch(() => notify('error', t(locale, 'plan.boardFail')))
      .finally(() => setReading(false))
  }

  // Ctrl+V в любом месте страницы, кроме полей ввода: скриншот из буфера — сразу на чтение.
  // Щёлкать сначала в поле диспетчер не станет.
  const readRef = useRef(read)
  useEffect(() => {
    readRef.current = read
  })
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"]')) return
      const files = [...(e.clipboardData?.files ?? [])]
      if (!files.some((f) => f.type.startsWith('image/'))) return
      e.preventDefault()
      readRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const pick = () => fileRef.current?.click()

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-white/55">
        {t(locale, 'plan.board')}
        <Info text={t(locale, 'plan.boardInfo')} />
      </h3>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          read([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />

      {!text.trim() ? (
        <button
          type="button"
          onClick={pick}
          disabled={reading}
          aria-busy={reading || undefined}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            setDrag(false)
            if (!e.dataTransfer.files.length) return
            e.preventDefault()
            read([...e.dataTransfer.files])
          }}
          className={`mt-2 flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-4 text-center transition-colors ${
            drag ? 'border-haul-400 bg-haul-500/10' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]'
          }`}
        >
          {reading ? (
            <span className="size-5 animate-spin rounded-full border-2 border-haul-400 border-t-transparent" aria-hidden />
          ) : (
            <ImagePlus size={22} className="text-haul-400" aria-hidden />
          )}
          <span className="text-[13.5px] font-semibold text-white/85">
            {reading ? (
              t(locale, 'plan.boardReading')
            ) : (
              <>
                <span className="max-md:hidden">{t(locale, 'plan.boardDrop')}</span>
                <span className="md:hidden">{t(locale, 'plan.boardDropTouch')}</span>
              </>
            )}
          </span>
          {!reading && <span className="text-[12px] text-white/50">{t(locale, 'plan.boardDropSub')}</span>}
        </button>
      ) : (
        <>
          {rows.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {rows.map(({ lane, label, market, pickup }, i) => {
                const reasons = [
                  i === 0 && rows.length > 1 ? t(locale, 'plan.why.best') : null,
                  market ? t(locale, 'plan.why.market') : null,
                  lane.grossPerDay < opts.target ? t(locale, 'plan.why.belowTarget') : null,
                  lane.heat === 'cold' ? t(locale, 'plan.why.cold').replace('{days}', lane.wait.toFixed(1)) : null,
                  lane.heat === 'hot' ? t(locale, 'plan.why.hot') : null,
                  lane.net < 0 ? t(locale, 'plan.why.loss') : null,
                ].filter((x): x is string => x !== null)
                return (
                  <LaneRow
                    key={`${i}-${lane.state}-${lane.miles}-${lane.rate}`}
                    lane={lane}
                    title={label}
                    snap={snap}
                    origin={pickup}
                    opts={opts}
                    settings={planOpts.settings}
                    locale={locale}
                    reasons={reasons}
                    board={!market}
                  />
                )
              })}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<ImagePlus size={13} />} loading={reading} onClick={pick}>
              {t(locale, 'plan.boardMore')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setText('')}>
              {t(locale, 'plan.boardClear')}
            </Button>
          </div>
          <details className="group mt-2 rounded-xl border border-white/8" open={Boolean(bad)}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12px] max-md:min-h-11">
              <span className="text-white/40 transition-transform group-open:rotate-90" aria-hidden>
                ▸
              </span>
              <span className="font-medium text-white/75">{t(locale, 'plan.boardEdit')}</span>
            </summary>
            <div className="border-t border-white/[0.06] px-3 pb-3 pt-2">
              <p className="text-[12px] leading-snug text-white/55">{t(locale, 'plan.boardHint')}</p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                // Картинка, вставленная прямо в поле, — тоже на чтение, а не мимо.
                onPaste={(e) => {
                  const files = [...e.clipboardData.files]
                  if (!files.some((f) => f.type.startsWith('image/'))) return
                  e.preventDefault()
                  read(files)
                }}
                rows={Math.min(8, Math.max(3, text.split('\n').length))}
                wrap="off"
                spellCheck={false}
                className={`${input} mt-2 font-mono text-[13px]`}
              />
              {bad && (
                <p className="mt-1 break-words text-[12px] text-warn-400">
                  {t(locale, 'plan.boardBad').replace('{line}', bad.length > 40 ? `${bad.slice(0, 40)}…` : bad)}
                </p>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  )
}
