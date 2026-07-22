'use client'

// Thumbnail → full-screen lightbox instead of navigating to the raw image URL —
// clicking a driver's photo used to leave the chat entirely (no back/close, and
// inside the installed PWA there's no browser chrome to escape it with).
// Dense screenshots (a phone-shot of Google reviews, a rate con page) don't read
// when squeezed to fit, so the open image zooms on click and drags to pan.

import { useEffect, useRef, useState } from 'react'
import { notify } from '@/lib/notify'

export function TgImage({ src }: { src: string }) {
  const [open, setOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  // Non-null while a drag is in progress: the pointer's start minus the current
  // offset, so movement maps 1:1 to the pan without jumping on grab.
  const drag = useRef<{ x: number; y: number } | null>(null)
  // Set once the pointer actually moves, so the click that ends a pan doesn't
  // also toggle zoom. Read in onClick, reset on the next pointerdown.
  const moved = useRef(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function show() {
    setZoom(1)
    setPos({ x: 0, y: 0 })
    setOpen(true)
  }

  // Tap toggles between fit-to-screen and 2.5× so a screenshot's small text is
  // readable; re-centres when zooming back out.
  function toggleZoom() {
    setZoom((z) => (z > 1 ? 1 : 2.5))
    setPos({ x: 0, y: 0 })
  }

  return (
    <>
      <button type="button" onClick={show} className="mb-1 block">
        <img src={src} alt="Вложение" className="max-h-64 rounded-lg" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="absolute right-3 top-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <a
              href={src}
              download
              title="Скачать"
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-[15px] text-white/85 transition-colors hover:bg-white/20"
            >
              ⭳
            </a>
            <button
              type="button"
              title="Скопировать ссылку"
              onClick={() => {
                navigator.clipboard.writeText(location.origin + src)
                notify('ok', 'Ссылка скопирована')
              }}
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-[15px] text-white/85 transition-colors hover:bg-white/20"
            >
              🔗
            </button>
            <button
              type="button"
              title="Закрыть"
              onClick={() => setOpen(false)}
              className="flex size-9 items-center justify-center rounded-full bg-white/10 text-[15px] text-white/85 transition-colors hover:bg-white/20"
            >
              ✕
            </button>
          </div>

          <img
            src={src}
            alt="Вложение"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation()
              // A click that ended a pan shouldn't also toggle zoom.
              if (!moved.current) toggleZoom()
            }}
            onPointerDown={(e) => {
              if (zoom === 1) return
              e.stopPropagation()
              moved.current = false
              drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!drag.current) return
              moved.current = true
              setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })
            }}
            onPointerUp={() => {
              drag.current = null
            }}
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
              cursor: zoom > 1 ? 'grab' : 'zoom-in',
              touchAction: 'none',
            }}
            className="max-h-[85vh] max-w-[92vw] select-none rounded-lg object-contain"
          />

          <p className="text-[11px] text-white/55" onClick={(e) => e.stopPropagation()}>
            {zoom > 1 ? 'Тяните, чтобы двигать · нажмите, чтобы отдалить' : 'Нажмите на фото, чтобы приблизить'} · Escape
            или тап по фону — закрыть
          </p>
        </div>
      )}
    </>
  )
}
