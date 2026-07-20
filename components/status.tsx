import type { LoadStatus } from '@/lib/map'

export const STATUS_LABEL: Record<LoadStatus, string> = {
  quoted: 'Букинг',
  booked: 'Загрузка',
  in_transit: 'В пути',
  delivered: 'Доставлен',
  paid: 'Оплачен',
  cancelled: 'Отменён',
}

const STYLE: Record<LoadStatus, string> = {
  quoted: 'bg-white/8 text-white/72',
  booked: 'bg-haul-500/15 text-haul-400 ring-1 ring-haul-500/25',
  in_transit: 'bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/25',
  delivered: 'bg-violet-400/12 text-violet-300 ring-1 ring-violet-400/25',
  paid: 'bg-good-500/15 text-good-400 ring-1 ring-good-500/25',
  cancelled: 'bg-bad-500/10 text-bad-400/70',
}

export function StatusBadge({ status }: { status: LoadStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
