'use client'

// Карта траков для брокеров: карта на первом экране, под ней (на компьютере — справа)
// список. Фильтры-цифры сверху, наведение на трак — коротко, нажатие — плашка с ✕
// (и Escape), нажатие по строке списка — карта летит к траку. Раз в 2 минуты данные
// обновляются сами. Всё, что здесь есть, пришло белым списком (lib/broker-map-core.ts).
//
// Своя лёгкая карта, а не components/fleet-map.tsx: у той кнопки и слои для диспетчера
// (обновить GPS, рынок DAT) на серверных действиях, которым на публичной странице не место.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { BrokerMapView, BrokerStatus, BrokerTruck } from '@/lib/broker-map-core'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY
const TILES = MAPBOX_TOKEN
  ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
  : MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}@2x.png?key=${MAPTILER_KEY}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIB = MAPBOX_TOKEN ? '© Mapbox © OpenStreetMap' : MAPTILER_KEY ? '© MapTiler © OpenStreetMap' : '© OpenStreetMap'
const RETINA = Boolean(MAPBOX_TOKEN || MAPTILER_KEY)

const REFRESH_MS = 120_000

const STATUS: Record<BrokerStatus, { label: string; color: string }> = {
  loaded: { label: 'Loaded', color: '#e0560c' },
  to_pickup: { label: 'To pickup', color: '#0284c7' },
  available: { label: 'Available', color: '#15803d' },
}
const ORDER: BrokerStatus[] = ['loaded', 'to_pickup', 'available']

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function cardHtml(t: BrokerTruck): string {
  const st = STATUS[t.status]
  const row = (k: string, v: string | null) =>
    v ? `<div style="display:flex;gap:8px;justify-content:space-between;margin-top:3px"><span style="opacity:.65">${k}</span><b style="text-align:right">${esc(v)}</b></div>` : ''
  return `<div style="font:500 12px/1.4 system-ui,sans-serif;min-width:190px">
    <div style="display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:700">
      Truck ${t.n}
      <span style="font-size:11px;padding:1px 7px;border-radius:999px;background:${st.color}1f;color:${st.color}">${st.label}</span>
    </div>
    ${t.from || t.to ? `<div style="margin-top:4px;font-weight:600">${esc(t.from ?? '—')} → ${esc(t.to ?? '—')}</div>` : ''}
    ${row('Now near', t.near)}
    ${row('Pickup ETA', t.pickupEta)}
    ${row('Delivery ETA', t.deliveryEta)}
    ${row('Miles left', t.milesLeft != null ? `~${t.milesLeft.toLocaleString('en-US')}` : null)}
    ${row('Moving', t.moving ? 'Yes' : 'Stopped')}
  </div>`
}

function pinHtml(t: BrokerTruck, active: boolean): string {
  const c = STATUS[t.status].color
  const size = active ? 34 : 28
  return `<div style="width:${size}px;height:${size}px;transform:translate(-50%,-50%);border-radius:999px;background:${c};color:#fff;
    display:grid;place-items:center;font:700 12px system-ui,sans-serif;border:2.5px solid #fff;
    box-shadow:0 2px 8px rgba(0,0,0,.35)${t.moving ? `,0 0 0 4px ${c}33` : ''}">${t.n}</div>`
}

