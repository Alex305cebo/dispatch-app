'use client'

// Fleet map: Leaflet + OpenStreetMap tiles — free, no key, same stack the ZigZag
// portal itself uses. Markers are divIcons (pure CSS/SVG), so no broken-image-asset
// dance under the bundler and they match the dark theme. A satellite layer (Esri
// World Imagery — also free, no key) is a straight swap of the tile URL.
//
// Icon design follows how Samsara/Motive/Verizon Connect actually draw fleet maps
// (researched, not guessed): shape AND color both carry state — a moving truck is a
// directional arrow, a stopped one is a circle, color separates idle from resting.
// No persistent text label per marker — at low zoom with a handful of trucks that's
// exactly what makes labels stack on top of each other. Identity lives in the click
// popup and in the list underneath the map, same as every product researched does.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/components/locale-provider'
import { t } from '@/lib/i18n'

export type MapMarker = {
  lat: number
  lng: number
  label: string // "2237 · Martinez Edwin" or "Delivery · Atlanta, GA"
  sub?: string // status / location line(s); '\n' splits into separate muted lines
  eta?: string // delivery hint, e.g. "145 mi · ~2ч 40м" — highlighted blue
  tone?: 'move' | 'on' | 'rest'
  kind?: 'truck' | 'dest' | 'pickup'
  heading?: number // 0-360, compass — rotates the moving-truck arrow to face it
  /** Where the plaque's "→ Открыть" arrow (and a click on the marker) leads — the
   * truck's card for a truck pin, the load's card for a pickup/delivery pin. */
  href?: string
}

export type MapRoute = {
  from: [number, number]
  to: [number, number]
  coords?: [number, number][] // road polyline; when absent we draw a straight line
}

// move=green/on=amber/rest=gray — the convergent pattern across Samsara, Verizon
// Connect and Motive's fleet maps. move is ZigZag's own #5AC41D (see the icon()
// comment below). Not red for "resting": a driver legally asleep in the sleeper
// berth is normal, not an alert.
const STATE_COLOR = { move: '#5AC41D', on: '#f59e0b', rest: '#8b93a5' }
// Destination follows the app's accent (haul-400) — destinations are a separate icon
// family, not a truck status. Pickup used to be violet #c084fc, which was a fine
// contrast against the OLD blue accent but collides head-on with the new violet one;
// on a map the two pins of a single load must never read as the same marker. Cyan
// keeps it clear of the accent AND of all three truck states (green/amber/grey).
const DEST = '#9b8eff'
const PICKUP = '#22d3ee'
const INK = '#0d0f15'

// MapTiler "Streets v2" renders proper US highway shields (I-90, US-41…) and cleaner,
// larger labels than raw OSM tiles — used when a key is configured. Without a key we fall
// back to plain OSM so the map still works (e.g. before the env var lands on the host).
// NEXT_PUBLIC_ so it's inlined into the client bundle at build time.
// Provider ladder, best first: Mapbox → MapTiler → plain OSM. Mapbox has the cleanest
// street typography and label density of the free tiers, so it wins when its token is set;
// MapTiler stays as the working fallback, and bare OSM keeps local dev alive with no keys
// at all. Both NEXT_PUBLIC_ — inlined into the client bundle at build time.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY
// 512px @2x tiles + tileSize 512/zoomOffset -1 (see tileOpts) is what both vendors want for
// retina: each fetched tile covers a zoom lower and is drawn at double size, so labels and
// highway shields come out large and crisp instead of the tiny 256-grid rendering.
const mapboxTiles = (style: string) =>
  `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`

const STREET_TILES = MAPBOX_TOKEN
  ? mapboxTiles('streets-v12')
  : MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}@2x.png?key=${MAPTILER_KEY}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
// Attribution is required by every one of these vendors' terms — kept to a compact credit.
const STREET_ATTRIB = MAPBOX_TOKEN
  ? '© Mapbox © OpenStreetMap'
  : MAPTILER_KEY
    ? '© MapTiler © OpenStreetMap'
    : '© OpenStreetMap'
