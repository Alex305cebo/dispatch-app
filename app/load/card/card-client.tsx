'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { parseLoadHash, type QrLoad } from '@/lib/qr-load'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { Button } from '@/components/button'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'
import { vetBroker } from '@/app/actions'
import type { BrokerCheck } from '@/lib/fmcsa'
import { BrokerChecklist } from '@/components/broker-checklist'

// Diesel and mpg are assumptions, not facts about this truck — labelled as such in
// the UI so a dispatcher never mistakes the fuel line for a quote.
const MPG = 6.5
const DIESEL = 4.0

// Same baseline the Telegram bot uses (api/lib/load-photo.php RPM_BASELINE) —
// kept in sync by hand since the two live in separate repos.
const RPM_BASELINE: Record<string, number> = { VAN: 2.15, REEFER: 2.45, FLATBED: 2.4, 'POWER ONLY': 1.6 }

function rpmBaseline(equipment: string | null): { key: string; value: number } | null {
  if (!equipment) return null
  const up = equipment.toUpperCase()
  const hit = Object.entries(RPM_BASELINE).find(([k]) => up.includes(k))
  return hit ? { key: hit[0], value: hit[1] } : null
}

function num(s: string | null | undefined): number | null {
  if (!s) return null
  const n = Number(String(s).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The exact block a dispatcher forwards to the driver — same shape the bot sends. */
function driverText(l: QrLoad): string {
  const hr = '__________________________'
  const out: string[] = []
  if (l.referenceId) out.push(`* LOAD ID: #${l.referenceId}`, '')
  const stop = (
    heading: string,
    name: string | null | undefined,
    addr: string | null | undefined,
    city: string | null | undefined,
    time: string | null | undefined,
    refs: string | null | undefined,
  ) => {
    out.push(`${heading}:`, '')
    // Пустая строка после названия склада — иначе оно визуально слипается
    // с адресом на следующей строке. Тот же формат, что в Telegram-боте.
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

function emailDraft(l: QrLoad): { subject: string; body: string } {
  const route = [l.origin, l.destination].filter(Boolean).join(' to ')
  const subject = `Checking your load${route ? ` - ${route}` : ''}`
  // Маршрут — отдельной строкой, а не приклеен к предыдущей фразе.
  const b: string[] = ['Hello,', '', `We are interested in your load${route ? '' : '.'}`]
  if (route) b.push(route)
  const details: string[] = []
  if (l.pickupTime || l.pickupDate) details.push(`Pickup: ${l.pickupTime ?? l.pickupDate}`)
  if (l.deliveryTime || l.deliveryDate) details.push(`Delivery: ${l.deliveryTime ?? l.deliveryDate}`)
  if (l.equipment) details.push(`Equipment: ${l.equipment}`)
  if (l.weight) details.push(`Weight: ${l.weight}`)
  if (l.referenceId) details.push(`Reference: ${l.referenceId}`)
  if (details.length) b.push('', ...details)
  b.push('', 'Our truck is available and can cover it on time.')
  b.push('Please confirm BEST rate for this load.')
  b.push('', 'Thank you')
  return { subject, body: b.join('\n') }
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const locale = useLocale()
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/62">{label}</h2>
        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              notify('ok', t(locale, 'loadCard.copied'))
            } catch {
              notify('warn', t(locale, 'loadCard.copyFailed'))
            }
          }}
        >
          {t(locale, 'loadCard.copy')}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/25 p-3 font-mono text-[12px] leading-relaxed text-white/85">
        {text}
      </pre>
    </div>
  )
}

