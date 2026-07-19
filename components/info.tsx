'use client'

// Small ⓘ hint next to a function/button. Shows on hover (desktop) OR tap (mobile).
// The popover renders into <body> via a portal with viewport-clamped fixed coords,
// so it never overflows a screen edge or gets clipped by a panel's overflow/transform.
// Hover and click are separate states (hovered | pinned) so a click never fights a
// hover. Closes on outside-click, scroll, resize, or Escape.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Box = { top: number; left: number; width: number; placement: 'above' | 'below' }

export function Info({ text }: { text: string; side?: 'top' | 'bottom' }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [box, setBox] = useState<Box | null>(null)
  const open = hovered || pinned

  const place = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const m = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(288, vw - m * 2)
    const center = r.left + r.width / 2
    const left = Math.min(Math.max(center - width / 2, m), vw - width - m)
    const spaceBelow = vh - r.bottom
    const placement: 'above' | 'below' = spaceBelow > 150 || spaceBelow > r.top ? 'below' : 'above'
    const top = placement === 'below' ? r.bottom + 6 : r.top - 6
    setBox({ top, left, width, placement })
  }, [])

  useEffect(() => {
    if (!open) return
    const close = () => {
      setPinned(false)
      setHovered(false)
    }
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) close()
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    // Coords are viewport-fixed — close if the page scrolls or resizes under them.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Что это и как работает"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          place()
          setPinned((p) => !p)
        }}
        onMouseEnter={() => {
          place()
          setHovered(true)
        }}
        onMouseLeave={() => setHovered(false)}
        className="inline-flex size-[15px] shrink-0 items-center justify-center rounded-full border border-white/25 align-middle text-[10px] font-semibold leading-none text-white/55 transition-colors hover:border-haul-500 hover:text-haul-400"
      >
        i
      </button>

      {open &&
        box &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: 'fixed',
              top: box.top,
              left: box.left,
              width: box.width,
              transform: box.placement === 'above' ? 'translateY(-100%)' : undefined,
            }}
            className="pointer-events-none z-[100] rounded-lg border border-white/15 bg-ink-800 px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-white/90 shadow-xl"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  )
}
