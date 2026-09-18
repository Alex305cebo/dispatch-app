'use client'

// Страница груза, пришедшего из Telegram-бота: всё, что диспетчеру нужно решить
// по грузу, на одном экране — и в том же виде, что карточка настоящего груза TMS.
//
// Груз живёт в хеше ссылки: ставка брокера на сервер не уходит. Сервер получает
// только города, тип трейлера и данные брокера (app/load/card/actions.ts), а деньги
// считаются здесь, в браузере.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudLightning,
  Copy,
  Gauge,
  MapPin,
  Minus,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
} from 'lucide-react'
import { parseLoadHash, type QrLoad } from '@/lib/qr-load'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { Button } from '@/components/button'
import { Stat } from '@/components/stat'
import { Info } from '@/components/info'
import { Analysis } from '@/components/analysis'
import { BackhaulList } from '@/components/backhaul-list'
import { BrokerChecklist } from '@/components/broker-checklist'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t, type Locale } from '@/lib/i18n'
import { vetBroker } from '@/app/actions'
import type { BrokerCheck } from '@/lib/fmcsa'
import { calcLoad, type Breakdown } from '@/lib/profit'
import { driveTime, usd, usd2 } from '@/lib/fmt'
import { directionsUrl, isRateCon, thinCoords, tripFit } from '@/lib/load-card-core'
import { marketVerdict } from '@/lib/dat-market-core'
import type { FuelPlan } from '@/lib/fuel-plan-core'
import { cardFuelPlan, cardInsights, type CardInsights, type CardMarketSide } from './actions'

type LatLngish = { lat: number; lng: number }
type Geo = { from: LatLngish | null; to: LatLngish | null; miles: number | null; coords: [number, number][] | null }

const H2 = 'mb-3 flex items-center gap-1.5 text-base leading-6 font-semibold text-white/90'
const TILE = 'rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2'
const TILE_LABEL = 'text-xs font-medium text-white/60'
const TILE_VALUE = 'nums text-[15px] font-semibold text-white/85'

/** Текст водителю — тот же формат, что шлёт бот: реф-номера внутри блока точки. */
function driverText(l: QrLoad): string {
  const hr = '__________________________'
  const out: string[] = []
  if (l.referenceId) out.push(`* LOAD ID: #${l.referenceId}`, '')
  type S = string | null | undefined
  const stop = (heading: string, name: S, addr: S, city: S, time: S, refs: S) => {
    out.push(`${heading}:`, '')
    if (name) out.push(name, '')
    if (addr) out.push(addr)
    if (city) out.push(city)
    out.push('')
    if (time) out.push(hr, `Time: ${time}`)
    if (refs) {
      out.push(hr)
      refs.split('|').forEach((r, i) => out.push(i === 0 ? `Ref: ${r.trim()}` : r.trim()))
    }
    out.push(hr, '')
  }
  stop('Pick up Address', l.pickupName, l.pickupAddress, l.origin, l.pickupTime ?? l.pickupDate, l.pickupRefs)
  stop('Delivery Address', l.deliveryName, l.deliveryAddress, l.destination, l.deliveryTime ?? l.deliveryDate, l.deliveryRefs)
  if (l.rate) out.push(`Rate: $${l.rate.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
  if (l.commodity) out.push(`Commodity: ${l.commodity}`)
  if (l.weight) out.push(`Weight: ${l.weight}`)
  return out.join('\n').trim()
}

/** Письмо брокеру — только для груза с биржи: рейт-кон значит, что груз уже взят. */
function emailDraft(l: QrLoad): { subject: string; body: string } {
  const route = [l.origin, l.destination].filter(Boolean).join(' to ')
  const subject = `Checking your load${route ? ` - ${route}` : ''}`
  const b: string[] = ['Hello,', '', `We are interested in your load${route ? '' : '.'}`]
  if (route) b.push(route)
  const details: string[] = []
  if (l.pickupTime || l.pickupDate) details.push(`Pickup: ${l.pickupTime ?? l.pickupDate}`)
  if (l.deliveryTime || l.deliveryDate) details.push(`Delivery: ${l.deliveryTime ?? l.deliveryDate}`)
  if (l.equipment) details.push(`Equipment: ${l.equipment}`)
  if (l.weight) details.push(`Weight: ${l.weight}`)
  if (l.referenceId) details.push(`Reference: ${l.referenceId}`)
  if (details.length) b.push('', ...details)
  b.push('', 'Our truck is available and can cover it on time.', 'Please confirm BEST rate for this load.', '', 'Thank you')
  return { subject, body: b.join('\n') }
}

async function copy(text: string, locale: Locale) {
  try {
    await navigator.clipboard.writeText(text)
    notify('ok', t(locale, 'loadCard.copied'))
  } catch {
    notify('warn', t(locale, 'loadCard.copyFailed'))
  }
}

function CopyBlock({ text, label, locale }: { text: string; label: string; locale: Locale }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base leading-6 font-semibold text-white/90">{label}</h2>
        <Button variant="secondary" size="sm" type="button" icon={<Copy size={14} strokeWidth={2.2} />} onClick={() => copy(text, locale)}>
          {t(locale, 'loadCard.copy')}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/25 p-3 font-mono text-[12px] leading-relaxed text-white/85">
        {text}
      </pre>
    </div>
  )
}

const heatText = (h: CardMarketSide['heat'], locale: Locale) =>
  h === 'hot' ? t(locale, 'loadCard.heatHot') : h === 'cold' ? t(locale, 'loadCard.heatCold') : h === 'warm' ? t(locale, 'loadCard.heatWarm') : null

const heatTone = (h: CardMarketSide['heat']) =>
  h === 'hot' ? 'bg-good-500/15 text-good-400' : h === 'cold' ? 'bg-bad-500/15 text-bad-400' : 'bg-white/6 text-white/70'

function MarketSide({ label, side, locale }: { label: string; side: CardMarketSide; locale: Locale }) {
  const heat = heatText(side.heat, locale)
  return (
    <div className={TILE}>
      {/* Коды регионов DAT приходят капсом — NORTH, SOUTHEAST; в плитке читается «North». */}
      <div className={TILE_LABEL}>
        {label.replace('{region}', side.region ? side.region.code.charAt(0) + side.region.code.slice(1).toLowerCase() : side.state)}
      </div>
      <div className={TILE_VALUE}>{side.region ? `${usd2.format(side.region.rpm)}/mi` : '—'}</div>
      {side.ratio !== null && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-white/60">
          <span className="nums">
            {t(locale, 'loadCard.loadsPerTruck').replace('{state}', side.state)}
          </span>
          {heat && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${heatTone(side.heat)}`}>{heat}</span>}
        </div>
      )}
    </div>
  )
}

