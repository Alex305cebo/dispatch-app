import {
  CalendarCheck,
  CircleCheckBig,
  CircleX,
  FileText,
  PackageCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import type { LoadStatus } from '@/lib/map'
import { t, type Locale, type MsgKey } from '@/lib/i18n'

const LABEL_KEY: Record<LoadStatus, MsgKey> = {
  quoted: 'status.quoted',
  booked: 'status.booked',
  in_transit: 'status.in_transit',
  delivered: 'status.delivered',
  paid: 'status.paid',
  cancelled: 'status.cancelled',
}

export function statusLabel(locale: Locale, status: LoadStatus): string {
  return t(locale, LABEL_KEY[status])
}

// Exported so other views (the status board) can tint by the same status colors
// instead of inventing a second color scheme that could drift from this one.
//
// Re-hued when the app's accent became violet: `booked` used to BE the accent and
// `delivered` a neighbouring violet, so the two states nearest each other in the
// workflow were also the two hardest to tell apart — and both looked like buttons.
// Statuses now avoid the accent hue entirely and run cyan → amber → fuchsia → green
// across the pipeline, which is the widest hue separation six states allow.
export const STATUS_STYLE: Record<LoadStatus, string> = {
  quoted: 'bg-white/8 text-white/70 ring-1 ring-white/10',
  booked: 'bg-cyan-400/12 text-cyan-300 ring-1 ring-cyan-400/25',
  in_transit: 'bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25',
  delivered: 'bg-fuchsia-400/12 text-fuchsia-300 ring-1 ring-fuchsia-400/25',
  paid: 'bg-good-500/15 text-good-400 ring-1 ring-good-500/25',
  cancelled: 'bg-bad-500/10 text-bad-400/70 ring-1 ring-bad-400/15',
}

// A glyph per state. Colour alone was carrying the whole meaning, which fails twice:
// for a colour-blind dispatcher, and for anyone scanning a long list quickly. The
// shape is legible before the tint registers.
export const STATUS_ICON: Record<LoadStatus, LucideIcon> = {
  quoted: FileText,
  booked: CalendarCheck,
  in_transit: Truck,
  delivered: PackageCheck,
  paid: CircleCheckBig,
  cancelled: CircleX,
}

export function StatusBadge({ status, locale }: { status: LoadStatus; locale: Locale }) {
  const Icon = STATUS_ICON[status]
  return (
    <span
      // shrink-0 + whitespace-nowrap: adding the icon made the badge wide enough that
      // a flex parent started shrinking it, and "В ПУТИ" wrapped onto two lines inside
      // its own pill. A status badge is an atom — it never wraps and never shrinks.
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2 text-2xs font-semibold uppercase tracking-wide ${STATUS_STYLE[status]}`}
    >
      <Icon size={11} strokeWidth={2.75} className="shrink-0" />
      {statusLabel(locale, status)}
    </span>
  )
}
