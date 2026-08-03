'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { parseLoadHash, type QrLoad } from '@/lib/qr-load'
import { FleetMap, type MapMarker, type MapRoute } from '@/components/fleet-map'
import { Button } from '@/components/button'
import { notify } from '@/lib/notify'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

// Diesel and mpg are assumptions, not facts about this truck — labelled as such in
// the UI so a dispatcher never mistakes the fuel line for a quote.
const MPG = 6.5
const DIESEL = 4.0

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
    if (name) out.push(name)
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
  const subject = `Load inquiry${route ? ` - ${route}` : ''}${l.referenceId ? ` (Ref ${l.referenceId})` : ''}`
  const b: string[] = ['Hello,', '', `We are interested in your load${route ? ` ${route}` : ''}.`, '']
  if (l.pickupTime || l.pickupDate) b.push(`Pickup: ${l.pickupTime ?? l.pickupDate}`)
  if (l.deliveryTime || l.deliveryDate) b.push(`Delivery: ${l.deliveryTime ?? l.deliveryDate}`)
  if (l.equipment) b.push(`Equipment: ${l.equipment}`)
  if (l.weight) b.push(`Weight: ${l.weight}`)
  if (l.referenceId) b.push(`Reference: ${l.referenceId}`)
  b.push('', 'Our truck is available and can cover it on time.')
  b.push(
    l.rate
      ? `Posted rate is $${l.rate.toLocaleString('en-US')}. Please confirm the all-in rate you can do.`
      : 'Please advise the all-in rate you can offer.',
  )
  b.push('', 'Please send the rate confirmation once we agree.', '', 'Thank you,')
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
  const [geo, setGeo] = useState<{ from: LatLngish; to: LatLngish; miles: number | null } | null>(null)

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
      .then((d) => d?.from && d?.to && setGeo(d))
      .catch(() => {})
  }, [load?.origin, load?.destination])

  const money = useMemo(() => {
    if (!load) return null
    const miles = load.loadedMiles || geo?.miles || 0
    if (!load.rate || !miles) return null
    const fuel = (miles / MPG) * DIESEL
    return { miles, rpm: load.rate / miles, fuel, after: load.rate - fuel }
  }, [load, geo])

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
    routes.push({ from: [geo.from.lat, geo.from.lng], to: [geo.to.lat, geo.to.lng] })
  }

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
            <Link href={`/load${window.location.hash}`} className="mt-3 inline-block text-[13px] text-haul-400 hover:underline">
              {t(locale, 'loadCard.openCalculator')} →
            </Link>
          </>
        ) : (
          <p className="text-[13px] text-white/70">{t(locale, 'loadCard.noNumbers')}</p>
        )}
      </section>

      {/* Route map */}
      <section className="panel p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/62">
          {t(locale, 'loadCard.map')}
        </h2>
        {markers.length ? (
          <FleetMap markers={markers} routes={routes} height={320} distanceMi={geo?.miles ?? null} />
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