// Hybrid: roads and labels drawn OVER the imagery. Esri (no key) is bare imagery, no roads.
const SATELLITE_TILES = MAPBOX_TOKEN
  ? mapboxTiles('satellite-streets-v12')
  : MAPTILER_KEY
    ? `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}@2x.jpg?key=${MAPTILER_KEY}`
    : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const SATELLITE_ATTRIB = MAPBOX_TOKEN
  ? '© Mapbox © OpenStreetMap'
  : MAPTILER_KEY
    ? '© MapTiler © OpenStreetMap'
    : '© Esri'

// Per-layer tile options. Mapbox and MapTiler both serve the @2x/512 retina grid; bare OSM
// and the Esri satellite stay on the plain 256 grid.
const RETINA = Boolean(MAPBOX_TOKEN || MAPTILER_KEY)
function tileOpts(sat: boolean) {
  const attribution = sat ? SATELLITE_ATTRIB : STREET_ATTRIB
  return RETINA ? { tileSize: 512, zoomOffset: -1, maxZoom: 20, attribution } : { maxZoom: 18, attribution }
}

/**
 * Street basemap is VECTOR: OpenFreeMap tiles (no API key, no signup, no request limits,
 * MIT, commercial use fine) rendered by MapLibre GL — the open-source fork of Mapbox GL.
 *
 * Vector is the whole point, not a fashion choice: in a raster tile every label and icon is
 * baked into the image, so the shop pins and exit numbers the owner wanted gone cannot be
 * removed at all. In a vector style each of those is its own layer we can simply switch off,
 * while keeping street names, house numbers, highway shields, place/water/park names and
 * admin boundaries.
 */
const VECTOR_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
/** Clutter to switch off: the shop/amenity pin layers, which in this style are exactly
 * poi_r1 / poi_r7 / poi_r20 / poi_transit. Anchored to the START of the id on purpose — a
 * bare /poi/ also matches "water_name_POINT_label" and would silently delete the lake and
 * river names the owner asked to keep. The little red exit numbers aren't a layer here at
 * all; they came from the old raster OSM tiles and are simply gone with the vector style. */
const HIDE_LAYER = /^poi/i

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Builds the base layer for the requested mode: vector street map, or the raster
 * satellite/hybrid. Falls back to raster street tiles if MapLibre can't load for any
 * reason, so the map never comes up blank. */
