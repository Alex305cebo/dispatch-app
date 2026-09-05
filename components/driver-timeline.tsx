import { Send, Smartphone } from 'lucide-react'
import { Empty } from '@/components/empty'
import { Info } from '@/components/info'
import { t, type Locale } from '@/lib/i18n'
import type { LoadEvent } from '@/lib/load-events'

const KEY: Record<LoadEvent['kind'], string> = {
  arrived_pickup: 'driver.ev.arrivedPickup',
  loaded: 'driver.ev.loaded',
  arrived_delivery: 'driver.ev.arrivedDelivery',
  delivered: 'driver.ev.delivered',
  note: 'driver.ev.note',
  photo: 'driver.ev.photo',
}
const ICON: Record<LoadEvent['kind'], string> = {
  arrived_pickup: '📍',
  loaded: '🚚',
  arrived_delivery: '📍',
  delivered: '✅',
  note: '💬',
  photo: '📷',
}

const clock = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Хронология рейса от водителя на странице груза: что и когда он отметил.
 * Между «приехал» и «загрузился» — сколько простоял на складе. */
export function DriverTimeline({ events, locale, truckId }: { events: LoadEvent[]; locale: Locale; truckId: number }) {
  return (
    <section className="panel mt-4 p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/62">
        {t(locale, 'driver.timeline.heading')}
        <Info text={t(locale, 'driver.timeline.info')} />
      </h2>
      {events.length === 0 ? (
        <Empty
          row
          icon={Smartphone}
          title={t(locale, 'driver.timeline.noneTitle')}
          text={t(locale, 'driver.timeline.none')}
          action={{
            href: `/trucks/${truckId}`,
            label: t(locale, 'driver.timeline.noneCta'),
            icon: <Send size={14} strokeWidth={2.2} />,
          }}
        />
      ) : (
        <ol className="flex flex-col gap-1.5">
          {events.map((e, i) => {
            const prev = events[i - 1]
            // Время на складе: приехал → загрузился / приехал → выгрузился.
            const dwell =
              prev && ((prev.kind === 'arrived_pickup' && e.kind === 'loaded') || (prev.kind === 'arrived_delivery' && e.kind === 'delivered'))
                ? Math.round((Date.parse(e.at) - Date.parse(prev.at)) / 60_000)
                : null
            return (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="nums w-[7.5rem] shrink-0 text-white/45">{clock(e.at)}</span>
                <span className={e.kind === 'note' ? 'font-medium text-warn-300' : 'text-white/85'}>
                  {ICON[e.kind]} {t(locale, KEY[e.kind] as Parameters<typeof t>[1])}
                  {e.note ? `: ${e.note}` : ''}
                </span>
                {dwell != null && dwell > 0 && (
                  <span className={`nums text-[12px] ${dwell >= 120 ? 'text-bad-400' : 'text-white/45'}`}>
                    · {Math.floor(dwell / 60)}h {dwell % 60}m
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
