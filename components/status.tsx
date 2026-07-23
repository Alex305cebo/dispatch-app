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
export const STATUS_STYLE: Record<LoadStatus, string> = {
  quoted: 'bg-white/8 text-white/72',
  booked: 'bg-haul-500/15 text-haul-400 ring-1 ring-haul-500/25',
  in_transit: 'bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25',
  delivered: 'bg-violet-400/12 text-violet-300 ring-1 ring-violet-400/25',
  paid: 'bg-good-500/15 text-good-400 ring-1 ring-good-500/25',
  cancelled: 'bg-bad-500/10 text-bad-400/70',
}

export function StatusBadge({ status, locale }: { status: LoadStatus; locale: Locale }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[status]}`}
    >
      {statusLabel(locale, status)}
    </span>
  )
}