export function CardClient() {
  const locale = useLocale()
  const [load, setLoad] = useState<QrLoad | null>(null)
  const [geo, setGeo] = useState<{
    from: LatLngish
    to: LatLngish
    miles: number | null
    coords: [number, number][] | null
  } | null>(null)
  const [geoFailed, setGeoFailed] = useState(false)

  useEffect(() => {
    setLoad(parseLoadHash(window.location.hash))
  }, [])

  // Coordinates come from the server (geocoder + road routing); only the two place
  // names leave the browser, never the rate.
  useEffect(() => {
    if (!load?.origin || !load?.destination) return
    const q = new URLSearchParams({ from: load.origin, to: load.destination })
    fetch(`/api/route-preview?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.from && d?.to ? setGeo(d) : setGeoFailed(true)))
      .catch(() => setGeoFailed(true))
  }, [load?.origin, load?.destination])

  const money = useMemo(() => {
    if (!load) return null
    const miles = load.loadedMiles || geo?.miles || 0
    if (!load.rate || !miles) return null
    const fuel = (miles / MPG) * DIESEL
    return { miles, rpm: load.rate / miles, fuel, after: load.rate - fuel }
  }, [load, geo])

  // How this rate compares to a typical rate for the trailer type — same
  // baseline the bot uses, so the two tools never disagree with each other.
  const marketCompare = useMemo(() => {
    if (!money || !load?.equipment) return null
    const base = rpmBaseline(load.equipment)
    if (!base) return null
    return { base, diff: ((money.rpm - base.value) / base.value) * 100 }
  }, [money, load?.equipment])

  // Broker vetting — same FMCSA data + safety score the Brokers page uses.
  // Runs once an MC is on the load; contacts from the rate con feed computeFlags'
  // name/phone/email mismatch check the same way BrokerCheckPanel does.
  const [brokerCheck, setBrokerCheck] = useState<
    { state: 'loading' } | { state: 'done'; data: BrokerCheck } | { state: 'nokey' } | { state: 'error'; message: string } | null
  >(null)
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
  }, [load?.brokerMc, load?.brokerName, load?.brokerPhone, load?.brokerEmail])

  if (!load) return <div className="panel h-64 animate-pulse p-5" />

  if (!load.origin && !load.rate && !load.referenceId) {
    return (
      <div className="panel p-5">
        <h2 className="text-[15px] font-semibold">{t(locale, 'loadQr.emptyTitle')}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-white/70">{t(locale, 'loadQr.emptyText')}</p>
      </div>
    )
  }

  const markers: MapMarker[] = []
  const routes: MapRoute[] = []
  if (geo?.from && geo?.to) {
    markers.push(
      { lat: geo.from.lat, lng: geo.from.lng, label: load.origin ?? '', sub: load.pickupName ?? undefined, kind: 'pickup' },
      { lat: geo.to.lat, lng: geo.to.lng, label: load.destination ?? '', sub: load.deliveryName ?? undefined, kind: 'dest' },
    )
    // coords — фактическая линия дороги от OSRM; без неё FleetMap рисует прямую
    // черту между точками, а не реальный маршрут.
    routes.push({
      from: [geo.from.lat, geo.from.lng],
      to: [geo.to.lat, geo.to.lng],
      coords: geo.coords ?? undefined,
    })
  }

  // Почему карты нет. Пусто = данные ещё едут, и тогда показываем «скелет».
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

  return (
    <div className="grid gap-4">
      {/* Route + who the load is from */}
      <section className="panel p-5">
        <div className="text-[17px] font-semibold leading-tight">
          {load.origin ?? '—'} <span className="text-white/40">→</span> {load.destination ?? '—'}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/65">
          {load.referenceId && <span>#{load.referenceId}</span>}
          {load.brokerName && <span>{load.brokerName}</span>}
          {load.brokerMc && <span>MC {load.brokerMc}</span>}
          {load.equipment && <span>{load.equipment}</span>}
          {load.weight && <span>{load.weight}</span>}
          {load.commodity && <span>{load.commodity}</span>}
        </div>
      </section>

      {/* The numbers */}
      <section className="panel p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'loadCard.analysis')}
        </h2>
        {money ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t(locale, 'loadCard.rate')} value={`$${load.rate.toLocaleString('en-US')}`} />
              <Stat label={t(locale, 'loadCard.miles')} value={money.miles.toLocaleString('en-US')} />
              <Stat label={t(locale, 'loadCard.rpm')} value={`$${money.rpm.toFixed(2)}`} big />
              <Stat label={t(locale, 'loadCard.afterFuel')} value={`$${Math.round(money.after).toLocaleString('en-US')}`} />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-white/55">
              {t(locale, 'loadCard.fuelNote')} ${Math.round(money.fuel).toLocaleString('en-US')} ({MPG} mpg, ${DIESEL.toFixed(2)}/gal).{' '}
              {t(locale, 'loadCard.deadheadNote')}
            </p>
            {marketCompare && (
              <p
                className={`mt-2 text-[13px] font-medium ${
                  marketCompare.diff <= -15 ? 'text-bad-400' : marketCompare.diff >= 15 ? 'text-good-400' : 'text-warn-400'
                }`}
              >
                {marketCompare.diff <= -15 ? '🔴' : marketCompare.diff >= 15 ? '🟢' : '🟡'}{' '}
                {t(locale, 'loadCard.baselineFor').replace('{equip}', marketCompare.base.key)}: $
                {marketCompare.base.value.toFixed(2)}/mi ({marketCompare.diff >= 0 ? '+' : ''}
                {marketCompare.diff.toFixed(0)}%)
              </p>
            )}
            <Link href={`/load${window.location.hash}`} className="mt-3 inline-block text-[13px] text-haul-400 hover:underline">
              {t(locale, 'loadCard.openCalculator')} →
            </Link>
          </>
        ) : (
          <p className="text-[13px] text-white/70">{t(locale, 'loadCard.noNumbers')}</p>
        )}
      </section>

      {/* Broker legitimacy — same FMCSA data + safety score as the Brokers page */}
      <section className="panel p-5">
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'loadCard.brokerCheck')}
        </h2>
        <p className="mb-3 text-[12px] leading-relaxed text-white/50">{t(locale, 'loadCard.brokerCheckDisclaimer')}</p>
        {!load.brokerMc && <p className="text-[13px] text-white/70">{t(locale, 'loadCard.noMc')}</p>}
        {brokerCheck?.state === 'loading' && (
          <p className="animate-pulse text-[13px] text-haul-400">{t(locale, 'brokers.checking')}</p>
        )}
        {brokerCheck?.state === 'nokey' && (
          <p className="text-[12px] leading-relaxed text-white/55">
            {t(locale, 'brokerCheck.noKey')}
          </p>
        )}
        {brokerCheck?.state === 'error' && <p className="text-[13px] text-bad-400">{brokerCheck.message}</p>}
        {brokerCheck?.state === 'done' && <BrokerChecklist check={brokerCheck.data} collapsible />}
      </section>

      {/* Route map */}
      <section className="panel p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'loadCard.map')}
        </h2>
        {markers.length ? (
          <FleetMap markers={markers} routes={routes} height={320} distanceMi={geo?.miles ?? null} />
        ) : mapProblem ? (
          // Без этого страница крутила «скелет» вечно: рейт-кон без адреса
          // погрузки выглядел как вечная загрузка, и понять, чего не хватает,
          // было нельзя.
          <p className="rounded-xl bg-white/5 p-4 text-sm text-white/62">{mapProblem}</p>
        ) : (
          <div className="h-40 animate-pulse rounded-xl bg-white/5" />
        )}
      </section>

      {/* What the driver gets */}
      <section className="panel p-5">
        <CopyBlock text={driverText(load)} label={t(locale, 'loadCard.driverInfo')} />
      </section>

      {/* What the broker gets */}
      <section className="panel p-5">
        <CopyBlock text={`${mail.subject}\n\n${mail.body}`} label={t(locale, 'loadCard.brokerEmail')} />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          <a href={mailto} className="text-haul-400 hover:underline">
            {t(locale, 'loadCard.openInMail')} →
          </a>
          {load.brokerEmail && <span className="text-white/55">{load.brokerEmail}</span>}
          {load.brokerPhone && <span className="text-white/55">{load.brokerPhone}</span>}
        </div>
      </section>
    </div>
  )
}

type LatLngish = { lat: number; lng: number }

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      <div className={big ? 'text-[20px] font-bold text-haul-400' : 'text-[16px] font-semibold'}>{value}</div>
    </div>
  )
}
