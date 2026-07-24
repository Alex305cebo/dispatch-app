import { shortName } from '@/lib/fmt'

// A person's name: full on desktop, "First L." on a phone (<640px). Keeps names on one
// line on narrow screens without losing the full name where there's room. No 'use client'
// — it's pure markup, so server pages can render it directly.
export function Name({ full }: { full: string }) {
  const short = shortName(full)
  if (short === full) return <>{full}</>
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  )
}