function StopCard({
  kind,
  name,
  address,
  city,
  time,
  refs,
  locale,
}: {
  kind: 'pickup' | 'delivery'
  name?: string | null
  address?: string | null
  city?: string | null
  time?: string | null
  refs?: string | null
  locale: Locale
}) {
  const full = [address, city].filter(Boolean).join(', ')
  const nav = full ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, full].filter(Boolean).join(', '))}` : null
  const refList = (refs ?? '').split('|').map((r) => r.trim()).filter(Boolean)
  return (
    <div className="panel-inset min-w-0 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${
            kind === 'pickup' ? 'bg-haul-500/15 text-haul-300' : 'bg-good-500/15 text-good-400'
          }`}
        >
          <MapPin size={12} strokeWidth={2.4} />
          {t(locale, kind === 'pickup' ? 'loadCard.pickup' : 'loadCard.delivery')}
        </span>
        {nav && (
          <a href={nav} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-haul-400 hover:underline">
            <Navigation size={12} strokeWidth={2.4} />
            {t(locale, 'loadCard.navigate')}
          </a>
        )}
      </div>
      {time && (
        <div className="nums mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-white/85">
          <Clock size={13} strokeWidth={2.2} className="text-white/45" />
          {time}
        </div>
      )}
      {name && <div className="mt-2 text-[14px] font-semibold leading-snug text-white/90">{name}</div>}
      {address && <div className="text-[13px] text-white/70">{address}</div>}
      {city && <div className="text-[13px] text-white/70">{city}</div>}
      {refList.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {refList.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => copy(r, locale)}
              className="nums inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[12px] font-semibold text-white/85 hover:border-haul-500/40"
            >
              {r}
              <Copy size={11} strokeWidth={2.2} className="text-white/45" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CardClient() {
  const locale = useLocale()
  const [load, setLoad] = useState<QrLoad | null>(null)
  const [hash, setHash] = useState('')
  const [geo, setGeo] = useState<Geo | null>(null)
  const [geoFailed, setGeoFailed] = useState(false)
  const [insights, setInsights] = useState<CardInsights | null>(null)
  const [fuel, setFuel] = useState<FuelPlan | null>(null)
  const [brokerCheck, setBrokerCheck] = useState<
    { state: 'loading' } | { state: 'done'; data: BrokerCheck } | { state: 'nokey' } | { state: 'error'; message: string } | null
  >(null)
  // Кнопка «Обновить данные»: следующий круг загрузки идёт мимо кэша рынка DAT.
  const [round, setRound] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setHash(window.location.hash)
    setLoad(parseLoadHash(window.location.hash))
  }, [])

  // Карта: координаты и линия дороги. На сервер уходят только два города.
  useEffect(() => {
    if (!load?.origin || !load?.destination) return
    let alive = true
    setGeoFailed(false)
    const q = new URLSearchParams({ from: load.origin, to: load.destination })
    fetch(`/api/route-preview?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Geo | null) => {
        if (!alive) return
        if (d?.from && d?.to) setGeo(d)
        else setGeoFailed(true)
      })
      .catch(() => {
        if (alive) setGeoFailed(true)
      })
    return () => {
      alive = false
    }
  }, [load?.origin, load?.destination, round])

  // Рынок DAT, свои грузы по направлению, траки, погода, брокер по вашей истории.
  useEffect(() => {
    if (!load) return
    let alive = true
    cardInsights({
      origin: load.origin,
      destination: load.destination,
      equipment: load.equipment ?? null,
      brokerMc: load.brokerMc,
      brokerEmail: load.brokerEmail,
      brokerName: load.brokerName,
      force: round > 0,
    })
      .then((res) => {
        if (!alive) return
        setInsights(res)
        if (round > 0) notify('ok', t(locale, 'loadCard.refreshed'))
      })
      .catch(() => {
        if (alive) setInsights(null)
      })
      .finally(() => {
        if (alive) setRefreshing(false)
      })
    return () => {
      alive = false
    }
  }, [load, round, locale])

  // Дизель по пути — по линии маршрута, как у настоящего груза.
  useEffect(() => {
    if (!geo?.coords || geo.coords.length < 2) return
    let alive = true
    cardFuelPlan(thinCoords(geo.coords))
      .then((p) => {
        if (alive) setFuel(p)
      })
      .catch(() => {
        if (alive) setFuel(null)
      })
    return () => {
      alive = false
    }
  }, [geo])

  // FMCSA — те же данные и оценка, что на странице брокеров.
  useEffect(() => {
    if (!load?.brokerMc) return
    let alive = true
    setBrokerCheck({ state: 'loading' })
    vetBroker(load.brokerMc, { name: load.brokerName, phone: load.brokerPhone, email: load.brokerEmail }).then((res) => {
      if (!alive) return
      if ('error' in res) setBrokerCheck(res.error === 'no_key' ? { state: 'nokey' } : { state: 'error', message: res.error })
      else setBrokerCheck({ state: 'done', data: res })
    })
    return () => {
      alive = false
    }
  }, [load?.brokerMc, load?.brokerName, load?.brokerPhone, load?.brokerEmail, round])

  const miles = load?.loadedMiles || geo?.miles || 0
  const pickupWhen = load ? (load.pickupTime ?? load.pickupDate) : null
  const deliveryWhen = load ? (load.deliveryTime ?? load.deliveryDate) : null
  const fit = useMemo(() => (miles ? tripFit(miles, pickupWhen, deliveryWhen) : null), [miles, pickupWhen, deliveryWhen])
  // Деньги по статьям — настройками вашего первого трака, как на странице груза;
  // дни в пути — по часам с отдыхом. Порожний — ТОЛЬКО из самого груза (биржа его
  // показывает). Подставлять порожний ближайшего трака нельзя: какой трак поедет,
  // ещё не решено, и 400 миль до случайного трака превращали «чистыми $600» в
  // «$107» — цифра про трак, а не про груз. Трак со своим порожним — ниже списком.
  const breakdown: Breakdown | null = useMemo(() => {
    if (!load?.rate || !miles || !insights?.truck) return null
    const days = load.transitDays || Math.max(1, Math.ceil((fit?.realMin ?? 0) / 1440))
    try {
      return calcLoad({ rate: load.rate, loadedMiles: miles, deadheadMiles: load.deadheadMiles || 0, transitDays: days }, insights.truck)
    } catch {
      return null
    }
  }, [load, miles, insights?.truck, fit?.realMin])

  // Маркеры и линия маршрута — один раз на ответ маршрутизатора. Если собирать их
  // заново на каждой отрисовке, FleetMap перезапускает свой эффект на каждый ответ
  // сервера (рынок, дизель, брокер) и ловит гонку с собственной инициализацией:
  // карта рисовалась без точек и маршрута, в консоли — clearLayers of null.
  const mapData = useMemo(() => {
    const markers: MapMarker[] = []
    const routes: MapRoute[] = []
    if (geo?.from && geo?.to) {
      markers.push(
        { lat: geo.from.lat, lng: geo.from.lng, label: load?.origin ?? '', sub: load?.pickupName ?? undefined, kind: 'pickup' },
        { lat: geo.to.lat, lng: geo.to.lng, label: load?.destination ?? '', sub: load?.deliveryName ?? undefined, kind: 'dest' },
      )
      routes.push({ from: [geo.from.lat, geo.from.lng], to: [geo.to.lat, geo.to.lng], coords: geo.coords ?? undefined })
    }
    return { markers, routes }
  }, [geo, load?.origin, load?.destination, load?.pickupName, load?.deliveryName])

  if (!load) return <div className="panel h-64 animate-pulse p-5" />

  if (!load.origin && !load.rate && !load.referenceId) {
    return (
      <div className="panel p-5">
        <h2 className="text-[15px] font-semibold">{t(locale, 'loadQr.emptyTitle')}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-white/70">{t(locale, 'loadQr.emptyText')}</p>
      </div>
    )
  }

  const rc = isRateCon(load)
  const loadedRpm = load.rate && miles ? load.rate / miles : null
  const market = insights?.market ?? null
  const marketRpm = market?.rpm ?? load.spotRpm ?? null
  const verdict = loadedRpm && marketRpm ? marketVerdict(loadedRpm, marketRpm) : null
  const pct = verdict ? `${verdict.diff >= 0 ? '+' : ''}${Math.round(verdict.diff)}%` : ''
  const maps = directionsUrl(
    [load.pickupAddress, load.origin].filter(Boolean).join(', ') || load.origin,
    [load.deliveryAddress, load.destination].filter(Boolean).join(', ') || load.destination,
  )

  const { markers, routes } = mapData
  const missingPoint = !load.origin && !load.destination
    ? t(locale, 'loadCard.mapBoth')
    : !load.origin
      ? t(locale, 'loadCard.mapPickup')
      : !load.destination
        ? t(locale, 'loadCard.mapDelivery')
        : null
  const mapProblem = missingPoint
    ? t(locale, 'loadCard.mapNoPoints').replace('{what}', missingPoint)
    : geoFailed
      ? t(locale, 'loadCard.mapFailed')
      : null

  const mail = emailDraft(load)
  const mailto = `mailto:${load.brokerEmail ?? ''}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`
  const tel = load.brokerPhone ? `tel:${load.brokerPhone.replace(/[^\d+]/g, '')}` : null

  const fitLine =
    fit?.tone && fit.slackMin !== null
      ? t(locale, fit.tone === 'good' ? 'loadCard.fitGood' : fit.tone === 'warn' ? 'loadCard.fitTight' : 'loadCard.fitBad').replace(
          '{t}',
          driveTime(Math.abs(Math.round(fit.slackMin)), locale),
        )
      : null
  const toneChip = (tone: 'good' | 'warn' | 'bad') =>
    tone === 'good' ? 'bg-good-500/15 text-good-400' : tone === 'bad' ? 'bg-bad-500/15 text-bad-400' : 'bg-warn-400/15 text-warn-400'
  const toneText = (tone: 'good' | 'warn' | 'bad') => (tone === 'good' ? 'text-good-400' : tone === 'bad' ? 'text-bad-400' : 'text-warn-400')
  const toneBar = (tone: 'good' | 'warn' | 'bad') => (tone === 'good' ? 'bg-good-400' : tone === 'bad' ? 'bg-bad-400' : 'bg-warn-400')
  const ToneIcon = ({ tone, size }: { tone: 'good' | 'warn' | 'bad'; size: number }) =>
    tone === 'good' ? <TrendingUp size={size} /> : tone === 'bad' ? <TrendingDown size={size} /> : <Minus size={size} />

  return (
    <div className="grid gap-4">
      {/* ── Шапка: откуда груз, маршрут, действия, ставка ─────────────────── */}
      <section className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-haul-500/15 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-haul-300">
            {t(locale, rc ? 'loadCard.srcRc' : 'loadCard.srcBoard')}
          </span>
          {verdict && (
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${toneChip(verdict.tone)}`}>
              <ToneIcon tone={verdict.tone} size={12} />
              DAT {pct}
            </span>
          )}
          {brokerCheck?.state === 'done' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/6 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-white/70">
              <ShieldCheck size={12} />
              FMCSA
            </span>
          )}
        </div>

        <h2 className="mt-3 text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">
          {load.origin ?? '—'} <span className="text-white/35">→</span> {load.destination ?? '—'}
        </h2>
        <div className="nums mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-white/65">
          {load.referenceId && <span>#{load.referenceId}</span>}
          {load.brokerName && <span>{load.brokerName}</span>}
          {load.brokerMc && <span>MC {load.brokerMc}</span>}
          {load.equipment && <span>{load.equipment}</span>}
          {load.weight && <span>{load.weight}</span>}
          {load.commodity && <span>{load.commodity}</span>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button href={`/load${hash}`} variant="primary" size="sm" icon={<Plus size={14} strokeWidth={2.4} />}>
            {t(locale, 'loadCard.addToLoads')}
          </Button>
          <Button type="button" size="sm" icon={<Truck size={14} strokeWidth={2.2} />} onClick={() => copy(driverText(load), locale)}>
            {t(locale, 'loadCard.driverInfo')}
          </Button>
          {tel && (
            <Button href={tel} external size="sm" icon={<Phone size={14} strokeWidth={2.2} />}>
              {t(locale, 'loadCard.callBroker')}
            </Button>
          )}
          {maps && (
            <Button href={maps} external size="sm" icon={<Route size={14} strokeWidth={2.2} />}>
              {t(locale, 'loadCard.routeInMaps')}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={refreshing}
            icon={<RefreshCw size={14} strokeWidth={2.2} />}
            onClick={() => {
              setRefreshing(true)
              setRound((r) => r + 1)
            }}
          >
            {t(locale, 'loadCard.refresh')}
          </Button>
        </div>

        {insights?.demo && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] leading-relaxed text-white/60">
            {t(locale, 'loadCard.demoNote')}
          </p>
        )}

        {/* Ставка — как в карточке груза TMS: крупно, с рынком DAT и расходами под спойлером. */}
        <div className="mt-5 border-t border-white/8 pt-5">
          <h2 className={H2}>
            {t(locale, 'loadDetail.rateHeading')}
            <Info text={t(locale, 'loadDetail.rateInfo')} />
          </h2>
          {breakdown && insights?.truck ? (
            <Analysis r={breakdown} mpg={insights.truck.mpg} spotRpm={marketRpm} />
          ) : load.rate ? (
            <div className="nums text-5xl font-bold tracking-tight text-white">{usd.format(load.rate)}</div>
          ) : (
            <p className="text-[13px] text-white/70">{t(locale, 'loadCard.noNumbers')}</p>
          )}
        </div>
      </section>

      {/* ── Плитки: за милю, чистыми, мили, время ─────────────────────────── */}
      {(loadedRpm !== null || breakdown || miles > 0) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {loadedRpm !== null && (
            <Stat
              label={t(locale, 'loadCard.rpm')}
              value={usd2.format(loadedRpm)}
              tone={verdict?.tone === 'good' ? 'good' : verdict?.tone === 'bad' ? 'bad' : undefined}
              sub={breakdown && breakdown.deadheadMiles > 0 ? t(locale, 'loadCard.allIn').replace('{rpm}', usd2.format(breakdown.allInRpm)) : undefined}
              icon={<Gauge size={14} strokeWidth={2.2} />}
            />
          )}
          {breakdown && (
            <Stat
              label={t(locale, 'loadCard.net')}
              value={usd.format(Math.round(breakdown.net))}
              tone={breakdown.net >= 0 ? 'good' : 'bad'}
              sub={t(locale, 'loadCard.perDay').replace('{v}', usd.format(Math.round(breakdown.netPerDay)))}
              icon={<TrendingUp size={14} strokeWidth={2.2} />}
              accent="good"
            />
          )}
          {miles > 0 && (
            <Stat
              label={t(locale, 'loadCard.miles')}
              value={Math.round(miles).toLocaleString('en-US')}
              sub={t(locale, load.loadedMiles ? 'loadCard.milesDoc' : 'loadCard.milesRoad')}
              icon={<Route size={14} strokeWidth={2.2} />}
            />
          )}
          {fit && (
            <Stat
              label={t(locale, 'loadCard.driving')}
              value={driveTime(fit.driveMin, locale)}
              sub={t(locale, 'loadCard.withRest').replace('{t}', driveTime(fit.realMin, locale))}
              icon={<Clock size={14} strokeWidth={2.2} />}
              accent={fit.tone === 'bad' ? 'bad' : fit.tone === 'warn' ? 'warn' : 'haul'}
            />
          )}
        </div>
      )}

      {/* ── Карта и «успевает ли рейс» ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel p-4 sm:p-5">
          <h2 className={H2}>{t(locale, 'loadCard.map')}</h2>
          {markers.length ? (
            <FleetMap markers={markers} routes={routes} height="clamp(300px, 42vh, 460px)" distanceMi={geo?.miles ?? null} />
          ) : mapProblem ? (
            <p className="rounded-xl bg-white/5 p-4 text-sm text-white/62">{mapProblem}</p>
          ) : (
            <div className="h-72 animate-pulse rounded-xl bg-white/5" />
          )}
          {fuel && fuel.stops.length >= 2 && (
            <div className={`mt-3 ${TILE}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs font-medium text-white/60">
                {t(locale, 'fuel.heading')}
                <span className="normal-case tracking-normal">· EIA {fuel.asOf}</span>
              </div>
              <div className="nums mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
                {fuel.stops.map((st, i) => (
                  <span key={`${st.state}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-white/30">→</span>}
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-semibold ${
                        st.state === fuel.cheapest.state
                          ? 'bg-good-500/15 text-good-400'
                          : st.state === fuel.priciest.state
                            ? 'bg-bad-500/15 text-bad-400'
                            : 'bg-white/6 text-white/80'
                      }`}
                      title={st.region ?? st.state}
                    >
                      {st.state} ${st.price.toFixed(2)}
                    </span>
                  </span>
                ))}
              </div>
              {fuel.tankSavings >= 20 && (
                <div className="mt-1 text-[12px] text-white/65">
                  {t(locale, 'fuel.advice').replace('{state}', fuel.cheapest.state).replace('{save}', usd.format(Math.round(fuel.tankSavings)))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel p-4 sm:p-5">
          <h2 className={H2}>
            {t(locale, 'loadCard.tripFit')}
            <Info text={t(locale, 'loadCard.tripInfo')} />
          </h2>
          {fit ? (
            <div className="grid gap-2">
              {fitLine && fit.tone ? (
                <div
                  className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold leading-snug ${
                    fit.tone === 'good' ? 'bg-good-500/[0.12] text-good-400' : fit.tone === 'warn' ? 'bg-warn-400/[0.12] text-warn-400' : 'bg-bad-500/[0.12] text-bad-400'
                  }`}
                >
                  {fit.tone === 'good' ? (
                    <CircleCheck size={16} className="mt-px shrink-0" />
                  ) : fit.tone === 'warn' ? (
                    <CircleAlert size={16} className="mt-px shrink-0" />
                  ) : (
                    <TriangleAlert size={16} className="mt-px shrink-0" />
                  )}
                  {fitLine}
                </div>
              ) : (
                <p className="text-[12px] leading-relaxed text-white/55">{t(locale, 'loadCard.fitNoDates')}</p>
              )}
              <div className={TILE}>
                <div className={TILE_LABEL}>{t(locale, 'loadCard.driving')}</div>
                <div className={TILE_VALUE}>
                  {driveTime(fit.driveMin, locale)} ·{' '}
                  {fit.shifts === 1 ? t(locale, 'loadCard.shiftsOne') : t(locale, 'loadCard.shiftsN').replace('{n}', String(fit.shifts))}
                </div>
              </div>
              {pickupWhen && (
                <div className={TILE}>
                  <div className={TILE_LABEL}>{t(locale, 'loadCard.pickup')}</div>
                  <div className={TILE_VALUE}>{pickupWhen}</div>
                </div>
              )}
              {deliveryWhen && (
                <div className={TILE}>
                  <div className={TILE_LABEL}>{t(locale, 'loadCard.delivery')}</div>
                  <div className={TILE_VALUE}>{deliveryWhen}</div>
                </div>
              )}
              <div className={TILE}>
                <div className={`${TILE_LABEL} flex items-center gap-1`}>
                  <CloudLightning size={12} />
                  {t(locale, 'loadCard.weatherNow')}
                </div>
                {!insights ? (
                  <div className="mt-1 h-4 w-32 animate-pulse rounded bg-white/8" />
                ) : insights.weather.origin || insights.weather.dest ? (
                  <div className="mt-0.5 grid gap-0.5 text-[13px] font-semibold text-warn-400">
                    {insights.weather.origin && (
                      <span>
                        {load.origin}: {insights.weather.origin.event}
                      </span>
                    )}
                    {insights.weather.dest && (
                      <span>
                        {load.destination}: {insights.weather.dest.event}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-[13px] text-white/70">{t(locale, 'loadCard.weatherClear')}</div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-white/70">{t(locale, 'loadCard.noNumbers')}</p>
          )}
        </section>
      </div>

      {/* ── Рынок DAT из интернета ────────────────────────────────────────── */}
      <section className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={`${H2} mb-0`}>
            {t(locale, 'loadCard.market')}
            <Info text={t(locale, 'loadCard.marketInfo')} />
          </h2>
          {market && (
            <span className="nums text-[12px] text-white/50">
              {t(locale, 'loadCard.marketAsOf').replace(
                '{when}',
                new Date(market.at).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
              )}
            </span>
          )}
        </div>

        {!insights ? (
          <div className="mt-3 h-24 animate-pulse rounded-xl bg-white/5" />
        ) : !market ? (
          <p className="mt-3 rounded-xl bg-white/5 p-4 text-sm text-white/62">
            {t(locale, load.equipment ? 'loadCard.marketFailed' : 'loadCard.marketNoEquip')}
          </p>
        ) : (
          <>
            {verdict && loadedRpm !== null && marketRpm !== null && (
              <div className="mt-3">
                <div className={`flex flex-wrap items-center gap-2 text-[14px] font-semibold ${toneText(verdict.tone)}`}>
                  <ToneIcon tone={verdict.tone} size={16} />
                  {/* «Ниже рынка на 12%» — без знака: направление уже в словах; было «на -12%». */}
                  {t(locale, verdict.tone === 'good' ? 'loadCard.marketAbove' : verdict.tone === 'bad' ? 'loadCard.marketBelow' : 'loadCard.marketIn').replace(
                    '{pct}',
                    verdict.tone === 'warn' ? pct : pct.replace(/^[+-]/, ''),
                  )}
                  <span className="nums font-medium text-white/55">
                    · {usd2.format(loadedRpm)} vs {usd2.format(marketRpm)}/mi
                  </span>
                </div>
                {/* Шкала: рынок посередине, ставка груза — метка. */}
                <div className="relative mt-2 h-2 rounded-full bg-white/8">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
                  <div
                    className={`absolute -top-1 h-4 w-1 rounded-full ${toneBar(verdict.tone)}`}
                    style={{ left: `${Math.min(98, Math.max(2, 50 + verdict.diff))}%` }}
                  />
                </div>
              </div>
            )}
            {market.stale && <p className="mt-2 text-[12px] text-warn-400">{t(locale, 'loadCard.marketStale')}</p>}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {market.origin && <MarketSide label={t(locale, 'loadCard.regionPickup')} side={market.origin} locale={locale} />}
              {market.dest && <MarketSide label={t(locale, 'loadCard.regionDelivery')} side={market.dest} locale={locale} />}
              {insights.laneRpm !== null && (
                <div className={TILE}>
                  <div className={TILE_LABEL}>
                    {t(locale, 'loadCard.yourLane').replace('{lane}', `${market.origin?.state ?? '?'} → ${market.dest?.state ?? '?'}`)}
                  </div>
                  <div className={TILE_VALUE}>{usd2.format(insights.laneRpm)}/mi</div>
                </div>
              )}
              {market.fuel && (
                <div className={TILE}>
                  <div className={TILE_LABEL}>{t(locale, 'loadCard.dieselDat')}</div>
                  <div className={TILE_VALUE}>{usd2.format(market.fuel.price)}/gal</div>
                  <div className="nums mt-1 text-[12px] text-white/50">{market.fuel.when}</div>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Точки рейса ───────────────────────────────────────────────────── */}
      <section className="panel p-4 sm:p-5">
        <h2 className={H2}>{t(locale, 'loadCard.stops')}</h2>
        <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <StopCard kind="pickup" name={load.pickupName} address={load.pickupAddress} city={load.origin} time={pickupWhen} refs={load.pickupRefs} locale={locale} />
          <div className="nums flex items-center justify-center gap-2 text-[12px] text-white/50 md:flex-col md:gap-1">
            <ArrowRight size={16} className="rotate-90 md:rotate-0" />
            {miles > 0 && <span>{Math.round(miles).toLocaleString('en-US')} mi</span>}
            {fit && <span>{driveTime(fit.driveMin, locale)}</span>}
          </div>
          <StopCard
            kind="delivery"
            name={load.deliveryName}
            address={load.deliveryAddress}
            city={load.destination}
            time={deliveryWhen}
            refs={load.deliveryRefs}
            locale={locale}
          />
        </div>
      </section>

      {/* ── Кому отдать груз ──────────────────────────────────────────────── */}
      <section className="panel p-4 sm:p-5">
        <h2 className={H2}>
          {t(locale, 'loadCard.whoTakes')}
          <Info text={t(locale, 'loadCard.whoTakesInfo')} />
        </h2>
        {!insights ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/5" />
        ) : !insights.trucks.length ? (
          <p className="text-[13px] text-white/70">{t(locale, 'loadCard.noTrucks')}</p>
        ) : (
          <div className="grid gap-2">
            {insights.trucks.map((tr) => (
              <Link
                key={tr.id}
                href={`/trucks/${tr.id}`}
                className={`panel-inset flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5 transition-colors hover:bg-white/[0.06] ${
                  tr.unavailable ? 'opacity-55' : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/6 text-white/70">
                    <Truck size={15} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-white/90">{tr.label}</div>
                    {tr.driverName && <div className="truncate text-[12px] text-white/55">{tr.driverName}</div>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-semibold ${
                      tr.unavailable ? 'bg-white/6 text-white/60' : tr.free ? 'bg-good-500/15 text-good-400' : 'bg-warn-400/15 text-warn-400'
                    }`}
                  >
                    {t(locale, tr.unavailable ? 'loadCard.unavailable' : tr.free ? 'loadCard.freeNow' : 'loadCard.busy')}
                  </span>
                  {tr.deadheadMi !== null && <span className="nums font-semibold text-white/85">DH ~{tr.deadheadMi.toLocaleString('en-US')} mi</span>}
                  {tr.from === 'gps' && <span className="text-white/50">{t(locale, 'loadCard.fromGps')}</span>}
                  {tr.from === 'delivery' && tr.place && (
                    <span className="text-white/50">{t(locale, 'loadCard.afterDelivery').replace('{place}', tr.place)}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Брокер ────────────────────────────────────────────────────────── */}
      <section className="panel p-4 sm:p-5">
        <h2 className={H2}>{t(locale, 'loadCard.brokerCheck')}</h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-white/90">{load.brokerName ?? '—'}</div>
            <div className="nums break-words text-[12px] text-white/55">
              {[load.brokerMc ? `MC ${load.brokerMc}` : null, load.brokerPhone, load.brokerEmail].filter(Boolean).join(' · ')}
            </div>
          </div>
          {tel && (
            <div className="ml-auto">
              <Button href={tel} external size="sm" icon={<Phone size={14} strokeWidth={2.2} />}>
                {t(locale, 'loadCard.callBroker')}
              </Button>
            </div>
          )}
        </div>
        {insights?.brokerGrade && (
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-[13px] ${
              insights.brokerGrade.payGrade === 'slow' ? 'bg-warn-400/[0.1] text-warn-400' : 'bg-white/[0.04] text-white/75'
            }`}
          >
            {t(locale, 'loadCard.brokerHistory')
              .replace('{paid}', String(insights.brokerGrade.paidCount))
              .replace('{days}', insights.brokerGrade.payDays !== null ? String(Math.round(insights.brokerGrade.payDays)) : '—')}{' '}
            ·{' '}
            {t(
              locale,
              insights.brokerGrade.payGrade === 'slow' ? 'loadCard.gradeSlow' : insights.brokerGrade.payGrade === 'good' ? 'loadCard.gradeGood' : 'loadCard.gradeOk',
            )}
          </p>
        )}
        <p className="mb-3 mt-3 text-[12px] leading-relaxed text-white/50">{t(locale, 'loadCard.brokerCheckDisclaimer')}</p>
        {!load.brokerMc && <p className="text-[13px] text-white/70">{t(locale, 'loadCard.noMc')}</p>}
        {brokerCheck?.state === 'loading' && <p className="animate-pulse text-[13px] text-haul-400">{t(locale, 'brokers.checking')}</p>}
        {brokerCheck?.state === 'nokey' && <p className="text-[12px] leading-relaxed text-white/55">{t(locale, 'brokerCheck.noKey')}</p>}
        {brokerCheck?.state === 'error' && <p className="text-[13px] text-bad-400">{brokerCheck.message}</p>}
        {brokerCheck?.state === 'done' && <BrokerChecklist check={brokerCheck.data} collapsible />}
      </section>

      {/* ── Обратный груз из штата доставки ───────────────────────────────── */}
      {insights?.backhaul && <BackhaulList state={insights.backhaul.state} brokers={insights.backhaul.brokers} locale={locale} />}

      {/* ── Важное от брокера ─────────────────────────────────────────────── */}
      {load.brokerNotes && (
        <section className="panel p-4 sm:p-5">
          <h2 className={H2}>{t(locale, 'brokerNotes.heading')}</h2>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">{load.brokerNotes}</p>
        </section>
      )}

      {/* ── Текст водителю и письмо (письмо — только для груза с биржи) ───── */}
      <section className="panel p-4 sm:p-5">
        <CopyBlock text={driverText(load)} label={t(locale, 'loadCard.driverInfo')} locale={locale} />
      </section>
      {!rc && (
        <section className="panel p-4 sm:p-5">
          <CopyBlock text={`${mail.subject}\n\n${mail.body}`} label={t(locale, 'loadCard.brokerEmail')} locale={locale} />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
            <a href={mailto} className="text-haul-400 hover:underline">
              {t(locale, 'loadCard.openInMail')} →
            </a>
            {load.brokerEmail && <span className="text-white/55">{load.brokerEmail}</span>}
          </div>
        </section>
      )}
    </div>
  )
}