export function BrokerMap({ token, initial }: { token: string; initial: BrokerMapView }) {
  const [view, setView] = useState(initial)
  const [gone, setGone] = useState(false)
  const [filter, setFilter] = useState<BrokerStatus | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null)
  const markersRef = useRef(new Map<number, import('leaflet').Marker>())
  const fittedRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)

  const shown = useMemo(() => view.trucks.filter((t) => !filter || t.status === filter), [view, filter])
  const counts = useMemo(() => {
    const c: Record<BrokerStatus, number> = { loaded: 0, to_pickup: 0, available: 0 }
    for (const t of view.trucks) c[t.status]++
    return c
  }, [view])

  // Обновление раз в 2 минуты. 404 — ссылку выключили или перевыпустили.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/track/${token}`, { cache: 'no-store' })
        if (res.status === 404) {
          setGone(true)
          clearInterval(id)
          return
        }
        if (res.ok) setView((await res.json()) as BrokerMapView)
      } catch {
        /* сеть моргнула — следующий раз */
      }
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [token])

  // Карта создаётся один раз.
  useEffect(() => {
    let dead = false
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css' as string).catch(() => {})
      if (dead || !hostRef.current || mapRef.current) return
      const map = L.map(hostRef.current, { zoomControl: true, attributionControl: true, worldCopyJump: true }).setView([39, -95], 4)
      L.tileLayer(TILES, RETINA ? { tileSize: 512, zoomOffset: -1, maxZoom: 12, attribution: ATTRIB } : { maxZoom: 12, attribution: ATTRIB }).addTo(map)
      layerRef.current = L.layerGroup().addTo(map)
      map.on('click', () => setSelected(null))
      mapRef.current = map
      setMapReady(true)
    })()
    return () => {
      dead = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Траки, линии и концы маршрутов — заново при каждом обновлении данных и фильтра.
  useEffect(() => {
    if (!mapReady) return
    let dead = false
    ;(async () => {
      const L = (await import('leaflet')).default
      const map = mapRef.current
      const layer = layerRef.current
      if (dead || !map || !layer) return
      layer.clearLayers()
      markersRef.current.clear()
      const bounds: [number, number][] = []
      for (const t of shown) {
        const color = STATUS[t.status].color
        if (t.path.length > 1) {
          L.polyline(t.path, { color, weight: 3.5, opacity: 0.75, dashArray: t.status === 'to_pickup' ? '8 7' : undefined }).addTo(layer)
          const end = t.path[t.path.length - 1]!
          L.circleMarker(end, { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
            .bindTooltip(`Truck ${t.n} → ${esc(t.to ?? '')}${t.deliveryEta ? `<br>ETA ${esc(t.deliveryEta)}` : ''}`, { direction: 'top' })
            .addTo(layer)
          bounds.push(end)
        }
        const m = L.marker([t.lat, t.lng], {
          icon: L.divIcon({ className: '', html: pinHtml(t, false), iconSize: [0, 0] }),
          keyboard: true,
          title: `Truck ${t.n}`,
        })
          .bindTooltip(`<b>Truck ${t.n}</b> · ${STATUS[t.status].label}${t.to ? `<br>→ ${esc(t.to)}` : ''}${t.deliveryEta ? `<br>ETA ${esc(t.deliveryEta)}` : ''}`, {
            direction: 'top',
            offset: [0, -14],
          })
          .bindPopup(cardHtml(t), { offset: [0, -12], maxWidth: 280 })
          .on('click', () => setSelected(t.n))
          .addTo(layer)
        markersRef.current.set(t.n, m)
        bounds.push([t.lat, t.lng])
      }
      // Подогнать вид — только первый раз: обновление не должно сбивать брокеру зум.
      if (!fittedRef.current && bounds.length) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 7 })
        fittedRef.current = true
      }
    })()
    return () => {
      dead = true
    }
  }, [shown, mapReady])

  // Выбор в списке — к траку на карте и его плашка.
  useEffect(() => {
    const map = mapRef.current
    if (!map || selected == null) return
    const m = markersRef.current.get(selected)
    if (!m) return
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 6), { duration: 0.6 })
    m.openPopup()
  }, [selected])

  // Escape закрывает плашку.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      mapRef.current?.closePopup()
      setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (gone)
    return (
      <main className="broker-page mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-semibold">This link is no longer active.</p>
        <p className="mt-1 text-base text-t2">Ask your dispatcher for a new one.</p>
      </main>
    )

  const chip = (key: BrokerStatus | null, label: string, n: number, color?: string) => {
    const on = filter === key
    return (
      <button
        key={label}
        type="button"
        onClick={() => setFilter(key)}
        aria-pressed={on}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
          on ? 'border-haul-500 bg-haul-500 text-white' : 'border-white/12 bg-ink-900 text-t1 hover:border-haul-500/60'
        }`}
      >
        {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
        {label}
        <span className={on ? 'text-white' : 'text-t2'}>{n}</span>
      </button>
    )
  }

  return (
    <main className="broker-page mx-auto max-w-[1400px] px-4 pb-10 pt-4 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-t2">{view.carrier}</p>
          <h1 className="text-[22px] font-bold leading-tight">Our trucks · live</h1>
        </div>
        <p className="text-sm text-t2">
          {view.gpsAgeMin == null ? 'No GPS yet' : view.gpsAgeMin < 2 ? 'GPS updated just now' : `GPS updated ${view.gpsAgeMin} min ago`}
          {' · '}auto-refresh 2 min
        </p>
      </header>

      <div className="mt-3 flex flex-wrap gap-2">
        {chip(null, 'All', view.trucks.length)}
        {ORDER.map((s) => chip(s, STATUS[s].label, counts[s], STATUS[s].color))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_340px]">
        <div className="fleet-map panel relative overflow-hidden p-0">
          <div ref={hostRef} style={{ height: 'clamp(360px, 62vh, 760px)' }} className="w-full" />
        </div>

        <ul className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto lg:max-h-[760px]">
          {shown.length === 0 && <li className="panel px-4 py-6 text-center text-base text-t2">No trucks here right now.</li>}
          {shown.map((t) => {
            const st = STATUS[t.status]
            const on = selected === t.n
            return (
              <li key={t.n}>
                <button
                  type="button"
                  onClick={() => setSelected(t.n)}
                  className={`panel w-full px-3.5 py-2.5 text-left transition-colors ${on ? 'ring-2 ring-haul-500' : 'hover:ring-1 hover:ring-haul-500/50'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: st.color }}>
                      {t.n}
                    </span>
                    <span className="font-semibold">Truck {t.n}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${st.color}1f`, color: st.color }}>
                      {st.label}
                    </span>
                    <span className={`ml-auto text-xs font-medium ${t.moving ? 'text-good-400' : 'text-t3'}`}>{t.moving ? '● Moving' : 'Stopped'}</span>
                  </div>
                  {(t.from || t.to) && (
                    <p className="mt-1 truncate text-base font-medium">
                      {t.from ?? '—'} → {t.to ?? '—'}
                    </p>
                  )}
                  <p className="mt-0.5 truncate text-sm text-t2">
                    {t.deliveryEta
                      ? `ETA ${t.deliveryEta}${t.milesLeft != null ? ` · ~${t.milesLeft.toLocaleString('en-US')} mi` : ''}`
                      : t.near
                        ? `Near ${t.near}`
                        : '—'}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="mt-3 text-xs text-t3">Positions are approximate (about 10 miles). ETA is an estimate with driver rest, Eastern Time.</p>
    </main>
  )
}
