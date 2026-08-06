'use client'

// The scrolling body of "Требуют внимания" on /loads.
//
// Lazy here means lazy RENDERING, not lazy fetching, and that distinction is the
// whole design: every flagged load is already in hand on the server (the page
// computes them from the loads it fetched anyway, and the driver sections below
// render every one of those loads regardless). Adding a server action to page them
// in would buy nothing — the bytes are already on the wire — while adding a
// round-trip, a loading state and a way to get out of sync.
//
// What it does buy: the list starts at PAGE rows instead of all of them, and grows
// only as far as the dispatcher actually scrolls. On a fleet with hundreds of
// flagged loads that is the difference between a few dozen DOM nodes and a few
// hundred on first paint.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export type AttentionItem = {
  id: number
  route: string
  /** Pre-translated on the server — the chip text, and whether it's a red one. */
  reasons: { label: string; bad: boolean }[]
}

const PAGE = 8

export function AttentionList({ items }: { items: AttentionItem[] }) {
  const [shown, setShown] = useState(Math.min(PAGE, items.length))
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinel.current
    if (!el || shown >= items.length) return
    // root:null — the observer measures against the viewport, which is correct even
    // though the list has its own scroll container: an overflow ancestor already
    // clips intersection, so the sentinel only reports visible once it is scrolled
    // into the container AND the container is on screen. rootMargin gives it a screen
    // of lead time so rows exist before they're reached, not after.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown((n) => Math.min(n + PAGE, items.length))
        }
      },
      { rootMargin: '160px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown, items.length])

  return (
    // Capped height, so the section can never push the actual dispatch board off the
    // screen — which is what a full list of 39 rows did before.
    <div className="max-h-[19rem] overflow-y-auto pr-1">
      <div className="flex flex-col gap-1.5">
        {items.slice(0, shown).map((it) => (
          <Link
            key={it.id}
            href={`/loads/${it.id}`}
            className="panel-inset panel-interactive flex items-center gap-2 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{it.route}</span>
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              {it.reasons.map((r) => (
                <span
                  key={r.label}
                  className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                    r.bad ? 'bg-bad-500/15 text-bad-400' : 'bg-warn-400/15 text-warn-400'
                  }`}
                >
                  {r.label}
                </span>
              ))}
            </span>
          </Link>
        ))}
        {/* Zero height at rest: it must not add a gap under the last row. */}
        {shown < items.length && <div ref={sentinel} aria-hidden className="h-px" />}
      </div>
    </div>
  )
}
