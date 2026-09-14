'use client'

// «Куда отправить трак» на «Траках» — Route Planner сайта dispatch4you, перенесённый в
// TMS. Расчёт — lib/route-plan-core.ts. На сайте всё вводилось руками: штат, расходы на
// милю, MPG, а данные DAT обновлялись раз в неделю вручную. Здесь всё уже есть: где трак
// стоит или где выгрузится, его прицеп и его расходы, а рынок — суточным снимком DAT.
// Трак, выбранный на карте или чипом, сразу становится траком планировщика; «На карте»
// красит штаты выручкой в день из выбранного штата (components/fleet-map.tsx).

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { DollarSign, Flame, Fuel, MapPin, Snowflake, TrendingDown, TrendingUp } from 'lucide-react'
import { Info } from '@/components/info'
import { Stat } from '@/components/stat'
import { Button } from '@/components/button'
import { ShowMore } from '@/components/collapse'
import { useLocale } from '@/components/locale-provider'
import type { MapPlan } from '@/components/fleet-map'
import { t, type Locale, type MsgKey } from '@/lib/i18n'
import { usd, usd2, usDate } from '@/lib/fmt'
import { US_STATES } from '@/lib/us-states'
import { ltHeat, ltOf, regionOf, type DatEquipment, type DatHeat, type DatSnapshot, type DatWeek } from '@/lib/dat-market-core'
import type { TruckSettings } from '@/lib/profit'
import {
  NEXT_LEG_MILES,
  NEXT_WEIGHT,
  dayTone,
  parseBoardLoads,
  rankLanes,
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
              .replace('{heat}', l.heat ? t(locale, HEAT_KEY[l.heat]) : '—'),
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

function HeatTag({ heat, locale }: { heat: DatHeat | null; locale: Locale }) {
  if (heat !== 'hot' && heat !== 'cold') return null
  const Icon = heat === 'hot' ? Flame : Snowflake
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${heat === 'hot' ? 'text-good-400' : 'text-bad-400'}`}>
      <Icon size={11} strokeWidth={2.4} aria-hidden />
      {t(locale, HEAT_KEY[heat])}
    </span>
  )
}

export function RoutePlanner({ plan, trucks, snaps }: { plan: RoutePlan; trucks: PlanTruck[]; snaps: PlanSnaps }) {
  const locale = useLocale()
  const { truck, origin, series, snap, opts, lanes, from, planOpts } = plan
  if (!truck) return null
  const seriesList = Object.keys(snaps) as DatEquipment[]
  const best = lanes[0] ?? null
  const worst = lanes.length > 1 ? lanes[lanes.length - 1]! : null
  const lt = snap && origin ? ltOf(snap, origin) : null
  const heat = snap && lt ? ltHeat(snap, lt.ratio) : null
  const originRpm = snap && origin ? (regionOf(snap, origin)?.rpm ?? null) : null
  const s = truck.settings

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
              value={lt ? lt.ratio.toFixed(1) : '—'}
              sub={heat ? t(locale, 'plan.ltSub').replace('{heat}', t(locale, HEAT_KEY[heat])) : undefined}
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
          <div className="mt-2 flex flex-col gap-1.5">
            <ShowMore
              limit={5}
              label={t(locale, 'plan.more')}
              items={lanes.slice(0, 10).map((lane, i) => (
                <LaneRow key={lane.state} lane={lane} rank={i + 1} snap={snap} origin={origin} opts={opts} settings={s} locale={locale} />
              ))}
            />
          </div>
          {lanes.length > 10 && (
            <p className="mt-2 text-[12px] text-white/55">
              <span className="font-semibold text-bad-400">{t(locale, 'plan.traps')}:</span>{' '}
              {lanes
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

/** Рынок серии целиком — то, что на сайте было карточкой аналитики: дизель, сдвиг за
 * неделю, грузы на трак по стране за год, ставки регионов, горячие и холодные штаты.
 * Свёрнут: он для решения «куда вообще сейчас», а не для каждого груза. */
function MarketDetails({ snap, series, locale }: { snap: DatSnapshot & { date: string }; series: DatEquipment; locale: Locale }) {
  const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
  const trend = snap.trend
  // Штаты, куда возят по регионам DAT: без провинций Канады, DC, Аляски и Гавайев — те же,
  // что в списке направлений. Канзас — под почтовым кодом.
  const us = new Set(US_STATES.map(([code]) => code))
  const states = Object.entries(snap.lt)
    .map(([code, lt]) => [code === 'KA' ? 'KS' : code, lt.ratio] as const)
    .filter(([code]) => us.has(code) && regionOf(snap, code))
    .sort((a, b) => b[1] - a[1])
  const top = states[0]?.[1] ?? 1
  const chips: { key: string; icon: React.ReactNode; text: string; tone: string }[] = []
  if (snap.fuel)
    chips.push({ key: 'fuel', icon: <Fuel size={12} />, text: t(locale, 'plan.market.diesel').replace('{v}', usd2.format(snap.fuel.price)), tone: 'text-white/70' })
  if (trend?.rateWoW != null)
    chips.push({
      key: 'rate',
      icon: trend.rateWoW >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />,
      text: t(locale, 'plan.market.rateWoW').replace('{v}', pct(trend.rateWoW)),
      tone: trend.rateWoW >= 0 ? 'text-good-400' : 'text-bad-400',
    })
  if (trend?.ltWoW != null)
    chips.push({
      key: 'lt',
      icon: trend.ltWoW >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />,
      text: t(locale, 'plan.market.ltWoW').replace('{v}', pct(trend.ltWoW)),
      tone: trend.ltWoW >= 0 ? 'text-good-400' : 'text-bad-400',
    })
  const stateList = (rows: (readonly [string, number])[], bar: string) => (
    <ul className="mt-1.5 space-y-1">
      {rows.map(([code, ratio]) => (
        <li key={code} className="flex items-center gap-2 text-[12.5px]">
          <span className="w-12 shrink-0">
            <span className={`block h-1.5 rounded-full ${bar}`} style={{ width: `${Math.max(8, (ratio / top) * 100)}%` }} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-white/80">{stateName(code)}</span>
          <span className="nums shrink-0 font-semibold text-white/85">{ratio.toFixed(1)}</span>
        </li>
      ))}
    </ul>
  )
  const sub = 'text-2xs font-semibold uppercase tracking-wide text-white/55'
  return (
    <details className="group mt-4 rounded-xl border border-white/8">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-[12px] max-md:min-h-11">
        <span className="text-white/40 transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
        <span className="font-semibold text-white/80">{t(locale, 'plan.market.title').replace('{series}', SERIES_NAME[series])}</span>
        {chips.map((c) => (
          <span key={c.key} className={`nums inline-flex items-center gap-1 ${c.tone}`}>
            {c.icon}
            {c.text}
          </span>
        ))}
      </summary>
      <div className="space-y-4 border-t border-white/[0.06] px-3 pb-3 pt-3">
        {snap.history && snap.history.length > 1 && (
          <div>
            <h4 className={`flex items-center gap-1.5 ${sub}`}>
              {t(locale, 'plan.market.chart')}
              <Info text={t(locale, 'plan.market.chartInfo')} />
            </h4>
            <LtChart weeks={snap.history} locale={locale} />
          </div>
        )}
        <div>
          <h4 className={sub}>{t(locale, 'plan.market.regions')}</h4>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {snap.regions.map((r) => (
              <div key={r.code} className="panel-inset px-3 py-2">
                <div className="text-[11px] text-white/55">{r.code.charAt(0) + r.code.slice(1).toLowerCase()}</div>
                <div className="nums text-[15px] font-bold">{usd2.format(r.rpm)}/mi</div>
              </div>
            ))}
          </div>
        </div>
        {states.length >= 10 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className={`flex items-center gap-1 ${sub}`}>
                <Flame size={12} className="text-good-400" aria-hidden />
                {t(locale, 'plan.market.hot')}
              </h4>
              {stateList(states.slice(0, 5), 'bg-good-400/70')}
            </div>
            <div>
              <h4 className={`flex items-center gap-1 ${sub}`}>
                <Snowflake size={12} className="text-bad-400" aria-hidden />
                {t(locale, 'plan.market.cold')}
              </h4>
              {stateList(states.slice(-5).reverse(), 'bg-bad-400/70')}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}

/** Грузы на трак по стране за год — линия без осей: форма и где рынок сейчас. */
function LtChart({ weeks, locale }: { weeks: DatWeek[]; locale: Locale }) {
  const W = 640
  const H = 110
  const P = 4
  const values = weeks.map((w) => w.ratio)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pts = weeks.map((w, i) => `${((P + (i * (W - 2 * P)) / (weeks.length - 1))).toFixed(1)},${(H - P - ((w.ratio - lo) / (hi - lo || 1)) * (H - 2 * P)).toFixed(1)}`)
  const last = weeks[weeks.length - 1]!
  return (
    <figure className="mt-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-24 w-full" aria-hidden>
        <polygon points={`${P},${H - P} ${pts.join(' ')} ${W - P},${H - P}`} className="fill-haul-400/15" />
        <polyline points={pts.join(' ')} fill="none" className="stroke-haul-400" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="nums mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-white/50">
        <span>{usDate(weeks[0]!.when)}</span>
        <span>
          min {lo.toFixed(1)} · max {hi.toFixed(1)} ·{' '}
          <span className="font-semibold text-white/80">{t(locale, 'plan.market.now').replace('{v}', last.ratio.toFixed(1)).replace('{date}', usDate(last.when))}</span>
        </span>
      </figcaption>
    </figure>
  )
}

function LaneRow({
  lane,
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
  return (
    <details className="group rounded-lg border border-white/8 transition-colors open:border-white/15 hover:border-white/15">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2 max-md:min-h-11">
        {rank != null && <span className="nums w-4 shrink-0 text-right text-[11px] text-white/40">{rank}</span>}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="text-[13.5px] font-semibold">{lane.name}</span>
            <HeatTag heat={lane.heat} locale={locale} />
          </span>
          <span className="nums block break-words text-[11.5px] text-white/50">
            {lane.miles.toLocaleString('en-US')} mi · {usd2.format(lane.rpm)}/mi · {t(locale, 'plan.loadShort').replace('{v}', usd.format(lane.rate))}
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
              .replace('{ratio}', lane.ratio.toFixed(1))
              .replace('{heat}', lane.heat ? t(locale, HEAT_KEY[lane.heat]) : '—')
              .replace('{median}', lane.median.toFixed(1))
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
 * оставит трак. Текст живёт только на странице: это черновик под звонок брокеру. */
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
  const rows = useMemo(
    () =>
      parseBoardLoads(text)
        .map((b) => scoreLane(snap, from, b.state, planOpts, b))
        .filter((x): x is Lane => x !== null)
        .sort((a, b) => b.grossPerDay - a.grossPerDay),
    [text, snap, from, planOpts],
  )
  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-white/55">
        {t(locale, 'plan.board')}
        <Info text={t(locale, 'plan.boardInfo')} />
      </h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        spellCheck={false}
        placeholder={'TX 980 2450 60\nGA 640 1700'}
        className={`${input} mt-2 font-mono text-[13px]`}
      />
      {rows.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {rows.map((lane, i) => {
            const reasons = [
              i === 0 && rows.length > 1 ? t(locale, 'plan.why.best') : null,
              lane.grossPerDay < opts.target ? t(locale, 'plan.why.belowTarget') : null,
              lane.heat === 'cold' ? t(locale, 'plan.why.cold').replace('{days}', lane.wait.toFixed(1)) : null,
              lane.heat === 'hot' ? t(locale, 'plan.why.hot') : null,
              lane.net < 0 ? t(locale, 'plan.why.loss') : null,
            ].filter((x): x is string => x !== null)
            return (
              <LaneRow
                key={`${i}-${lane.state}-${lane.miles}-${lane.rate}`}
                lane={lane}
                snap={snap}
                origin={from.state}
                opts={opts}
                settings={planOpts.settings}
                locale={locale}
                reasons={reasons}
                board
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
