'use client'

// A click on a card navigates to a server-rendered page. Between the click and the
// new page painting, nothing on screen changed — on anything slower than localhost
// that reads as "the click didn't land", and people click again. useLinkStatus (Next
// 15.3+) reports the pending state of the nearest ancestor <Link>, so the card can
// answer for itself without a global router-events shim.
//
// Renders nothing at rest: no layout shift, no reserved gap, no spinner flashing on
// an instant prefetched navigation.

import { useLinkStatus } from 'next/link'

export function LinkPending({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`}
    />
  )
}
