'use client'

// In-app document viewer. We draw PDF pages ourselves with pdf.js instead of linking
// to the file, because a plain link obeys the browser's "download PDFs instead of
// opening them" setting — which saves the file and opens the downloads folder rather
// than showing the document.
//
// Zoom follows the pdf.js viewer model (see mozilla/pdf.js examples):
//   • base scale = containerWidth / unscaledViewport.width  → the page fits the width
//   • zooming RE-RENDERS at the new scale (no CSS stretching, so it never blurs)
//   • canvas pixels are multiplied by devicePixelRatio and the render gets a matching
//     transform, so it stays sharp on hi-dpi screens
// The wheel is left alone: it scrolls, like everywhere else.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const MIN = 0.5
const MAX = 4

export function DocViewer({ id, mime }: { id: number; mime: string }) {
  const holder = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const docRef = useRef<any>(null)
  // Bumped on every render pass so a stale pass (older zoom) can bail out.
  const seq = useRef(0)

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  // Refs, not state: pan math runs every pointermove and doesn't need a re-render.
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  // Only this flips a class (grab -> grabbing), so it's the one bit that's state.
  const [grabbing, setGrabbing] = useState(false)

  const isPdf = mime.includes('pdf')

  const draw = useCallback(async (z: number) => {
    const doc = docRef.current
    const box = holder.current
    const container = area.current
    if (!doc || !box || !container) return

    const mine = ++seq.current
    const avail = container.clientWidth
    if (avail <= 0) return
    const outputScale = window.devicePixelRatio || 1

    const canvases: HTMLCanvasElement[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      if (seq.current !== mine) return
      // Fit the page to the available width, then apply the zoom multiplier.
      const unscaled = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: (avail / unscaled.width) * z })

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      canvas.className = 'mb-3 rounded-lg border border-white/10 bg-white'

      await page.render({
        canvas,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      }).promise
      if (seq.current !== mine) return
      canvases.push(canvas)
      // Swap in progressively so the first page shows while the rest render.
      box.replaceChildren(...canvases)
    }
  }, [])

  // Load once.
  useEffect(() => {
    if (!isPdf) return
    let cancelled = false

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const res = await fetch(`/api/docs/${id}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = new Uint8Array(await res.arrayBuffer())
        // Scanned rate cons are one big JPX/JBIG2 image; pdf.js needs its wasm decoders
        // to paint them, or the page comes out blank while render() reports success.
        const doc = await pdfjs.getDocument({
          data,
          wasmUrl: '/pdfjs/wasm/',
          iccUrl: '/pdfjs/iccs/',
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
        }).promise
        if (cancelled) return
        docRef.current = doc
        await draw(1)
        if (!cancelled) setState('ready')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
        setState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [id, isPdf, draw])

  // Re-render on zoom change and on resize (the fit-width base depends on width).
  useEffect(() => {
    if (state !== 'ready') return
    void draw(zoom)
  }, [zoom, state, draw])

  useEffect(() => {
    if (!isPdf) return
    let t: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(t)
      t = setTimeout(() => void draw(zoom), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', onResize)
    }
  }, [zoom, isPdf, draw])

  const step = (f: number) => setZoom((z) => Math.min(MAX, Math.max(MIN, z * f)))

  // Grab-to-pan: drag the document like a piece of paper. Mouse-only — touch already
  // gets native momentum-scroll for free, and hooking pointermove for it would fight
  // the browser's own gesture handling (see pdf.js's GrabToPan for the same tradeoff).
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = area.current
    if (!el || e.pointerType !== 'mouse' || e.button !== 0) return
    // Let normal clicks (links, buttons, form controls) through untouched.
    if ((e.target as HTMLElement).closest('a, button, input, textarea, select, option')) return
    dragging.current = true
    // area has no CSS height cap, so it only ever scrolls horizontally (that's real
    // overflow — the oversized zoomed page); vertically the *page* scrolls instead.
    // Pan each axis on whichever element actually owns its scroll.
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
    }
    // Capture so drags keep tracking past the element's edge, and prevent the native
    // image-drag-ghost (the <img> branch is otherwise natively draggable).
    el.setPointerCapture(e.pointerId)
    e.preventDefault()
    setGrabbing(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const el = area.current
    if (!el) return
    // Subtract the delta: dragging right/down slides the visible window left/up,
    // "grab the paper and slide it" rather than a scrollbar-drag.
    el.scrollLeft = dragStart.current.scrollLeft - (e.clientX - dragStart.current.x)
    const page = document.scrollingElement
    if (page) page.scrollTop = dragStart.current.scrollTop - (e.clientY - dragStart.current.y)
  }

  const endDrag = () => {
    dragging.current = false
    setGrabbing(false)
  }

  return (
    <>
      {/* Floating, see-through zoom. Fixed, so the document scrolls under it. */}
      <div className="fixed bottom-32 right-4 z-40 flex flex-col gap-2 md:bottom-8 md:right-6">
        {[
          { label: '+', f: 1.25, title: 'Увеличить' },
          { label: '−', f: 1 / 1.25, title: 'Уменьшить' },
        ].map((b) => (
          <button
            key={b.label}
            onClick={() => step(b.f)}
            aria-label={b.title}
            title={b.title}
            // Colours are hard-coded, not theme tokens: these sit ON TOP of the white
            // document page, so a "white" glyph would vanish there — and the light
            // theme flips --color-white to near-black, which would hide it again.
            // Dark translucent fill + white glyph + white hairline ring reads on both
            // a white page and a dark background.
            style={{
              background: 'rgba(15, 18, 24, 0.62)',
              color: '#ffffff',
              boxShadow:
                '0 0 0 1.5px rgba(255,255,255,0.55), 0 6px 20px rgba(0,0,0,0.45)',
            }}
            className="flex size-12 items-center justify-center rounded-full text-[24px] font-medium leading-none backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
          >
            {b.label}
          </button>
        ))}
      </div>

      {state === 'loading' && isPdf && (
        <p className="py-10 text-center text-[13px] text-white/55">Открываю документ…</p>
      )}
      {state === 'error' && (
        <p className="py-10 text-center text-[13px] text-bad-400">
          Не удалось показать документ{error ? `: ${error}` : ''}. Попробуй «Открыть в браузере».
        </p>
      )}

      {/* Scrolls in both directions once the zoomed page outgrows the window. */}
      <div
        ref={area}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`overflow-auto ${grabbing ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
      >
        {isPdf ? (
          // w-max + min-w-full is the fix for "the zoomed page is cut off": with plain
          // items-center an oversized child overflows BOTH sides and the left half
          // becomes unreachable — the scroll container only scrolls right. Sizing the
          // track to the content makes the whole page reachable, while min-w-full keeps
          // it centred while it still fits.
          <div ref={holder} className="mx-auto flex w-max min-w-full flex-col items-center" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/docs/${id}`}
            alt="Документ"
            style={{ width: `${zoom * 100}%` }}
            className="mx-auto rounded-xl border border-white/10"
          />
        )}
      </div>
    </>
  )
}