async function buildBaseLayer(L: any, sat: boolean): Promise<any> {
  if (sat) return L.tileLayer(SATELLITE_TILES, tileOpts(true))
  try {
    const maplibregl = (await import('maplibre-gl')).default
    // The Leaflet bridge reads maplibre-gl off the global, it doesn't import it itself.
    ;(window as any).maplibregl = maplibregl
    await import('@maplibre/maplibre-gl-leaflet')
    // attributionControl:false — MapLibre otherwise paints its own credit inside the WebGL
    // canvas, which Leaflet's attributionControl:false can't reach.
    const layer = L.maplibreGL({ style: VECTOR_STYLE, attributionControl: false })
    const tune = () => {
      const gl = layer.getMaplibreMap?.()
      const style = gl?.getStyle?.()
      if (!gl || !style?.layers) return

      for (const lyr of style.layers) {
        if (!HIDE_LAYER.test(lyr.id)) continue
        try {
          gl.setLayoutProperty(lyr.id, 'visibility', 'none')
        } catch {
          /* layer vanished between read and write — nothing to hide */
        }
      }

      // House numbers: the tiles carry them (OpenMapTiles "housenumber" source-layer) but
      // no OpenFreeMap style draws them, so add the layer ourselves — this is exactly what
      // vector buys us. Reuse a non-italic font the style already loads, otherwise the
      // glyph request 404s and the labels silently never appear.
      if (!gl.getLayer('housenumber-labels')) {
        const fonts = style.layers
          .map((l: any) => l.layout?.['text-font'])
          .filter((f: any): f is string[] => Array.isArray(f) && f.length > 0)
        const font = fonts.find((f: string[]) => !/italic/i.test(f[0]!)) ?? fonts[0] ?? ['Noto Sans Regular']
        try {
          gl.addLayer({
            id: 'housenumber-labels',
            type: 'symbol',
            source: 'openmaptiles',
            'source-layer': 'housenumber',
            minzoom: 17,
            layout: { 'text-field': ['get', 'housenumber'], 'text-font': font, 'text-size': 10 },
            paint: { 'text-color': '#5b6472', 'text-halo-color': '#ffffff', 'text-halo-width': 1 },
          })
        } catch {
          /* schema changed upstream — the map is still fine without door numbers */
        }
      }
    }
    layer.once('add', () => {
      const gl = layer.getMaplibreMap?.()
      if (!gl) return
      if (gl.isStyleLoaded?.()) tune()
      else gl.once('styledata', tune)
    })
    return layer
  } catch {
    return L.tileLayer(STREET_TILES, tileOpts(false))
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

// Compact popup — tight type scale, no wasted margin. Leaflet's own chrome
// (wrapper bg, tip, close button, maxWidth) is styled/sized in globals.css.
function popupHtml(m: MapMarker, openLabel: string): string {
  const lines = (m.sub ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => `<div style="color:#9aa3b2">${esc(l)}</div>`)
    .join('')
  const eta = m.eta
    ? `<div style="color:${DEST};font-weight:600;margin-top:3px">🎯 ${esc(m.eta)}</div>`
    : ''
  // The arrow: a clear "open the card" affordance. The tooltip is made interactive
  // and the whole plaque navigates (see the marker loop), so this doubles as the hint
  // and the visible click target.
  const open = m.href
    ? `<div style="display:flex;align-items:center;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);color:${DEST};font-weight:700">${esc(openLabel)} <span style="font-size:13px">→</span></div>`
    : ''
  return `<div style="font:500 10.5px/1.4 system-ui,sans-serif">
    <div style="font-weight:700;font-size:11.5px;color:#fff;margin-bottom:2px">${esc(m.label)}</div>
    ${lines}${eta}${open}
  </div>`
}

// A small side-view truck silhouette for the stopped states (circle) — reads as
// "truck" even at marker size, without pulling in an icon library for one glyph.
const truckSvg = (color: string) => `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
    <rect x="1" y="6" width="12" height="9" rx="1"/>
    <path d="M13 10h5.3l3.7 3.6V15h-9z"/>
    <rect x="16.2" y="10.7" width="2.6" height="2.1" fill="${color}"/>
    <circle cx="6.2" cy="17.8" r="2.1" fill="${INK}"/>
    <circle cx="17.3" cy="17.8" r="2.1" fill="${INK}"/>
  </svg>`

// Shared pin shape for address markers (delivery / pickup) — only the fill differs,
// so the two stay visually related while still being tellable apart at a glance.
function pin(color: string) {
  return {
    className: '',
    // width/height are load-bearing, not decoration: a bare block <div> inside
    // Leaflet's 0×0 icon container collapses to 0 width, which silently breaks
    // nothing here (no rotation on this pin) but is fixed for consistency with
    // the arrow below, where the same omission was a real, visible bug.
    html: `<div style="width:18px;height:22px;transform:translate(-9px,-22px)">
      <svg width="18" height="22" viewBox="0 0 18 22" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))">
        <path d="M9 0C4 0 0 4 0 9c0 6.5 9 13 9 13s9-6.5 9-13c0-5-4-9-9-9z" fill="${color}" stroke="${INK}" stroke-width="1.5"/>
        <circle cx="9" cy="9" r="3" fill="${INK}"/>
      </svg>
    </div>`,
    iconSize: [0, 0] as [number, number],
  }
}

function icon(L: typeof import('leaflet'), m: MapMarker) {
  // Plain address pins, deliberately not status colors — they mark places, not trucks.
  if (m.kind === 'dest') return L.divIcon(pin(DEST))
  if (m.kind === 'pickup') return L.divIcon(pin(PICKUP))

  const tone = m.tone ?? 'rest'
  const color = STATE_COLOR[tone]

  // Moving: ZigZag's own navigation-arrow glyph, pixel-for-pixel — pulled straight
  // from https://zigzageld.com/assets/svg/navigation-arrow.svg (path + #5AC41D fill
  // + white stroke, verified live against one of the fleet's own Live Share links,
  // since "make it like ZigZag" was the explicit ask, not "something arrow-shaped").
  // Rotated to the truck's actual heading when we know it.
  //
  // BUG THAT LIVED HERE: without an explicit width, this <div> is `display:block`
  // inside Leaflet's 0×0 icon container, so its computed width collapses to 0 —
  // `transform-origin`'s default 50% 50% then resolves to (0px, 13px), NOT the
  // visual center (13px, 13px). translate() doesn't care about transform-origin,
  // so the icon still LANDED on the right GPS point, but rotate() pivots around
  // that wrong point — the arrow visibly swung off the truck's real position by
  // however far the rotation carried it. Fixed by giving the div a real box (width
  // + height) so the default center-origin has something correct to measure from.
  if (tone === 'move') {
    const rotate = m.heading ?? 0
    return L.divIcon({
      className: '',
      html: `<div style="width:26px;height:26px;transform:translate(-13px,-13px) rotate(${rotate}deg)">
        <svg width="26" height="26" viewBox="0 0 45 45" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))">
          <path d="M18.9465 11.2667L18.9464 11.2668L10.0025 30.7504L10.0024 30.7508C8.27718 34.513 12.4432 38.2493 15.9955 36.1239L15.9956 36.1238L22.7877 32.0591L29.5501 36.1129L29.5506 36.1132C33.1029 38.2399 37.2723 34.5036 35.5464 30.7398L35.5462 30.7394L26.6052 11.2667C25.1019 7.99281 20.4497 7.99281 18.9465 11.2667Z" fill="${color}" stroke="white" stroke-width="2"/>
        </svg>
      </div>`,
      iconSize: [0, 0],
    })
  }

  // Idle / resting: same circle shape — dispatchers learn "circle = not moving"
  // once, and dim it for resting so it visually recedes vs. an idling truck.
  const size = 22
  const opacity = tone === 'rest' ? 0.8 : 1
  return L.divIcon({
    className: '',
    html: `<div style="opacity:${opacity};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid ${INK};box-shadow:0 1px 5px rgba(0,0,0,.5);transform:translate(-${size / 2}px,-${size / 2}px)">
      ${truckSvg(color)}
    </div>`,
    iconSize: [0, 0],
  })
}

// tone → live dot colour + status word. Shared by the single-truck pill and the fleet tally.
const TONE_KEY = {
  move: 'tracking.legendMoving',
  on: 'tracking.legendOnDuty',
  rest: 'tracking.legendStopped',
} as const

function StatusDot({ color, live }: { color: string; live: boolean }) {
  return (
    <span className="relative flex size-2.5 items-center justify-center">
      {/* animate-ping ring only while the truck is actually rolling — a small "it's live" cue. */}
      {live && (
        <span className="absolute inline-flex size-2.5 animate-ping rounded-full opacity-75" style={{ background: color }} />
      )}
      <span className="relative inline-flex size-2.5 rounded-full" style={{ background: color }} />
    </span>
  )
}

function LiveStatus({ trucks, locale }: { trucks: MapMarker[]; locale: ReturnType<typeof useLocale> }) {
  if (trucks.length === 0) return null
  const box =
    'absolute bottom-2.5 left-2.5 z-[1000] flex items-center rounded-full border border-white/15 bg-ink-950/85 backdrop-blur'

  if (trucks.length === 1) {
    const tone = trucks[0]!.tone ?? 'rest'
    return (
      <div className={`${box} gap-2 px-3 py-1.5`}>
        <StatusDot color={STATE_COLOR[tone]} live={tone === 'move'} />
        <span className="text-[12px] font-semibold text-white/85">{t(locale, TONE_KEY[tone])}</span>
      </div>
    )
  }

  const counts = { move: 0, on: 0, rest: 0 }
  for (const tk of trucks) counts[tk.tone ?? 'rest']++
  const shown = (['move', 'on', 'rest'] as const).filter((tone) => counts[tone] > 0)
  return (
    <div className={`${box} gap-3 px-3 py-1.5`}>
      {shown.map((tone) => (
        <span key={tone} className="flex items-center gap-1.5">
          <StatusDot color={STATE_COLOR[tone]} live={tone === 'move'} />
          <span className="nums text-[12px] font-semibold text-white/85">{counts[tone]}</span>
          <span className="text-[11px] text-white/50">{t(locale, TONE_KEY[tone])}</span>
        </span>
      ))}
    </div>
  )
}

export function FleetMap({
  markers,
  routes = [],
  height = 340,
  distanceMi = null,
}: {
  markers: MapMarker[]
  routes?: MapRoute[]
  height?: number
  /** Total road miles of the drawn route — shown big, over the map, when provided. */
  distanceMi?: number | null
}) {
  const locale = useLocale()
  const ref = useRef<HTMLDivElement>(null)
  const [satellite, setSatellite] = useState(false)
  // Read inside the map-build effect without making `satellite` one of its deps —
  // that effect only re-runs when the DATA changes, not the basemap choice.
  const satelliteRef = useRef(satellite)
  satelliteRef.current = satellite
  // Same pattern for the router — a marker/plaque click uses it to open the card,
  // without becoming a dep that rebuilds the whole map.
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const tileRef = useRef<import('leaflet').TileLayer | null>(null)

  // Builds the map from scratch — only when markers/routes actually change, never
  // on a satellite toggle. Rebuilding on every toggle was what reset the view.
  useEffect(() => {
    if (!ref.current || markers.length === 0) return
    let disposed = false
    // Dynamic import: leaflet touches window at module load, so it must never run
    // during SSR.
    let map: import('leaflet').Map | undefined
    void (async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css' as string).catch(() => {})
      if (disposed || !ref.current) return

      // Attribution control off at the owner's request (no on-map watermark). NOTE: the
      // tile sources (OpenFreeMap/OpenMapTiles/OSM data, MapTiler, Esri) technically require
      // a visible credit under their terms — this drops it deliberately.
      map = L.map(ref.current, { zoomControl: true, attributionControl: false })
      mapRef.current = map
      tileRef.current = (await buildBaseLayer(L, satelliteRef.current)).addTo(map)

      const bounds = L.latLngBounds([])
      // Draw route lines first so markers sit on top. A real road route (coords)
      // is a solid line following roads; the straight-line fallback is dashed.
      for (const r of routes) {
        const road = r.coords && r.coords.length > 1
        L.polyline(road ? r.coords! : [r.from, r.to], {
          color: DEST,
          weight: road ? 4 : 2,
          opacity: road ? 0.85 : 0.7,
          dashArray: road ? undefined : '6 7',
        }).addTo(map!)
        if (road) for (const c of r.coords!) bounds.extend(c)
      }
      for (const m of markers) {
        const marker = L.marker([m.lat, m.lng], { icon: icon(L, m) }).addTo(map!)
        // Tooltip, not Popup: shows on hover, hides the moment the cursor leaves — no
        // click, no lingering close button. NOT Leaflet-`interactive` on purpose: that
        // routes the click through Leaflet's target system, which swallowed our own
        // handler. Instead the plaque gets pointer-events via CSS (globals.css) and a
        // plain DOM click listener below — simplest thing that actually fires.
        marker.bindTooltip(popupHtml(m, t(locale, 'tracking.openArrow')), {
          direction: 'top',
          offset: [0, -8],
          opacity: 1,
        })
        if (m.href) {
          const href = m.href
          const go = () => routerRef.current.push(href)
          // Clicking the marker itself only focuses the map and opens the plaque —
          // it must NOT jump straight to the card. Only the plaque's own "Открыть →"
          // link (wired below, on tooltipopen) navigates. Also opens the tooltip
          // explicitly: touch devices have no hover, so a tap is the only way a
          // phone user ever sees the plaque (and its link) at all.
          marker.on('click', () => {
            map!.flyTo([m.lat, m.lng], Math.max(map!.getZoom(), 14), { duration: 0.6 })
            marker.openTooltip()
          })
          // Leaflet closes a hover tooltip the instant the cursor leaves the marker
          // dot — too soon to ever reach the plaque and click its arrow. Drop that
          // instant close and keep the plaque open while the cursor is over EITHER
          // the marker or the plaque, closing on a short delay once it leaves both.
          let closeT: ReturnType<typeof setTimeout> | undefined
          const scheduleClose = () => {
            closeT = setTimeout(() => marker.closeTooltip(), 160)
          }
          const keepOpen = () => {
            if (closeT) clearTimeout(closeT)
          }
          marker.off('mouseout')
          marker.on('mouseover', keepOpen)
          marker.on('mouseout', scheduleClose)
          marker.on('tooltipopen', (e) => {
            const el = (e as { tooltip: import('leaflet').Tooltip }).tooltip.getElement()
            if (!el) return
            el.style.cursor = 'pointer'
            el.addEventListener('mouseenter', keepOpen)
            el.addEventListener('mouseleave', scheduleClose)
            el.addEventListener('click', (ev) => {
              ev.stopPropagation()
              go()
            })
          })
        } else {
          // Plain address pins with no card behind them keep the focus-in zoom.
          marker.on('click', () => {
            map!.flyTo([m.lat, m.lng], Math.max(map!.getZoom(), 14), { duration: 0.6 })
          })
        }
        bounds.extend([m.lat, m.lng])
      }
      // maxZoom 13 (was 8): a single truck — the tracking view — now opens close enough
      // that OSM labels the interstates, highways and towns around it (street names come
      // in as you zoom further). A fleet spread across states still fits its own bounds at
      // a lower zoom, so this only tightens the single/clustered case.
      map.fitBounds(bounds.pad(0.2), { maxZoom: 13 })
    })()

    return () => {
      disposed = true
      map?.remove()
      mapRef.current = null
      tileRef.current = null
    }
  }, [markers, routes])

  // Swaps just the tile layer in place on a satellite toggle — no fitBounds, no
  // rebuild, so whatever the dispatcher panned/zoomed to survives the switch.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return // first mount: the build effect above already picks the right tiles
    void (async () => {
      const L = (await import('leaflet')).default
      const old = tileRef.current
      // Add the new layer FIRST and drop the old one only once the new tiles have painted.
      // remove-then-add blanked the map while the new tiles downloaded — that empty gap is
      // what read as a slow, flickery toggle. Tile panes sit below markers, so stacking two
      // briefly never hides the pins. Fallback timer in case some tiles never fire 'load'.
      const next = await buildBaseLayer(L, satellite)
      const dropOld = () => {
        if (old && map.hasLayer(old)) map.removeLayer(old)
      }
      next.once('load', dropOld)
      setTimeout(dropOld, 2500)
      next.addTo(map)
      tileRef.current = next
    })()
  }, [satellite])

  if (markers.length === 0) {
    return (
      <div className="panel flex items-center justify-center p-8 text-[13px] text-white/55">
        {t(locale, 'tracking.noCoordsPanel')}
      </div>
    )
  }

  return (
    <div className="fleet-map panel relative z-0 overflow-hidden" style={{ height }}>
      {/* Leaflet's own chrome (container bg, popup theme) is styled in globals.css
          under .fleet-map — Tailwind's arbitrary `[&_...]` variants don't reach this
          dynamically mounted tree in this build, see the comment there. */}
      <div ref={ref} className="h-full w-full" />
      {/* Total route distance, big and unmissable, over the map itself. */}
      {distanceMi != null && distanceMi > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-2.5 z-[1000] -translate-x-1/2 rounded-full border border-white/15 bg-ink-950/85 px-3.5 py-1.5 backdrop-blur">
          <span className="nums text-[17px] font-bold leading-none text-white">
            {Math.round(distanceMi).toLocaleString('en-US')}
          </span>
          <span className="ml-1 text-[12px] font-medium text-white/60">mi</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => setSatellite((v) => !v)}
        className="absolute right-2.5 top-2.5 z-[1000] rounded-lg border border-white/15 bg-ink-950/85 px-2.5 py-1.5 text-[11px] font-semibold text-white/85 backdrop-blur transition-colors hover:bg-ink-900"
      >
        {satellite ? t(locale, 'tracking.mapLabel') : t(locale, 'tracking.satelliteLabel')}
      </button>
      {/* Live status, not a passive colour key: one truck shows its own state as a
          pulsing pill (the dot pings while it's rolling); several show a live tally of how
          many are moving / on duty / stopped. Nothing when no truck is on the map. */}
      <LiveStatus trucks={markers.filter((m) => m.kind === 'truck')} locale={locale} />
    </div>
  )
}
