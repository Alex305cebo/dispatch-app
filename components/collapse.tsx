// A collapsible group header. Built on native <details>/<summary> rather than React
// state so it works inside Server Components with no JS, no hydration and no layout
// flash — and so the browser's own find-in-page can still open a collapsed section.
//
// This exists because several screens rendered one flat, unbounded list: the finances
// tab printed every receivable in a single column, and the load board's status columns
// grew without limit. Both are fine with eight rows and unusable with eighty.

import { ChevronRight } from 'lucide-react'

export function Collapse({
  title,
  count,
  amount,
  tone = 'plain',
  defaultOpen = false,
  hint,
  children,
}: {
  title: string
  /** Rows inside — shown in the header so a collapsed group still states its size. */
  count?: number
  /** Pre-formatted sum, e.g. "$34,200". Shown right-aligned in the header. */
  amount?: string
  tone?: 'plain' | 'good' | 'warn' | 'bad'
  /** Open on first paint. Reserve this for groups that need acting on today. */
  defaultOpen?: boolean
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  const t = TONES[tone]
  return (
    <details open={defaultOpen} className={`group panel overflow-hidden ${t.edge}`}>
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 transition-colors hover:bg-white/[0.04] ${t.text}`}
      >
        {/* Rotates to point down when the group is open. `group-open:` reads the
            `open` attribute off the <details> that carries the `group` class. */}
        <ChevronRight
          size={14}
          strokeWidth={2.75}
          className="shrink-0 text-white/40 transition-transform duration-200 group-open:rotate-90"
        />
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider">
          <span className="truncate">{title}</span>
          {hint}
        </span>
        {count !== undefined && (
          <span className={`nums shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-bold ${t.chip}`}>
            {count}
          </span>
        )}
        {amount && <span className="nums shrink-0 text-base font-bold text-white/85">{amount}</span>}
      </summary>
      <div className="border-t border-white/8 p-2.5">{children}</div>
    </details>
  )
}

const TONES = {
  plain: { edge: '', text: 'text-white/60', chip: 'bg-white/10 text-white/70' },
  good: { edge: 'border-good-500/25', text: 'text-good-400', chip: 'bg-good-500/15 text-good-400' },
  warn: { edge: 'border-warn-400/30', text: 'text-warn-400', chip: 'bg-warn-400/15 text-warn-400' },
  bad: { edge: 'border-bad-500/30', text: 'text-bad-400', chip: 'bg-bad-500/15 text-bad-400' },
} as const

/**
 * Shows the first `limit` children inline and tucks the rest behind a "+N more"
 * toggle. For lists that are usually short but occasionally enormous — a status
 * column with six loads should not become a scrolling wall at sixty.
 */
export function ShowMore({
  items,
  limit = 6,
  label,
}: {
  items: React.ReactNode[]
  limit?: number
  /** Must contain "{n}" — replaced with the number of hidden rows. */
  label: string
}) {
  if (items.length <= limit) return <>{items}</>
  const hidden = items.length - limit
  return (
    <>
      {items.slice(0, limit)}
      <details className="group/more">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-1 rounded-lg border border-dashed border-white/12 py-1.5 text-2xs font-semibold uppercase tracking-wider text-white/50 transition-colors hover:border-white/25 hover:text-white/80">
          <ChevronRight
            size={12}
            strokeWidth={2.75}
            className="transition-transform duration-200 group-open/more:rotate-90"
          />
          {label.replace('{n}', String(hidden))}
        </summary>
        <div className="mt-1.5 flex flex-col gap-1.5">{items.slice(limit)}</div>
      </details>
    </>
  )
}
