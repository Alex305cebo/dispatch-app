// The truck's day as a timeline — drive legs and stops, long rests called out.
// Pure presentation: lib/trip-history.ts does the actual clustering.

import type { HistoryLeg } from '@/lib/trip-history'
import { driveTime } from '@/lib/fmt'

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function TripHistory({ legs }: { legs: HistoryLeg[] }) {
  if (legs.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-white/55">
        Пока мало данных — история копится с каждым опросом ELD (раз в ~5 минут), за день-два
        здесь появится полная картина.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {legs.map((leg, i) => (
        <li
          key={i}
          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-[12.5px] ${
            leg.kind === 'stop' && leg.long
              ? 'border-warn-400/25 bg-warn-400/[0.06]'
              : 'border-white/6 bg-white/[0.015]'
          }`}
        >
          {leg.kind === 'drive' ? (
            <>
              <span className="shrink-0 text-white/40" aria-hidden>
                🚚
              </span>
              <span className="text-white/60">
                {timeOf(leg.from)}–{timeOf(leg.to)}
              </span>
              <span className="nums ml-auto shrink-0 font-medium text-white/85">
                {leg.miles} mi · {driveTime(leg.minutes)}
              </span>
            </>
          ) : (
            <>
              <span className="shrink-0" aria-hidden>
                {leg.long ? '🛏' : '⏸'}
              </span>
              <span className="min-w-0 flex-1 truncate text-white/75">
                {leg.long ? 'Долгий отдых' : 'Остановка'}
                {leg.location ? ` · ${leg.location}` : ''}
              </span>
              <span
                className={`nums ml-auto shrink-0 font-medium ${leg.long ? 'text-warn-400' : 'text-white/70'}`}
              >
                {timeOf(leg.from)}–{timeOf(leg.to)} · {driveTime(leg.minutes)}
              </span>
            </>
          )}
        </li>
      ))}
    </ol>
  )
}
